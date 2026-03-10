from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from products.models import Product
from users.rbac import log_admin_activity

from .models import (
    CustomerRefund,
    MarketplacePayment,
    Order,
    OrderItem,
    VendorOrder,
    VendorOrderItem,
    VendorPayoutRequest,
    VendorWallet,
    VendorWalletTransaction,
)


MONEY_QUANT = Decimal("0.01")


def quantize_money(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def get_platform_commission_rate() -> Decimal:
    value = getattr(settings, "MARKETPLACE_COMMISSION_RATE", Decimal("0.10"))
    return Decimal(str(value))


def get_platform_mpesa_account_reference() -> str:
    return getattr(settings, "MARKETPLACE_MPESA_ACCOUNT_REFERENCE", "KING-KUSH-MARKETPLACE")


def get_stock_reservation_timeout_minutes() -> int:
    raw_value = getattr(settings, "MARKETPLACE_STOCK_RESERVATION_MINUTES", 30)
    try:
        timeout_minutes = int(raw_value)
    except (TypeError, ValueError):
        timeout_minutes = 30
    return max(1, min(timeout_minutes, 720))


def get_stock_reservation_expiry():
    return timezone.now() + timedelta(minutes=get_stock_reservation_timeout_minutes())


def get_payout_mode() -> str:
    mode = str(getattr(settings, "MARKETPLACE_PAYOUT_MODE", "automatic")).strip().lower()
    return mode if mode in {"automatic", "manual"} else "automatic"


def get_earnings_release_policy() -> str:
    policy = str(getattr(settings, "MARKETPLACE_EARNINGS_RELEASE_POLICY", "on_payment")).strip().lower()
    return policy if policy in {"on_payment", "on_delivery"} else "on_payment"


@transaction.atomic
def release_order_stock_reservation(order: Order, reason: str = "payment_timeout") -> bool:
    """
    Releases reserved stock for an unpaid order and cancels the order.
    Safe to call repeatedly.
    """
    locked_order = Order.objects.select_for_update().get(id=order.id)
    if locked_order.is_paid or locked_order.stock_released_at:
        return False

    items = list(OrderItem.objects.select_related("product").filter(order=locked_order))
    stock_deltas: dict[int, int] = {}
    for item in items:
        consumed_units = max(int(item.sale_option_stock_units_consumed or 1), 1) * int(item.quantity or 0)
        if consumed_units <= 0:
            continue
        stock_deltas[item.product_id] = stock_deltas.get(item.product_id, 0) + consumed_units

    if stock_deltas:
        products = Product.objects.select_for_update().filter(id__in=list(stock_deltas.keys()))
        for product in products:
            product.stock += stock_deltas.get(product.id, 0)
            product.save(update_fields=["stock", "updated_at"])

    MarketplacePayment.objects.filter(
        order=locked_order,
        status__in=["initiated", "pending_confirmation"],
    ).update(
        status="cancelled",
        result_desc="Order stock reservation expired before payment confirmation.",
    )

    locked_order.stock_released_at = timezone.now()
    locked_order.stock_release_reason = (reason or "payment_timeout")[:80]
    if locked_order.status != "Cancelled":
        locked_order.status = "Cancelled"
    locked_order.save(
        update_fields=[
            "stock_released_at",
            "stock_release_reason",
            "status",
            "updated_at",
        ]
    )
    return True


def release_expired_stock_reservations(limit: int = 200) -> int:
    """
    Bulk releases old unpaid reservations. Returns the number of orders released.
    """
    capped_limit = max(1, min(int(limit or 200), 2000))
    now = timezone.now()
    expired_orders = list(
        Order.objects.filter(
            is_paid=False,
            stock_released_at__isnull=True,
            stock_reservation_expires_at__isnull=False,
            stock_reservation_expires_at__lte=now,
            status__in=["Pending", "Processing"],
        )
        .order_by("stock_reservation_expires_at")[:capped_limit]
    )

    released = 0
    for order in expired_orders:
        if release_order_stock_reservation(order, reason="reservation_expired"):
            released += 1
    return released


def ensure_vendor_wallet(vendor_profile) -> VendorWallet:
    wallet, _ = VendorWallet.objects.get_or_create(vendor=vendor_profile)
    return wallet


def record_wallet_transaction(
    *,
    wallet: VendorWallet,
    vendor,
    transaction_type: str,
    direction: str,
    amount: Decimal,
    description: str = "",
    vendor_order: VendorOrder | None = None,
    payment: MarketplacePayment | None = None,
    payout_request: VendorPayoutRequest | None = None,
    refund: CustomerRefund | None = None,
    metadata: dict | None = None,
):
    amount = quantize_money(amount)
    VendorWalletTransaction.objects.create(
        wallet=wallet,
        vendor=vendor,
        vendor_order=vendor_order,
        payment=payment,
        payout_request=payout_request,
        refund=refund,
        transaction_type=transaction_type,
        direction=direction,
        amount=amount,
        balance_after=wallet.available_balance,
        status="completed",
        description=description[:255],
        metadata=metadata or {},
    )


@transaction.atomic
def allocate_vendor_orders_for_order(order: Order, payment: MarketplacePayment | None = None):
    """
    Split one marketplace order into per-vendor sub-orders and credit wallets (pending).
    Safe to call multiple times; existing vendor orders are refreshed.
    """
    commission_rate = get_platform_commission_rate()
    order_items = list(
        OrderItem.objects.select_related("product", "product__vendor", "product__vendor__user").filter(order=order)
    )
    if not order_items:
        return []

    grouped: dict[int, list[OrderItem]] = {}
    for item in order_items:
        grouped.setdefault(item.product.vendor_id, []).append(item)

    created_vendor_orders: list[VendorOrder] = []
    for vendor_id, items in grouped.items():
        vendor_profile = items[0].product.vendor
        gross_amount = quantize_money(sum(item.price_at_purchase * item.quantity for item in items))
        commission_amount = quantize_money(gross_amount * commission_rate)
        vendor_earning_amount = quantize_money(gross_amount - commission_amount)

        vendor_order, _ = VendorOrder.objects.update_or_create(
            order=order,
            vendor=vendor_profile,
            defaults={
                "status": order.status,
                "gross_amount": gross_amount,
                "platform_commission_rate": commission_rate,
                "platform_commission_amount": commission_amount,
                "vendor_earning_amount": vendor_earning_amount,
                "payout_status": "pending_wallet",
            },
        )
        created_vendor_orders.append(vendor_order)

        existing_item_ids = []
        for item in items:
            line_total = quantize_money(item.price_at_purchase * item.quantity)
            link, _ = VendorOrderItem.objects.update_or_create(
                order_item=item,
                defaults={"vendor_order": vendor_order, "line_total": line_total},
            )
            existing_item_ids.append(link.id)
        VendorOrderItem.objects.filter(vendor_order=vendor_order).exclude(id__in=existing_item_ids).delete()

        wallet = ensure_vendor_wallet(vendor_profile)
        already_credited = VendorWalletTransaction.objects.filter(
            vendor_order=vendor_order,
            transaction_type="credit_sale_pending",
            status="completed",
        ).exists()
        if not already_credited:
            wallet.pending_balance = quantize_money(wallet.pending_balance + vendor_earning_amount)
            wallet.lifetime_earnings = quantize_money(wallet.lifetime_earnings + vendor_earning_amount)
            wallet.save(update_fields=["pending_balance", "lifetime_earnings", "updated_at"])
            record_wallet_transaction(
                wallet=wallet,
                vendor=vendor_profile,
                vendor_order=vendor_order,
                payment=payment,
                transaction_type="credit_sale_pending",
                direction="credit",
                amount=vendor_earning_amount,
                description=f"Order {order.order_number} credited to pending balance.",
                metadata={
                    "order_number": order.order_number,
                    "commission_amount": str(commission_amount),
                },
            )
            from receipts.services import issue_receipt_safe

            issue_receipt_safe(
                category="vendor",
                receipt_type="vendor_commission",
                owner_type="vendor",
                owner_user=vendor_profile.user,
                actor=None,
                vendor=vendor_profile,
                order=order,
                payment=payment,
                vendor_order=vendor_order,
                related_entity_type="vendor_order",
                related_entity_id=str(vendor_order.id),
                related_reference=vendor_order.order_reference,
                currency=payment.currency if payment else "KES",
                gross_amount=gross_amount,
                commission_amount=commission_amount,
                net_amount=vendor_earning_amount,
                payment_method=(payment.provider if payment else "order_split"),
                summary={
                    "order_number": order.order_number,
                    "commission_rate": str(commission_rate),
                    "gross_amount": str(gross_amount),
                    "platform_commission_amount": str(commission_amount),
                    "vendor_earning_amount": str(vendor_earning_amount),
                    "allocation_status": "credited_pending_wallet",
                },
                event_key=f"vendor_commission:{vendor_order.id}",
            )

    return created_vendor_orders


@transaction.atomic
def release_vendor_earnings_for_order(order: Order):
    """
    Move pending wallet earnings to available when order becomes delivered.
    """
    vendor_orders = list(
        VendorOrder.objects.select_related("vendor", "vendor__wallet").filter(order=order, earnings_released=False)
    )
    for vendor_order in vendor_orders:
        wallet = ensure_vendor_wallet(vendor_order.vendor)
        release_amount = quantize_money(vendor_order.vendor_earning_amount - vendor_order.refunded_amount)
        if release_amount <= Decimal("0.00"):
            vendor_order.earnings_released = True
            vendor_order.released_at = timezone.now()
            vendor_order.payout_status = "refunded"
            vendor_order.save(update_fields=["earnings_released", "released_at", "payout_status", "updated_at"])
            continue

        wallet.pending_balance = quantize_money(wallet.pending_balance - release_amount)
        wallet.available_balance = quantize_money(wallet.available_balance + release_amount)
        wallet.save(update_fields=["pending_balance", "available_balance", "updated_at"])

        vendor_order.earnings_released = True
        vendor_order.released_at = timezone.now()
        vendor_order.payout_status = "available_for_payout"
        vendor_order.save(update_fields=["earnings_released", "released_at", "payout_status", "updated_at"])

        record_wallet_transaction(
            wallet=wallet,
            vendor=vendor_order.vendor,
            vendor_order=vendor_order,
            transaction_type="release_to_available",
            direction="credit",
            amount=release_amount,
            description=f"Order {order.order_number} earnings released to available balance.",
            metadata={"order_number": order.order_number},
        )
        from receipts.services import issue_receipt_safe

        issue_receipt_safe(
            category="vendor",
            receipt_type="vendor_settlement",
            owner_type="vendor",
            owner_user=vendor_order.vendor.user,
            actor=None,
            vendor=vendor_order.vendor,
            order=order,
            vendor_order=vendor_order,
            related_entity_type="vendor_settlement",
            related_entity_id=str(vendor_order.id),
            related_reference=vendor_order.order_reference,
            gross_amount=vendor_order.gross_amount,
            commission_amount=vendor_order.platform_commission_amount,
            net_amount=release_amount,
            payment_method="wallet_settlement",
            summary={
                "order_number": order.order_number,
                "release_policy": get_earnings_release_policy(),
                "released_to_available": str(release_amount),
                "wallet_status": "available_for_payout",
            },
            event_key=f"vendor_settlement:{vendor_order.id}",
        )


@transaction.atomic
def confirm_marketplace_payment(payment: MarketplacePayment, callback_payload: dict):
    """
    Verify payment callback, mark order as paid, split vendor earnings, and create wallet entries.
    """
    result_code = str(callback_payload.get("result_code", callback_payload.get("ResultCode", "0")))
    result_desc = str(callback_payload.get("result_desc", callback_payload.get("ResultDesc", "")))
    checkout_request_id = callback_payload.get("checkout_request_id") or callback_payload.get("CheckoutRequestID")
    merchant_request_id = callback_payload.get("merchant_request_id") or callback_payload.get("MerchantRequestID")
    transaction_id = callback_payload.get("transaction_id") or callback_payload.get("TransactionID")
    mpesa_receipt_number = callback_payload.get("mpesa_receipt_number") or callback_payload.get("MpesaReceiptNumber")

    payment.checkout_request_id = checkout_request_id or payment.checkout_request_id
    payment.merchant_request_id = merchant_request_id or payment.merchant_request_id
    payment.transaction_id = transaction_id or payment.transaction_id
    payment.mpesa_receipt_number = mpesa_receipt_number or payment.mpesa_receipt_number
    payment.result_code = result_code
    payment.result_desc = result_desc[:255]
    payment.callback_payload = callback_payload

    success = result_code == "0"
    if success:
        payment.status = "confirmed"
        payment.confirmed_at = timezone.now()
    else:
        payment.status = "failed"
    payment.save()

    if not success:
        return {"status": "failed", "message": payment.result_desc or "Payment failed."}

    order = payment.order
    if order.stock_released_at and not order.is_paid:
        payment.status = "reversed"
        payment.result_desc = "Payment confirmed after reservation expiry; manual reversal required."
        payment.save(update_fields=["status", "result_desc", "updated_at"])
        return {
            "status": "reversed",
            "message": "Payment was received after reservation expiry. Order is cancelled; process refund/reversal.",
            "order_id": order.id,
            "order_number": order.order_number,
        }

    if not order.is_paid:
        order.is_paid = True
        order.paid_at = timezone.now()
        order.payment_verified_at = timezone.now()
        order.stock_reservation_expires_at = None
        if order.status == "Pending":
            order.status = "Processing"
        order.save(update_fields=["is_paid", "paid_at", "payment_verified_at", "stock_reservation_expires_at", "status", "updated_at"])

    vendor_orders = allocate_vendor_orders_for_order(order, payment=payment)
    if get_earnings_release_policy() == "on_payment":
        release_vendor_earnings_for_order(order)
    from receipts.services import issue_receipt_safe

    issue_receipt_safe(
        category="customer",
        receipt_type="customer_payment",
        owner_type="customer",
        owner_user=order.user,
        actor=order.user,
        customer=order.user,
        order=order,
        payment=payment,
        related_entity_type="payment",
        related_entity_id=str(payment.id),
        related_reference=payment.mpesa_receipt_number or payment.transaction_id or payment.checkout_request_id or order.order_number,
        currency=payment.currency or "KES",
        gross_amount=payment.amount,
        net_amount=payment.amount,
        payment_method=payment.provider,
        summary={
            "order_number": order.order_number,
            "payment_status": payment.status,
            "mpesa_receipt_number": payment.mpesa_receipt_number or "",
            "transaction_id": payment.transaction_id or "",
            "checkout_request_id": payment.checkout_request_id or "",
            "platform_collection_account": get_platform_mpesa_account_reference(),
        },
        event_key=f"payment_confirmed:{payment.id}",
    )
    return {
        "status": "confirmed",
        "order_id": order.id,
        "order_number": order.order_number,
        "vendor_orders": [vendor_order.order_reference for vendor_order in vendor_orders],
    }


@transaction.atomic
def process_payout_request_status(
    payout_request: VendorPayoutRequest,
    *,
    action: str,
    actor=None,
    notes: str = "",
    external_reference: str = "",
):
    action = action.strip().lower()
    wallet = payout_request.wallet

    if action == "approve":
        payout_request.status = "approved"
        payout_request.reviewed_at = timezone.now()
        payout_request.reviewed_by = actor if getattr(actor, "is_authenticated", False) else None
        if notes:
            payout_request.notes = notes
        payout_request.save(update_fields=["status", "reviewed_at", "reviewed_by", "notes"])
        return payout_request

    if action == "reject":
        payout_request.status = "rejected"
        payout_request.reviewed_at = timezone.now()
        payout_request.reviewed_by = actor if getattr(actor, "is_authenticated", False) else None
        if notes:
            payout_request.notes = notes
        payout_request.save(update_fields=["status", "reviewed_at", "reviewed_by", "notes"])
        return payout_request

    if action == "mark_paid":
        if payout_request.status not in {"approved", "under_review", "requested"}:
            raise ValueError("Only requested/approved payouts can be marked paid.")
        if wallet.available_balance < payout_request.amount:
            raise ValueError("Vendor wallet has insufficient available balance.")

        wallet.available_balance = quantize_money(wallet.available_balance - payout_request.amount)
        wallet.total_paid_out = quantize_money(wallet.total_paid_out + payout_request.amount)
        wallet.save(update_fields=["available_balance", "total_paid_out", "updated_at"])

        payout_request.status = "paid"
        payout_request.paid_at = timezone.now()
        payout_request.reviewed_at = timezone.now()
        payout_request.reviewed_by = actor if getattr(actor, "is_authenticated", False) else None
        if external_reference:
            payout_request.external_reference = external_reference
        if notes:
            payout_request.notes = notes
        payout_request.save(
            update_fields=[
                "status",
                "paid_at",
                "reviewed_at",
                "reviewed_by",
                "external_reference",
                "notes",
            ]
        )
        record_wallet_transaction(
            wallet=wallet,
            vendor=payout_request.vendor,
            payout_request=payout_request,
            transaction_type="debit_payout",
            direction="debit",
            amount=payout_request.amount,
            description=f"Payout request #{payout_request.id} marked paid.",
            metadata={"external_reference": payout_request.external_reference or ""},
        )
        from receipts.services import issue_receipt_safe

        issue_receipt_safe(
            category="vendor",
            receipt_type="vendor_payout",
            owner_type="vendor",
            owner_user=payout_request.vendor.user,
            actor=actor,
            vendor=payout_request.vendor,
            payout_request=payout_request,
            related_entity_type="payout_request",
            related_entity_id=str(payout_request.id),
            related_reference=payout_request.external_reference or f"PAYOUT-{payout_request.id}",
            gross_amount=payout_request.amount,
            net_amount=payout_request.amount,
            payment_method="mpesa_b2c",
            summary={
                "payout_status": payout_request.status,
                "phone_number": payout_request.phone_number,
                "external_reference": payout_request.external_reference or "",
                "notes": payout_request.notes or "",
            },
            event_key=f"payout_paid:{payout_request.id}",
        )
        return payout_request

    raise ValueError("Unsupported payout action.")


@transaction.atomic
def process_order_refund(
    *,
    order: Order,
    payment: MarketplacePayment | None,
    amount: Decimal,
    reason: str,
    actor=None,
    mpesa_reversal_reference: str = "",
):
    if amount <= Decimal("0.00"):
        raise ValueError("Refund amount must be greater than zero.")
    if amount > order.total_amount:
        raise ValueError("Refund amount cannot exceed order total.")

    refund = CustomerRefund.objects.create(
        order=order,
        payment=payment,
        customer=order.user,
        requested_by=actor if getattr(actor, "is_authenticated", False) else None,
        amount=quantize_money(amount),
        reason=reason or "",
        status="completed",
        mpesa_reversal_reference=mpesa_reversal_reference or None,
        completed_at=timezone.now(),
    )

    vendor_orders = list(VendorOrder.objects.select_related("vendor").filter(order=order))
    if not vendor_orders:
        vendor_orders = allocate_vendor_orders_for_order(order, payment=payment)

    total_order_amount = quantize_money(order.total_amount)
    ratio = quantize_money(amount / total_order_amount) if total_order_amount > Decimal("0.00") else Decimal("0.00")

    for vendor_order in vendor_orders:
        wallet = ensure_vendor_wallet(vendor_order.vendor)
        refundable_vendor_earning = quantize_money(vendor_order.vendor_earning_amount - vendor_order.refunded_amount)
        if refundable_vendor_earning <= Decimal("0.00"):
            continue

        vendor_refund_amount = quantize_money(vendor_order.vendor_earning_amount * ratio)
        vendor_refund_amount = min(vendor_refund_amount, refundable_vendor_earning)
        if vendor_refund_amount <= Decimal("0.00"):
            continue

        # Deduct from available first, then pending; allow available to go negative if already paid out.
        available_deduction = min(wallet.available_balance, vendor_refund_amount) if wallet.available_balance > 0 else Decimal("0.00")
        pending_deduction = vendor_refund_amount - available_deduction

        wallet.available_balance = quantize_money(wallet.available_balance - available_deduction)
        wallet.pending_balance = quantize_money(wallet.pending_balance - pending_deduction)
        wallet.total_refunded = quantize_money(wallet.total_refunded + vendor_refund_amount)
        wallet.save(update_fields=["available_balance", "pending_balance", "total_refunded", "updated_at"])

        vendor_order.refunded_amount = quantize_money(vendor_order.refunded_amount + vendor_refund_amount)
        if vendor_order.refunded_amount >= vendor_order.vendor_earning_amount:
            vendor_order.payout_status = "refunded"
            vendor_order.status = "Refunded"
        vendor_order.save(update_fields=["refunded_amount", "payout_status", "status", "updated_at"])

        record_wallet_transaction(
            wallet=wallet,
            vendor=vendor_order.vendor,
            vendor_order=vendor_order,
            payment=payment,
            refund=refund,
            transaction_type="debit_refund",
            direction="debit",
            amount=vendor_refund_amount,
            description=f"Refund deduction for order {order.order_number}.",
            metadata={"refund_id": refund.id, "order_number": order.order_number},
        )

    paid_refunds_total = (
        CustomerRefund.objects.filter(order=order, status="completed").aggregate(total=Sum("amount")).get("total")
        or Decimal("0.00")
    )
    if payment:
        if paid_refunds_total >= order.total_amount:
            payment.status = "refunded"
        else:
            payment.status = "reversed"
        payment.save(update_fields=["status"])

    if paid_refunds_total >= order.total_amount:
        order.status = "Cancelled"
    order.save(update_fields=["status", "updated_at"])

    if actor and getattr(actor, "is_authenticated", False):
        log_admin_activity(
            actor=actor,
            action="order.refund",
            description=f"Processed refund for order {order.order_number}.",
            target_type="Order",
            target_id=str(order.id),
            metadata={
                "refund_id": refund.id,
                "amount": str(refund.amount),
                "mpesa_reversal_reference": mpesa_reversal_reference,
            },
        )
    from receipts.services import issue_receipt_safe

    issue_receipt_safe(
        category="customer",
        receipt_type="customer_refund",
        owner_type="customer",
        owner_user=order.user,
        actor=actor,
        customer=order.user,
        order=order,
        payment=payment,
        refund=refund,
        related_entity_type="refund",
        related_entity_id=str(refund.id),
        related_reference=refund.mpesa_reversal_reference or order.order_number,
        currency=payment.currency if payment else "KES",
        gross_amount=refund.amount,
        net_amount=refund.amount,
        payment_method=payment.provider if payment else "refund",
        summary={
            "order_number": order.order_number,
            "refund_status": refund.status,
            "refund_reason": refund.reason,
            "mpesa_reversal_reference": refund.mpesa_reversal_reference or "",
        },
        event_key=f"refund_completed:{refund.id}",
    )

    return refund
