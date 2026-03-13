import uuid
from decimal import Decimal

from django.conf import settings
from django.db import IntegrityError, models, transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from products.models import Product
from users.models import AccountActivity
from users.permissions import IsApprovedVendor, IsMarketplaceAdmin, has_admin_permission
from users.rbac import log_admin_activity

from promotions.services import (
    get_product_pricing,
    increment_offer_order_metrics,
    reserve_promotional_units,
)

from .models import (
    MarketplacePayment,
    Order,
    OrderItem,
    PaymentMethod,
    ShippingAddress,
    VendorOrder,
    VendorPayoutRequest,
    VendorWallet,
)
from .serializers import (
    CustomerRefundSerializer,
    MarketplacePaymentSerializer,
    OrderSerializer,
    PaymentMethodSerializer,
    ShippingAddressSerializer,
    VendorOrderSerializer,
    VendorPayoutRequestSerializer,
    VendorWalletSerializer,
    VendorWalletTransactionSerializer,
)
from .mpesa import (
    initiate_b2c_disbursement,
    initiate_stk_push,
    mpesa_b2c_enabled,
    mpesa_live_enabled,
    normalize_phone_number,
    parse_b2c_result_payload,
    parse_stk_callback_payload,
)
from .services import (
    allocate_vendor_orders_for_order,
    confirm_marketplace_payment,
    ensure_vendor_wallet,
    get_earnings_release_policy,
    get_payout_mode,
    get_platform_mpesa_account_reference,
    get_stock_reservation_expiry,
    process_order_refund,
    process_payout_request_status,
    quantize_money,
    release_expired_stock_reservations,
    release_order_stock_reservation,
    release_vendor_earnings_for_order,
)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_order(request):
    user = request.user
    data = request.data
    idempotency_key = str(
        request.headers.get("Idempotency-Key")
        or data.get("idempotency_key")
        or ""
    ).strip()[:120]
    try:
        release_expired_stock_reservations(limit=200)

        if idempotency_key:
            existing_order = Order.objects.filter(user=user, idempotency_key=idempotency_key).order_by("-id").first()
            if existing_order:
                return Response(OrderSerializer(existing_order).data, status=status.HTTP_200_OK)

        cart_items = data.get("items") or data.get("order_items")
        shipping_address_id = data.get("shipping_address_id")
        fulfillment_method = str(data.get("fulfillment_method", "delivery")).strip().lower() or "delivery"
        pickup_station_id = data.get("pickup_station_id")
        if not cart_items or len(cart_items) == 0:
            return Response({"detail": "No Order Items"}, status=status.HTTP_400_BAD_REQUEST)
        if fulfillment_method not in {"delivery", "pickup"}:
            return Response({"detail": "Invalid fulfillment_method. Use delivery or pickup."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            pickup_station = None
            if fulfillment_method == "pickup":
                if not pickup_station_id:
                    raise ValidationError("pickup_station_id is required for pickup fulfillment.")
                try:
                    from pickup.models import PickupStation

                    pickup_station = PickupStation.objects.get(id=int(pickup_station_id), is_active=True, supports_pickup=True)
                except Exception:
                    raise ValidationError("Selected pickup station is unavailable.")

            if shipping_address_id:
                shipping_address = ShippingAddress.objects.get(id=shipping_address_id, user=user)
            else:
                full_name = (data.get("full_name") or f"{user.first_name} {user.last_name}".strip() or user.email).strip()
                phone_number = (data.get("phone_number") or data.get("phone") or "").strip()
                address_line_1 = (data.get("address_line_1") or data.get("address") or "").strip()
                city = (data.get("city") or "").strip()
                address_line_2 = (data.get("address_line_2") or "").strip() or None
                postal_code = (data.get("postal_code") or "").strip() or None
                country = (data.get("country") or "Kenya").strip()
                if not full_name or not phone_number or not address_line_1 or not city:
                    raise ValidationError("Shipping details are incomplete.")
                shipping_address = ShippingAddress.objects.create(
                    user=user,
                    full_name=full_name,
                    phone_number=phone_number,
                    address_line_1=address_line_1,
                    address_line_2=address_line_2,
                    city=city,
                    postal_code=postal_code,
                    country=country,
                    is_default=not ShippingAddress.objects.filter(user=user, is_default=True).exists(),
                )

            total_amount = Decimal("0.00")
            order_items_to_create = []
            for item_data in cart_items:
                product_id = item_data.get("product_id") or item_data.get("product")
                sale_option_id = item_data.get("sale_option_id") or item_data.get("quantity_option_id")
                if not product_id:
                    raise ValidationError("Each order item must include a product id.")
                try:
                    quantity = int(item_data.get("quantity", 0))
                except (TypeError, ValueError):
                    raise ValidationError("Each order item quantity must be a valid number.")
                if quantity <= 0:
                    raise ValidationError("Each order item quantity must be greater than 0.")

                product = Product.objects.select_related("vendor").get(id=product_id)
                if not product.is_active or not product.vendor.is_approved:
                    raise ValidationError(f"{product.title} is currently unavailable.")
                selected_option = product.resolve_sale_option(sale_option_id)
                stock_units_per_purchase = selected_option.stock_units_consumed if selected_option else 1
                total_stock_required = stock_units_per_purchase * quantity
                if product.stock < total_stock_required:
                    available_purchase_units = product.stock // max(stock_units_per_purchase, 1)
                    option_label = selected_option.label if selected_option else product.base_unit_label
                    raise ValidationError(
                        f"Not enough stock for {product.title} ({option_label}). Available: {available_purchase_units}, Requested: {quantity}"
                    )
                option_unit_price = product.get_unit_price_for_option(selected_option)
                pricing = get_product_pricing(product, quantity=quantity, unit_price=option_unit_price)
                offer = pricing.get("offer")
                promotional_units = int(pricing.get("promotional_units") or 0)
                regular_units = int(pricing.get("regular_units") or 0)

                if offer and promotional_units > 0:
                    reserved = reserve_promotional_units(offer, promotional_units)
                    if not reserved:
                        pricing = get_product_pricing(product, quantity=quantity, offer=None)
                        offer = pricing.get("offer")
                        promotional_units = int(pricing.get("promotional_units") or 0)
                        regular_units = int(pricing.get("regular_units") or 0)

                if offer and promotional_units > 0:
                    discounted_price = quantize_money(pricing["effective_unit_price"])
                    line_total = quantize_money(discounted_price * promotional_units)
                    total_amount = quantize_money(total_amount + line_total)
                    order_items_to_create.append(
                        {
                            "product": product,
                            "quantity": promotional_units,
                            "price_at_purchase": discounted_price,
                            "original_price": quantize_money(pricing["base_unit_price"]),
                            "promotion_offer": offer,
                            "sale_option": selected_option,
                            "sale_option_label": selected_option.label if selected_option else "",
                            "sale_option_quantity_value": selected_option.quantity_value if selected_option else None,
                            "sale_option_quantity_unit": selected_option.quantity_unit if selected_option else "",
                            "sale_option_stock_units_consumed": stock_units_per_purchase,
                            "stock_units_total": promotional_units * stock_units_per_purchase,
                        }
                    )
                    increment_offer_order_metrics(offer, promotional_units, line_total)

                if regular_units > 0:
                    regular_price = quantize_money(pricing["base_unit_price"])
                    line_total = quantize_money(regular_price * regular_units)
                    total_amount = quantize_money(total_amount + line_total)
                    order_items_to_create.append(
                        {
                            "product": product,
                            "quantity": regular_units,
                            "price_at_purchase": regular_price,
                            "original_price": regular_price,
                            "promotion_offer": None,
                            "sale_option": selected_option,
                            "sale_option_label": selected_option.label if selected_option else "",
                            "sale_option_quantity_value": selected_option.quantity_value if selected_option else None,
                            "sale_option_quantity_unit": selected_option.quantity_unit if selected_option else "",
                            "sale_option_stock_units_consumed": stock_units_per_purchase,
                            "stock_units_total": regular_units * stock_units_per_purchase,
                        }
                    )

            order = Order.objects.create(
                user=user,
                shipping_address=shipping_address,
                total_amount=total_amount,
                status="Pending",
                is_paid=False,
                idempotency_key=idempotency_key or None,
                stock_reservation_expires_at=get_stock_reservation_expiry(),
                fulfillment_method=fulfillment_method,
                pickup_station=pickup_station,
            )
            stock_updates: dict[int, dict] = {}
            for item in order_items_to_create:
                OrderItem.objects.create(
                    order=order,
                    product=item["product"],
                    quantity=item["quantity"],
                    price_at_purchase=item["price_at_purchase"],
                    original_price=item.get("original_price"),
                    promotion_offer=item.get("promotion_offer"),
                    sale_option=item.get("sale_option"),
                    sale_option_label=item.get("sale_option_label") or "",
                    sale_option_quantity_value=item.get("sale_option_quantity_value"),
                    sale_option_quantity_unit=item.get("sale_option_quantity_unit") or "",
                    sale_option_stock_units_consumed=item.get("sale_option_stock_units_consumed") or 1,
                )
                stock_item = item["product"]
                if stock_item.id not in stock_updates:
                    stock_updates[stock_item.id] = {"product": stock_item, "qty": 0}
                stock_updates[stock_item.id]["qty"] += item["stock_units_total"]

            for stock_payload in stock_updates.values():
                stock_item = stock_payload["product"]
                stock_item.stock -= stock_payload["qty"]
                stock_item.save(update_fields=["stock", "updated_at"])

        AccountActivity.objects.create(
            user=user,
            activity_type="order_create",
            description=f"Created order {order.order_number}.",
            metadata={"order_number": order.order_number, "total_amount": str(order.total_amount), "item_count": len(order_items_to_create), "payment_status": "pending"},
        )
        from receipts.services import issue_receipt_safe

        issue_receipt_safe(
            category="customer",
            receipt_type="customer_order",
            owner_type="customer",
            owner_user=user,
            actor=user,
            customer=user,
            order=order,
            related_entity_type="order",
            related_entity_id=str(order.id),
            related_reference=order.order_number,
            gross_amount=order.total_amount,
            net_amount=order.total_amount,
            payment_method="pending_payment",
            summary={
                "order_number": order.order_number,
                "fulfillment_method": order.fulfillment_method,
                "item_count": len(order_items_to_create),
                "order_status": order.status,
                "payment_status": "pending",
            },
            event_key=f"order_created:{order.id}",
        )
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)
    except IntegrityError:
        if idempotency_key:
            existing_order = Order.objects.filter(user=user, idempotency_key=idempotency_key).order_by("-id").first()
            if existing_order:
                return Response(OrderSerializer(existing_order).data, status=status.HTTP_200_OK)
        return Response({"detail": "Duplicate checkout request detected. Please retry."}, status=status.HTTP_409_CONFLICT)
    except ValidationError as e:
        return Response({"detail": e.detail}, status=status.HTTP_400_BAD_REQUEST)
    except ValueError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except ShippingAddress.DoesNotExist:
        return Response({"detail": "Invalid shipping address or address does not belong to user."}, status=status.HTTP_400_BAD_REQUEST)
    except Product.DoesNotExist:
        return Response({"detail": "An invalid product was found in the cart."}, status=status.HTTP_400_BAD_REQUEST)
    except Exception:
        return Response({"detail": "Failed to create order."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def initiate_mpesa_payment(request):
    order_id = request.data.get("order_id")
    phone_number = str(request.data.get("phone_number", "")).strip()
    idempotency_key = str(
        request.headers.get("Idempotency-Key")
        or request.data.get("idempotency_key")
        or ""
    ).strip()[:120]
    if not order_id:
        return Response({"detail": "order_id is required."}, status=status.HTTP_400_BAD_REQUEST)
    if len("".join(ch for ch in phone_number if ch.isdigit())) < 9:
        return Response({"detail": "A valid M-Pesa phone number is required."}, status=status.HTTP_400_BAD_REQUEST)
    release_expired_stock_reservations(limit=200)
    try:
        order = Order.objects.get(id=order_id, user=request.user)
    except Order.DoesNotExist:
        return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
    if (
        not order.is_paid
        and order.stock_released_at is None
        and order.stock_reservation_expires_at
        and order.stock_reservation_expires_at <= timezone.now()
    ):
        release_order_stock_reservation(order, reason="reservation_expired_before_payment")
        return Response({"detail": "Order reservation expired before payment. Please checkout again."}, status=status.HTTP_400_BAD_REQUEST)
    if order.stock_released_at and not order.is_paid:
        return Response({"detail": "Order reservation expired. Please place a new order."}, status=status.HTTP_400_BAD_REQUEST)
    if order.is_paid:
        existing = order.marketplace_payments.filter(status="confirmed").order_by("-id").first()
        return Response({"detail": "Order is already paid.", "payment": MarketplacePaymentSerializer(existing).data if existing else {}}, status=status.HTTP_200_OK)

    if idempotency_key:
        existing_payment = MarketplacePayment.objects.filter(
            customer=request.user,
            idempotency_key=idempotency_key,
        ).order_by("-initiated_at").first()
        if existing_payment:
            return Response(
                {
                    "detail": "Payment request already processed for this idempotency key.",
                    "platform_collection_account": get_platform_mpesa_account_reference(),
                    "payment": MarketplacePaymentSerializer(existing_payment).data,
                },
                status=status.HTTP_200_OK,
            )

    active_payment = order.marketplace_payments.filter(status__in=["initiated", "pending_confirmation"]).order_by("-id").first()
    if active_payment:
        active_payment.phone_number = phone_number
        active_payment.status = "pending_confirmation"
        if idempotency_key and not active_payment.idempotency_key:
            active_payment.idempotency_key = idempotency_key
            active_payment.save(update_fields=["phone_number", "status", "idempotency_key"])
        else:
            active_payment.save(update_fields=["phone_number", "status"])
        return Response({"detail": "Payment request already in progress.", "platform_collection_account": get_platform_mpesa_account_reference(), "payment": MarketplacePaymentSerializer(active_payment).data}, status=status.HTTP_200_OK)

    try:
        payment = MarketplacePayment.objects.create(
            order=order,
            customer=request.user,
            provider="mpesa",
            payment_channel="mpesa_stk",
            amount=order.total_amount,
            currency="KES",
            phone_number=phone_number,
            status="pending_confirmation",
            merchant_request_id=f"MR-{uuid.uuid4().hex[:18].upper()}",
            checkout_request_id=f"CR-{uuid.uuid4().hex[:18].upper()}",
            metadata={"platform_collection_account": get_platform_mpesa_account_reference(), "checkout_origin": "web"},
            idempotency_key=idempotency_key or None,
        )
    except IntegrityError:
        if idempotency_key:
            existing_payment = MarketplacePayment.objects.filter(
                customer=request.user,
                idempotency_key=idempotency_key,
            ).order_by("-initiated_at").first()
            if existing_payment:
                return Response(
                    {
                        "detail": "Payment request already processed for this idempotency key.",
                        "platform_collection_account": get_platform_mpesa_account_reference(),
                        "payment": MarketplacePaymentSerializer(existing_payment).data,
                    },
                    status=status.HTTP_200_OK,
                )
        return Response({"detail": "Duplicate payment request detected. Please retry."}, status=status.HTTP_409_CONFLICT)
    if mpesa_live_enabled():
        try:
            live_response = initiate_stk_push(
                phone_number=phone_number,
                amount=order.total_amount,
                account_reference=get_platform_mpesa_account_reference(),
                transaction_desc=f"Order {order.order_number}",
            )
            payment.merchant_request_id = live_response.get("MerchantRequestID") or payment.merchant_request_id
            payment.checkout_request_id = live_response.get("CheckoutRequestID") or payment.checkout_request_id
            payment.result_code = str(live_response.get("ResponseCode", "0"))
            payment.result_desc = str(
                live_response.get("CustomerMessage")
                or live_response.get("ResponseDescription")
                or "STK push initiated."
            )[:255]
            payment.metadata = {
                **(payment.metadata or {}),
                "mpesa_stk_response": live_response,
                "mpesa_live": True,
            }
            payment.save(
                update_fields=[
                    "merchant_request_id",
                    "checkout_request_id",
                    "result_code",
                    "result_desc",
                    "metadata",
                ]
            )
        except Exception as exc:
            payment.status = "failed"
            payment.result_desc = str(exc)[:255]
            payment.save(update_fields=["status", "result_desc", "updated_at"])
            return Response({"detail": f"M-Pesa STK push failed: {exc}"}, status=status.HTTP_502_BAD_GATEWAY)
    return Response(
        {"detail": "STK push initiated successfully. Confirm PIN on customer phone.", "platform_collection_account": get_platform_mpesa_account_reference(), "payment": MarketplacePaymentSerializer(payment).data},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def mpesa_payment_callback(request):
    payload = request.data if isinstance(request.data, dict) else {}
    parsed = parse_stk_callback_payload(payload)
    checkout_request_id = parsed.get("checkout_request_id") or payload.get("checkout_request_id") or payload.get("CheckoutRequestID")
    if not checkout_request_id:
        return Response({"detail": "checkout_request_id is required."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        payment = MarketplacePayment.objects.select_related("order", "customer").get(checkout_request_id=checkout_request_id)
    except MarketplacePayment.DoesNotExist:
        return Response({"detail": "Payment not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(confirm_marketplace_payment(payment, parsed or payload), status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def mpesa_b2c_result_callback(request):
    payload = request.data if isinstance(request.data, dict) else {}
    parsed = parse_b2c_result_payload(payload)
    conversation_id = parsed.get("conversation_id")
    originator_id = parsed.get("originator_conversation_id")
    if not conversation_id and not originator_id:
        return Response({"detail": "Invalid B2C callback payload."}, status=status.HTTP_400_BAD_REQUEST)

    payout = None
    if originator_id:
        payout = VendorPayoutRequest.objects.filter(external_reference=originator_id).order_by("-id").first()
    if not payout and conversation_id:
        payout = VendorPayoutRequest.objects.filter(external_reference=conversation_id).order_by("-id").first()
    if not payout:
        return Response({"detail": "Payout request not found for callback reference."}, status=status.HTTP_404_NOT_FOUND)

    result_code = str(parsed.get("result_code", ""))
    if result_code == "0":
        if payout.status != "paid":
            process_payout_request_status(
                payout,
                action="mark_paid",
                actor=None,
                notes="Automated M-Pesa B2C callback confirmed payout.",
                external_reference=parsed.get("transaction_id") or payout.external_reference or "",
            )
    else:
        payout.status = "failed"
        payout.reviewed_at = timezone.now()
        payout.notes = (f"{payout.notes}\n" if payout.notes else "") + f"B2C payout failed: {parsed.get('result_desc', 'Unknown error')}"
        payout.metadata = {
            **(payout.metadata or {}),
            "b2c_callback": parsed.get("raw") or payload,
            "b2c_failure_code": result_code,
        }
        payout.save(update_fields=["status", "reviewed_at", "notes", "metadata"])

    return Response({"ResultCode": 0, "ResultDesc": "Accepted"})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mock_confirm_mpesa_payment(request, payment_id: int):
    try:
        payment = MarketplacePayment.objects.select_related("order", "customer").get(id=payment_id)
    except MarketplacePayment.DoesNotExist:
        return Response({"detail": "Payment not found."}, status=status.HTTP_404_NOT_FOUND)
    can_access = payment.customer_id == request.user.id or (request.user.role == "admin" and has_admin_permission(request.user, "payments.manage"))
    if not can_access:
        return Response({"detail": "Not authorized for this payment."}, status=status.HTTP_403_FORBIDDEN)
    callback_payload = {
        "checkout_request_id": payment.checkout_request_id,
        "merchant_request_id": payment.merchant_request_id,
        "result_code": "0",
        "result_desc": "The service request is processed successfully.",
        "transaction_id": f"TXN-{uuid.uuid4().hex[:16].upper()}",
        "mpesa_receipt_number": f"MP{uuid.uuid4().hex[:10].upper()}",
    }
    return Response(confirm_marketplace_payment(payment, callback_payload), status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_marketplace_payments(request):
    queryset = MarketplacePayment.objects.filter(customer=request.user).select_related("order").order_by("-initiated_at")
    return Response(MarketplacePaymentSerializer(queryset, many=True).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsMarketplaceAdmin])
def get_all_orders(request):
    if not has_admin_permission(request.user, "orders.view"):
        return Response({"detail": "Missing permission: orders.view"}, status=status.HTTP_403_FORBIDDEN)
    release_expired_stock_reservations(limit=300)
    return Response(OrderSerializer(Order.objects.all().order_by("-id"), many=True).data)


@api_view(["PATCH"])
@permission_classes([IsMarketplaceAdmin])
def admin_order_detail(request, order_id: int):
    if not has_admin_permission(request.user, "orders.edit"):
        return Response({"detail": "Missing permission: orders.edit"}, status=status.HTTP_403_FORBIDDEN)
    try:
        order = Order.objects.select_related("shipping_address", "user").get(id=order_id)
    except Order.DoesNotExist:
        return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

    previous_status = order.status
    previous_paid = order.is_paid
    allowed_statuses = {choice[0] for choice in Order.STATUS_CHOICES}
    new_status = request.data.get("status")
    is_paid = request.data.get("is_paid")
    if new_status is not None:
        new_status = str(new_status).strip()
        if new_status not in allowed_statuses:
            return Response({"detail": "Invalid order status."}, status=status.HTTP_400_BAD_REQUEST)
        order.status = new_status
    if is_paid is not None:
        is_paid_bool = is_paid.lower() in {"1", "true", "yes"} if isinstance(is_paid, str) else bool(is_paid)
        order.is_paid = is_paid_bool
        order.paid_at = timezone.now() if is_paid_bool else None
        order.payment_verified_at = timezone.now() if is_paid_bool else None
    order.save(update_fields=["status", "is_paid", "paid_at", "payment_verified_at", "updated_at"])
    if order.is_paid and not previous_paid:
        payment = order.marketplace_payments.filter(status="confirmed").order_by("-id").first()
        allocate_vendor_orders_for_order(order, payment=payment)
    if previous_status != "Delivered" and order.status == "Delivered":
        release_vendor_earnings_for_order(order)
    log_admin_activity(actor=request.user, action="order.update", description=f"Updated order {order.order_number}.", target_type="Order", target_id=str(order.id), metadata={"status_from": previous_status, "status_to": order.status, "is_paid_from": previous_paid, "is_paid_to": order.is_paid})
    from receipts.services import issue_receipt_safe

    issue_receipt_safe(
        category="admin",
        receipt_type="admin_override",
        owner_type="admin",
        owner_user=request.user,
        actor=request.user,
        order=order,
        customer=order.user,
        related_entity_type="order_override",
        related_entity_id=str(order.id),
        related_reference=order.order_number,
        gross_amount=order.total_amount,
        net_amount=order.total_amount,
        payment_method="admin_action",
        summary={
            "status_from": previous_status,
            "status_to": order.status,
            "is_paid_from": previous_paid,
            "is_paid_to": order.is_paid,
        },
        event_key=f"admin_order_update:{order.id}:{order.updated_at.isoformat()}",
    )
    return Response(OrderSerializer(order).data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsMarketplaceAdmin])
def admin_release_expired_reservations(request):
    if not has_admin_permission(request.user, "orders.edit"):
        return Response({"detail": "Missing permission: orders.edit"}, status=status.HTTP_403_FORBIDDEN)

    limit_raw = request.data.get("limit", 500)
    try:
        limit = int(limit_raw)
    except (TypeError, ValueError):
        limit = 500
    released_count = release_expired_stock_reservations(limit=limit)
    return Response(
        {
            "released_orders": released_count,
            "detail": f"Released {released_count} expired stock reservation(s).",
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsMarketplaceAdmin])
def admin_marketplace_payments(request):
    if not has_admin_permission(request.user, "finance.view"):
        return Response({"detail": "Missing permission: finance.view"}, status=status.HTTP_403_FORBIDDEN)
    status_filter = str(request.query_params.get("status", "")).strip()
    query = str(request.query_params.get("q", "")).strip()
    queryset = MarketplacePayment.objects.select_related("order", "customer").all()
    if status_filter:
        queryset = queryset.filter(status=status_filter)
    if query:
        queryset = queryset.filter(
            models.Q(order__order_number__icontains=query)
            | models.Q(customer__email__icontains=query)
            | models.Q(transaction_id__icontains=query)
            | models.Q(mpesa_receipt_number__icontains=query)
            | models.Q(checkout_request_id__icontains=query)
        )
    return Response(MarketplacePaymentSerializer(queryset.order_by("-initiated_at")[:500], many=True).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsMarketplaceAdmin])
def admin_vendor_orders(request):
    if not has_admin_permission(request.user, "finance.view"):
        return Response({"detail": "Missing permission: finance.view"}, status=status.HTTP_403_FORBIDDEN)
    status_filter = str(request.query_params.get("status", "")).strip()
    payout_filter = str(request.query_params.get("payout_status", "")).strip()
    query = str(request.query_params.get("q", "")).strip()
    queryset = VendorOrder.objects.select_related("order", "order__user", "vendor", "vendor__user").all()
    if status_filter:
        queryset = queryset.filter(status=status_filter)
    if payout_filter:
        queryset = queryset.filter(payout_status=payout_filter)
    if query:
        queryset = queryset.filter(
            models.Q(order__order_number__icontains=query)
            | models.Q(order_reference__icontains=query)
            | models.Q(vendor__store_name__icontains=query)
            | models.Q(vendor__user__email__icontains=query)
        )
    return Response(VendorOrderSerializer(queryset.order_by("-created_at")[:500], many=True).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsMarketplaceAdmin])
def admin_finance_dashboard(request):
    if not has_admin_permission(request.user, "finance.view"):
        return Response({"detail": "Missing permission: finance.view"}, status=status.HTTP_403_FORBIDDEN)
    release_expired_stock_reservations(limit=500)
    from .models import CustomerRefund

    total_collected = quantize_money(
        MarketplacePayment.objects.filter(status="confirmed").aggregate(total=Sum("amount")).get("total") or Decimal("0.00")
    )
    orders_gross_value = quantize_money(
        Order.objects.exclude(status="Cancelled").aggregate(total=Sum("total_amount")).get("total") or Decimal("0.00")
    )
    orders_unpaid_value = quantize_money(
        Order.objects.filter(is_paid=False).exclude(status="Cancelled").aggregate(total=Sum("total_amount")).get("total")
        or Decimal("0.00")
    )
    orders_paid_value = quantize_money(
        Order.objects.filter(is_paid=True).exclude(status="Cancelled").aggregate(total=Sum("total_amount")).get("total")
        or Decimal("0.00")
    )
    orders_open_count = Order.objects.exclude(status__in=["Delivered", "Cancelled"]).count()
    total_commission = quantize_money(
        VendorOrder.objects.aggregate(total=Sum("platform_commission_amount")).get("total") or Decimal("0.00")
    )
    total_vendor_net = quantize_money(
        VendorOrder.objects.aggregate(total=Sum("vendor_earning_amount")).get("total") or Decimal("0.00")
    )
    total_paid_out = quantize_money(
        VendorPayoutRequest.objects.filter(status="paid").aggregate(total=Sum("amount")).get("total") or Decimal("0.00")
    )
    total_refunds = quantize_money(
        CustomerRefund.objects.filter(status="completed").aggregate(total=Sum("amount")).get("total") or Decimal("0.00")
    )
    wallet_available_liability = quantize_money(
        VendorWallet.objects.aggregate(total=Sum("available_balance")).get("total") or Decimal("0.00")
    )
    wallet_pending_liability = quantize_money(
        VendorWallet.objects.aggregate(total=Sum("pending_balance")).get("total") or Decimal("0.00")
    )
    merchant_account_balance = quantize_money(total_collected - total_paid_out - total_refunds)
    totals = {
        "marketplace_revenue_collected": total_collected,
        "orders_gross_value": orders_gross_value,
        "orders_unpaid_value": orders_unpaid_value,
        "orders_paid_value": orders_paid_value,
        "platform_commission_earned": total_commission,
        "vendor_net_earnings": total_vendor_net,
        "vendor_payouts_completed": total_paid_out,
        "refunds_total": total_refunds,
        "merchant_account_balance": merchant_account_balance,
        "vendor_wallet_available_liability": wallet_available_liability,
        "vendor_wallet_pending_liability": wallet_pending_liability,
    }
    return Response(
        {
            "totals": {k: str(v) for k, v in totals.items()},
            "payout_config": {
                "mode": get_payout_mode(),
                "earnings_release_policy": str(getattr(settings, "MARKETPLACE_EARNINGS_RELEASE_POLICY", "on_payment")).strip().lower(),
            },
            "open_items": {
                "pending_payout_requests": VendorPayoutRequest.objects.filter(status__in=["requested", "approved", "under_review"]).count(),
                "payment_disputes_or_failed": MarketplacePayment.objects.filter(status__in=["failed", "reversed"]).count(),
                "open_orders_count": orders_open_count,
            },
            "reports": {
                "latest_payments": MarketplacePaymentSerializer(MarketplacePayment.objects.select_related("order", "customer").order_by("-initiated_at")[:20], many=True).data,
                "latest_payouts": VendorPayoutRequestSerializer(VendorPayoutRequest.objects.select_related("vendor", "vendor__user", "wallet").order_by("-requested_at")[:20], many=True).data,
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsMarketplaceAdmin])
def admin_order_refund(request, order_id: int):
    if not (has_admin_permission(request.user, "orders.approve") or has_admin_permission(request.user, "finance.manage")):
        return Response({"detail": "Missing permission: orders.approve or finance.manage"}, status=status.HTTP_403_FORBIDDEN)
    try:
        order = Order.objects.select_related("user").get(id=order_id)
    except Order.DoesNotExist:
        return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
    if not order.is_paid:
        return Response({"detail": "Cannot refund an unpaid order."}, status=status.HTTP_400_BAD_REQUEST)
    amount_raw = request.data.get("amount", order.total_amount)
    reason = str(request.data.get("reason", "")).strip()
    reversal_ref = str(request.data.get("mpesa_reversal_reference", "")).strip()
    try:
        amount = quantize_money(amount_raw)
    except Exception:
        return Response({"detail": "Invalid refund amount."}, status=status.HTTP_400_BAD_REQUEST)
    payment = order.marketplace_payments.filter(status__in=["confirmed", "reversed", "refunded"]).order_by("-id").first()
    try:
        refund = process_order_refund(order=order, payment=payment, amount=amount, reason=reason, actor=request.user, mpesa_reversal_reference=reversal_ref)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    from receipts.services import issue_receipt_safe

    issue_receipt_safe(
        category="admin",
        receipt_type="admin_financial_action",
        owner_type="admin",
        owner_user=request.user,
        actor=request.user,
        order=order,
        payment=payment,
        refund=refund,
        customer=order.user,
        related_entity_type="refund_approval",
        related_entity_id=str(refund.id),
        related_reference=order.order_number,
        currency=payment.currency if payment else "KES",
        gross_amount=refund.amount,
        net_amount=refund.amount,
        payment_method=payment.provider if payment else "refund",
        summary={
            "action": "order_refund",
            "order_number": order.order_number,
            "refund_id": refund.id,
            "reason": reason,
            "mpesa_reversal_reference": reversal_ref,
        },
        event_key=f"admin_refund_action:{refund.id}",
    )
    return Response(CustomerRefundSerializer(refund).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsMarketplaceAdmin])
def admin_payout_requests(request):
    if not has_admin_permission(request.user, "finance.view"):
        return Response({"detail": "Missing permission: finance.view"}, status=status.HTTP_403_FORBIDDEN)
    status_filter = str(request.query_params.get("status", "")).strip()
    query = str(request.query_params.get("q", "")).strip()
    queryset = VendorPayoutRequest.objects.select_related("vendor", "vendor__user", "wallet", "reviewed_by").all()
    if status_filter:
        queryset = queryset.filter(status=status_filter)
    if query:
        queryset = queryset.filter(
            models.Q(vendor__store_name__icontains=query)
            | models.Q(vendor__user__email__icontains=query)
            | models.Q(phone_number__icontains=query)
            | models.Q(external_reference__icontains=query)
        )
    return Response(VendorPayoutRequestSerializer(queryset.order_by("-requested_at")[:500], many=True).data, status=status.HTTP_200_OK)


@api_view(["PATCH"])
@permission_classes([IsMarketplaceAdmin])
def admin_payout_request_detail(request, payout_request_id: int):
    if not has_admin_permission(request.user, "payouts.manage"):
        return Response({"detail": "Missing permission: payouts.manage"}, status=status.HTTP_403_FORBIDDEN)
    try:
        payout_request = VendorPayoutRequest.objects.select_related("wallet", "vendor", "vendor__user").get(id=payout_request_id)
    except VendorPayoutRequest.DoesNotExist:
        return Response({"detail": "Payout request not found."}, status=status.HTTP_404_NOT_FOUND)
    action = str(request.data.get("action", "")).strip().lower()
    notes = str(request.data.get("notes", "")).strip()
    external_reference = str(request.data.get("external_reference", "")).strip()
    if not action:
        return Response({"detail": "action is required (approve, reject, mark_paid)."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        updated = process_payout_request_status(payout_request, action=action, actor=request.user, notes=notes, external_reference=external_reference)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    log_admin_activity(actor=request.user, action=f"payout_request.{action}", description=f"Payout request #{updated.id} moved to {updated.status}.", target_type="VendorPayoutRequest", target_id=str(updated.id), metadata={"vendor_email": updated.vendor.user.email, "amount": str(updated.amount)})
    from receipts.services import issue_receipt_safe

    issue_receipt_safe(
        category="admin",
        receipt_type="admin_financial_action" if action in {"mark_paid", "approve"} else "admin_adjustment",
        owner_type="admin",
        owner_user=request.user,
        actor=request.user,
        vendor=updated.vendor,
        payout_request=updated,
        related_entity_type="payout_request_action",
        related_entity_id=str(updated.id),
        related_reference=updated.external_reference or f"PAYOUT-{updated.id}",
        gross_amount=updated.amount,
        net_amount=updated.amount,
        payment_method="mpesa_b2c" if action == "mark_paid" else "admin_action",
        summary={
            "action": action,
            "status": updated.status,
            "vendor_email": updated.vendor.user.email,
            "notes": notes,
        },
        event_key=f"admin_payout_action:{updated.id}:{action}:{updated.status}",
    )
    return Response(VendorPayoutRequestSerializer(updated).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_my_orders(request):
    return Response(OrderSerializer(Order.objects.filter(user=request.user).order_by("-created_at"), many=True).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def track_my_order(request, order_number: str):
    try:
        order = Order.objects.get(user=request.user, order_number__iexact=order_number)
    except Order.DoesNotExist:
        return Response({"detail": "Order not found in your account."}, status=status.HTTP_404_NOT_FOUND)
    return Response(OrderSerializer(order).data, status=status.HTTP_200_OK)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def cancel_my_order(request, order_id):
    try:
        order = Order.objects.get(id=order_id, user=request.user)
    except Order.DoesNotExist:
        return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
    if order.status not in {"Pending", "Processing"}:
        return Response({"detail": f"Order cannot be cancelled in '{order.status}' status."}, status=status.HTTP_400_BAD_REQUEST)
    order.status = "Cancelled"
    order.save(update_fields=["status", "updated_at"])
    AccountActivity.objects.create(user=request.user, activity_type="order_cancel", description=f"Cancelled order {order.order_number}.", metadata={"order_number": order.order_number})
    return Response(OrderSerializer(order).data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def shipping_addresses(request):
    user = request.user
    if request.method == "GET":
        return Response(ShippingAddressSerializer(ShippingAddress.objects.filter(user=user).order_by("-is_default", "-id"), many=True).data, status=status.HTTP_200_OK)
    serializer = ShippingAddressSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    make_default = bool(serializer.validated_data.get("is_default", False))
    if make_default:
        ShippingAddress.objects.filter(user=user, is_default=True).update(is_default=False)
    elif not ShippingAddress.objects.filter(user=user).exists():
        make_default = True
    serializer.save(user=user, is_default=make_default)
    AccountActivity.objects.create(user=user, activity_type="address_create", description="Added delivery address.", metadata={"city": serializer.instance.city, "is_default": serializer.instance.is_default})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def shipping_address_detail(request, address_id):
    user = request.user
    try:
        address = ShippingAddress.objects.get(id=address_id, user=user)
    except ShippingAddress.DoesNotExist:
        return Response({"detail": "Address not found."}, status=status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        city = address.city
        address.delete()
        if not ShippingAddress.objects.filter(user=user, is_default=True).exists():
            fallback = ShippingAddress.objects.filter(user=user).order_by("id").first()
            if fallback:
                fallback.is_default = True
                fallback.save(update_fields=["is_default"])
        AccountActivity.objects.create(user=user, activity_type="address_delete", description="Deleted delivery address.", metadata={"city": city})
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = ShippingAddressSerializer(address, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    if bool(serializer.validated_data.get("is_default", False)):
        ShippingAddress.objects.filter(user=user, is_default=True).exclude(id=address.id).update(is_default=False)
    serializer.save()
    AccountActivity.objects.create(user=user, activity_type="address_update", description="Updated delivery address.", metadata={"address_id": address.id, "is_default": serializer.instance.is_default})
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def payment_methods(request):
    user = request.user
    if request.method == "GET":
        return Response(PaymentMethodSerializer(PaymentMethod.objects.filter(user=user).order_by("-is_default", "-updated_at"), many=True).data, status=status.HTTP_200_OK)
    serializer = PaymentMethodSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    make_default = bool(serializer.validated_data.get("is_default", False))
    if make_default:
        PaymentMethod.objects.filter(user=user, is_default=True).update(is_default=False)
    elif not PaymentMethod.objects.filter(user=user).exists():
        make_default = True
    serializer.save(user=user, is_default=make_default)
    AccountActivity.objects.create(user=user, activity_type="payment_create", description=f"Added {serializer.instance.method_type} payment method.", metadata={"payment_method_id": serializer.instance.id, "method_type": serializer.instance.method_type, "is_default": serializer.instance.is_default})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def payment_method_detail(request, payment_method_id):
    user = request.user
    try:
        method = PaymentMethod.objects.get(id=payment_method_id, user=user)
    except PaymentMethod.DoesNotExist:
        return Response({"detail": "Payment method not found."}, status=status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        method_type = method.method_type
        method.delete()
        if not PaymentMethod.objects.filter(user=user, is_default=True).exists():
            fallback = PaymentMethod.objects.filter(user=user).order_by("id").first()
            if fallback:
                fallback.is_default = True
                fallback.save(update_fields=["is_default"])
        AccountActivity.objects.create(user=user, activity_type="payment_delete", description=f"Removed {method_type} payment method.", metadata={"method_type": method_type})
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = PaymentMethodSerializer(method, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    if bool(serializer.validated_data.get("is_default", False)):
        PaymentMethod.objects.filter(user=user, is_default=True).exclude(id=method.id).update(is_default=False)
    serializer.save()
    if not PaymentMethod.objects.filter(user=user, is_default=True).exists():
        method.is_default = True
        method.save(update_fields=["is_default"])
        serializer = PaymentMethodSerializer(method)
    AccountActivity.objects.create(user=user, activity_type="payment_update", description=f"Updated {method.method_type} payment method.", metadata={"payment_method_id": method.id, "is_default": serializer.instance.is_default if serializer.instance else method.is_default})
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsApprovedVendor])
def vendor_orders(request):
    vendor_profile = request.user.vendor_profile
    vendor_orders_qs = VendorOrder.objects.select_related("order", "order__user", "order__shipping_address", "vendor").prefetch_related("items", "items__order_item", "items__order_item__product").filter(vendor=vendor_profile).order_by("-order__created_at", "-id")
    if vendor_orders_qs.exists():
        return Response(VendorOrderSerializer(vendor_orders_qs, many=True).data, status=status.HTTP_200_OK)
    items = OrderItem.objects.select_related("order", "order__user", "order__shipping_address", "product").filter(product__vendor=vendor_profile).order_by("-order__created_at", "-id")
    data = []
    for item in items:
        order = item.order
        data.append({
            "order_id": order.id,
            "order_number": order.order_number,
            "order_status": order.status,
            "is_paid": order.is_paid,
            "ordered_at": order.created_at,
            "customer_email": order.user.email,
            "product_id": item.product.id,
            "product_title": item.product.title,
            "quantity": item.quantity,
            "selected_unit_label": item.sale_option_label or item.product.base_unit_label,
            "price_at_purchase": str(item.price_at_purchase),
            "shipping_city": order.shipping_address.city if order.shipping_address else "",
            "shipping_country": order.shipping_address.country if order.shipping_address else "",
        })
    return Response(data, status=status.HTTP_200_OK)


def _derive_parent_order_status_from_vendor_rows(statuses: list[str]) -> str:
    if not statuses:
        return "Pending"
    if all(status == "Cancelled" for status in statuses):
        return "Cancelled"
    if all(status == "Delivered" for status in statuses):
        return "Delivered"
    if any(status in {"Shipped", "Delivered"} for status in statuses):
        return "Shipped"
    if any(status == "Processing" for status in statuses):
        return "Processing"
    return "Pending"


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsApprovedVendor])
def vendor_order_status_detail(request, order_id: int):
    vendor_profile = request.user.vendor_profile
    new_status = str(request.data.get("status", "")).strip()
    allowed_statuses = {"Pending", "Processing", "Shipped", "Delivered", "Cancelled"}
    if new_status not in allowed_statuses:
        return Response({"detail": "Invalid status. Allowed values: Pending, Processing, Shipped, Delivered, Cancelled."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        order = Order.objects.select_related("user", "shipping_address").get(id=order_id)
    except Order.DoesNotExist:
        return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

    vendor_has_items = OrderItem.objects.filter(order=order, product__vendor=vendor_profile).exists()
    if not vendor_has_items:
        return Response({"detail": "You cannot update this order."}, status=status.HTTP_403_FORBIDDEN)

    previous_order_status = order.status
    vendor_order = VendorOrder.objects.filter(order=order, vendor=vendor_profile).first()
    previous_vendor_status = vendor_order.status if vendor_order else None

    if vendor_order:
        vendor_order.status = new_status
        vendor_order.save(update_fields=["status", "updated_at"])

        all_vendor_statuses = list(
            VendorOrder.objects.filter(order=order).values_list("status", flat=True)
        )
        derived_status = _derive_parent_order_status_from_vendor_rows(all_vendor_statuses)
        if order.status != derived_status:
            order.status = derived_status
            order.save(update_fields=["status", "updated_at"])
    else:
        # Legacy fallback for historical rows that are not split into VendorOrder yet.
        order.status = new_status
        order.save(update_fields=["status", "updated_at"])

    if (
        previous_order_status != "Delivered"
        and order.status == "Delivered"
        and order.is_paid
        and get_earnings_release_policy() == "on_delivery"
    ):
        release_vendor_earnings_for_order(order)

    AccountActivity.objects.create(
        user=request.user,
        activity_type="vendor_order_status_update",
        description=f"Updated order {order.order_number} status to {new_status}.",
        metadata={
            "order_id": order.id,
            "order_number": order.order_number,
            "previous_order_status": previous_order_status,
            "new_order_status": order.status,
            "previous_vendor_status": previous_vendor_status,
            "new_vendor_status": new_status,
        },
    )

    return Response(
        {
            "detail": f"Order {order.order_number} updated to {order.status}.",
            "order": OrderSerializer(order).data,
            "vendor_order_status": vendor_order.status if vendor_order else new_status,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsApprovedVendor])
def vendor_finance_summary(request):
    vendor_profile = request.user.vendor_profile
    wallet = ensure_vendor_wallet(vendor_profile)
    vendor_orders_qs = VendorOrder.objects.filter(vendor=vendor_profile)
    totals = vendor_orders_qs.aggregate(total_sales=Sum("gross_amount"), commission_total=Sum("platform_commission_amount"), net_earnings=Sum("vendor_earning_amount"), refunded_total=Sum("refunded_amount"))
    line_total_expr = models.ExpressionWrapper(
        models.F("price_at_purchase") * models.F("quantity"),
        output_field=models.DecimalField(max_digits=14, decimal_places=2),
    )
    placed_items_qs = OrderItem.objects.filter(product__vendor=vendor_profile).exclude(order__status="Cancelled")
    placed_order_value = quantize_money(
        placed_items_qs.aggregate(total=Sum(line_total_expr)).get("total") or Decimal("0.00")
    )
    unpaid_order_value = quantize_money(
        placed_items_qs.filter(order__is_paid=False).aggregate(total=Sum(line_total_expr)).get("total") or Decimal("0.00")
    )
    open_order_count = placed_items_qs.values("order_id").distinct().count()
    payout_total = VendorPayoutRequest.objects.filter(vendor=vendor_profile, status="paid").aggregate(total=Sum("amount")).get("total") or Decimal("0.00")
    pending_payout = VendorPayoutRequest.objects.filter(vendor=vendor_profile, status__in=["requested", "approved", "under_review"]).aggregate(total=Sum("amount")).get("total") or Decimal("0.00")
    return Response(
        {
            "wallet": VendorWalletSerializer(wallet).data,
            "totals": {
                "total_sales": str(quantize_money(totals.get("total_sales") or Decimal("0.00"))),
                "placed_order_value": str(placed_order_value),
                "unpaid_order_value": str(unpaid_order_value),
                "platform_commission": str(quantize_money(totals.get("commission_total") or Decimal("0.00"))),
                "net_earnings": str(quantize_money(totals.get("net_earnings") or Decimal("0.00"))),
                "refunded_total": str(quantize_money(totals.get("refunded_total") or Decimal("0.00"))),
                "payouts_completed": str(quantize_money(payout_total)),
                "pending_payout_requests": str(quantize_money(pending_payout)),
                "withdrawable_balance": str(quantize_money(wallet.available_balance)),
                "pending_balance": str(quantize_money(wallet.pending_balance)),
                "open_order_count": str(open_order_count),
            },
            "recent_transactions": VendorWalletTransactionSerializer(wallet.transactions.all()[:30], many=True).data,
            "payout_history": VendorPayoutRequestSerializer(VendorPayoutRequest.objects.filter(vendor=vendor_profile).order_by("-requested_at")[:20], many=True).data,
            "payout_policy": {
                "mode": get_payout_mode(),
                "earnings_release_policy": str(getattr(settings, "MARKETPLACE_EARNINGS_RELEASE_POLICY", "on_payment")).strip().lower(),
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsApprovedVendor])
def vendor_payout_requests(request):
    vendor_profile = request.user.vendor_profile
    wallet = ensure_vendor_wallet(vendor_profile)
    if request.method == "GET":
        return Response(VendorPayoutRequestSerializer(VendorPayoutRequest.objects.filter(vendor=vendor_profile).order_by("-requested_at"), many=True).data, status=status.HTTP_200_OK)
    amount_raw = request.data.get("amount")
    phone_number = str(request.data.get("phone_number") or vendor_profile.business_phone or "").strip()
    notes = str(request.data.get("notes", "")).strip()
    try:
        amount = quantize_money(amount_raw)
    except Exception:
        return Response({"detail": "Invalid amount."}, status=status.HTTP_400_BAD_REQUEST)
    if amount <= Decimal("0.00"):
        return Response({"detail": "Amount must be greater than zero."}, status=status.HTTP_400_BAD_REQUEST)
    if not phone_number:
        return Response({"detail": "Phone number is required for payout."}, status=status.HTTP_400_BAD_REQUEST)
    if amount > wallet.available_balance:
        return Response({"detail": "Insufficient withdrawable balance."}, status=status.HTTP_400_BAD_REQUEST)
    payout_mode = get_payout_mode()
    payout = VendorPayoutRequest.objects.create(
        vendor=vendor_profile,
        wallet=wallet,
        amount=amount,
        phone_number=phone_number,
        status="requested",
        notes=notes,
        metadata={"payout_mode": payout_mode},
    )
    if payout_mode == "automatic":
        if mpesa_live_enabled() and mpesa_b2c_enabled():
            try:
                b2c_response = initiate_b2c_disbursement(
                    phone_number=normalize_phone_number(phone_number),
                    amount=amount,
                    remarks="King-Kush vendor payout",
                    occasion=f"Payout {vendor_profile.store_name}",
                )
                originator_id = b2c_response.get("OriginatorConversationID")
                conversation_id = b2c_response.get("ConversationID")
                payout.status = "under_review"
                payout.external_reference = originator_id or conversation_id or payout.external_reference
                payout.reviewed_at = timezone.now()
                payout.metadata = {
                    **(payout.metadata or {}),
                    "automation": "mpesa_b2c",
                    "b2c_request": b2c_response,
                    "conversation_id": conversation_id,
                    "originator_conversation_id": originator_id,
                }
                payout.notes = (f"{notes}\n" if notes else "") + "Automated B2C disbursement requested."
                payout.save(update_fields=["status", "external_reference", "reviewed_at", "metadata", "notes"])
            except Exception as exc:
                return Response({"detail": f"Automatic payout failed to initiate: {exc}"}, status=status.HTTP_502_BAD_GATEWAY)
        else:
            auto_ref = f"AUTO-MPESA-{uuid.uuid4().hex[:12].upper()}"
            payout = process_payout_request_status(
                payout,
                action="mark_paid",
                actor=None,
                notes=(notes or "Auto payout processed by marketplace policy."),
                external_reference=auto_ref,
            )
    return Response(VendorPayoutRequestSerializer(payout).data, status=status.HTTP_201_CREATED)
