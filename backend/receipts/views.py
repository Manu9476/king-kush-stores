from decimal import Decimal

from django.db.models import Q
from django.http import FileResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from users.permissions import IsMarketplaceAdmin, IsVendorUser, has_admin_permission, is_super_admin
from users.rbac import log_admin_activity

from .models import Receipt
from .serializers import ReceiptSerializer
from .services import issue_receipt, regenerate_receipt


def _as_money(value) -> Decimal:
    try:
        return Decimal(str(value or "0"))
    except Exception:
        return Decimal("0")


def _filtered_queryset(request, queryset):
    q = str(request.query_params.get("q", "")).strip()
    category = str(request.query_params.get("category", "")).strip().lower()
    receipt_type = str(request.query_params.get("receipt_type", "")).strip().lower()
    owner_type = str(request.query_params.get("owner_type", "")).strip().lower()
    status_filter = str(request.query_params.get("status", "")).strip().lower()
    reference = str(request.query_params.get("reference", "")).strip()

    if category:
        queryset = queryset.filter(category=category)
    if receipt_type:
        queryset = queryset.filter(receipt_type__icontains=receipt_type)
    if owner_type:
        queryset = queryset.filter(owner_type=owner_type)
    if status_filter:
        queryset = queryset.filter(status=status_filter)
    if reference:
        queryset = queryset.filter(related_reference__icontains=reference)
    if q:
        queryset = queryset.filter(
            Q(receipt_number__icontains=q)
            | Q(receipt_type__icontains=q)
            | Q(related_reference__icontains=q)
            | Q(summary__icontains=q)
            | Q(owner_user__email__icontains=q)
            | Q(customer__email__icontains=q)
            | Q(vendor__store_name__icontains=q)
            | Q(vendor__user__email__icontains=q)
            | Q(station__name__icontains=q)
        )
    return queryset


def _customer_queryset(user):
    return Receipt.objects.select_related(
        "owner_user",
        "customer",
        "vendor",
        "vendor__user",
        "station",
        "order",
        "payment",
        "refund",
        "payout_request",
        "vendor_order",
        "revision_of",
    ).filter(Q(customer=user) | Q(owner_user=user) | Q(owner_type="customer", owner_user=user))


def _vendor_queryset(user):
    vendor_profile = getattr(user, "vendor_profile", None)
    if not vendor_profile:
        return Receipt.objects.none()
    return Receipt.objects.select_related(
        "owner_user",
        "customer",
        "vendor",
        "vendor__user",
        "station",
        "order",
        "payment",
        "refund",
        "payout_request",
        "vendor_order",
        "revision_of",
    ).filter(Q(vendor=vendor_profile) | Q(owner_user=user) | Q(owner_type="vendor", owner_user=user))


def _station_scope_queryset(user):
    from pickup.models import PickupStationAssignment

    station_ids = list(
        PickupStationAssignment.objects.filter(
            user=user,
            is_active=True,
            station__is_active=True,
        ).values_list("station_id", flat=True)
    )
    return Receipt.objects.select_related(
        "owner_user",
        "customer",
        "vendor",
        "vendor__user",
        "station",
        "order",
        "payment",
        "refund",
        "payout_request",
        "vendor_order",
        "revision_of",
    ).filter(station_id__in=station_ids)


def _admin_queryset(user):
    base = Receipt.objects.select_related(
        "owner_user",
        "customer",
        "vendor",
        "vendor__user",
        "station",
        "order",
        "payment",
        "refund",
        "payout_request",
        "vendor_order",
        "revision_of",
    )

    if is_super_admin(user) or has_admin_permission(user, "receipts.view"):
        return base

    if has_admin_permission(user, "finance.view") or has_admin_permission(user, "finance.manage"):
        return base.exclude(category="station")

    if has_admin_permission(user, "pickup.view") or has_admin_permission(user, "pickup.operations"):
        return _station_scope_queryset(user)

    return Receipt.objects.none()


def _can_access_receipt(user, receipt: Receipt) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.role == "customer":
        return bool(receipt.customer_id == user.id or receipt.owner_user_id == user.id)
    if user.role == "vendor":
        profile = getattr(user, "vendor_profile", None)
        if not profile:
            return False
        return bool(receipt.vendor_id == profile.id or receipt.owner_user_id == user.id)
    if user.role == "admin":
        if is_super_admin(user) or has_admin_permission(user, "receipts.view"):
            return True
        if has_admin_permission(user, "finance.view") or has_admin_permission(user, "finance.manage"):
            return receipt.category != "station"
        if has_admin_permission(user, "pickup.view") or has_admin_permission(user, "pickup.operations"):
            if not receipt.station_id:
                return False
            from pickup.models import PickupStationAssignment

            return PickupStationAssignment.objects.filter(
                user=user,
                station_id=receipt.station_id,
                is_active=True,
                station__is_active=True,
            ).exists()
    return False


def _is_station_scoped_admin_for_order(user, order) -> bool:
    if not order or not getattr(order, "pickup_station_id", None):
        return False
    from pickup.models import PickupStationAssignment

    return PickupStationAssignment.objects.filter(
        user=user,
        station_id=order.pickup_station_id,
        is_active=True,
        station__is_active=True,
    ).exists()


def _resolve_owner_scope(user):
    if user.role == "customer":
        return {
            "category": "customer",
            "owner_type": "customer",
            "owner_user": user,
            "customer": user,
            "vendor": None,
            "station_owner": False,
        }
    if user.role == "vendor":
        profile = getattr(user, "vendor_profile", None)
        if not profile:
            return None
        return {
            "category": "vendor",
            "owner_type": "vendor",
            "owner_user": user,
            "customer": None,
            "vendor": profile,
            "station_owner": False,
        }
    if user.role == "admin":
        if is_super_admin(user) or has_admin_permission(user, "receipts.manage") or has_admin_permission(user, "finance.manage"):
            return {
                "category": "admin",
                "owner_type": "admin",
                "owner_user": user,
                "customer": None,
                "vendor": None,
                "station_owner": False,
            }
        if has_admin_permission(user, "pickup.operations") and not (
            has_admin_permission(user, "finance.view") or has_admin_permission(user, "orders.view")
        ):
            return {
                "category": "station",
                "owner_type": "station_staff",
                "owner_user": user,
                "customer": None,
                "vendor": None,
                "station_owner": True,
            }
        if (
            has_admin_permission(user, "receipts.view")
            or has_admin_permission(user, "finance.view")
            or has_admin_permission(user, "orders.view")
            or has_admin_permission(user, "pickup.view")
        ):
            return {
                "category": "admin",
                "owner_type": "admin",
                "owner_user": user,
                "customer": None,
                "vendor": None,
                "station_owner": False,
            }
    return None


def _find_existing_for_actor(user, scope, entity_type: str, entity_id: str):
    queryset = Receipt.objects.filter(
        related_entity_type=entity_type,
        related_entity_id=entity_id,
        status="issued",
    )
    if user.role == "customer":
        queryset = queryset.filter(Q(owner_user=user) | Q(customer=user))
    elif user.role == "vendor":
        profile = scope.get("vendor")
        queryset = queryset.filter(Q(owner_user=user) | Q(vendor=profile))
    elif user.role == "admin":
        if scope.get("station_owner"):
            queryset = queryset.filter(category="station", owner_user=user)
        else:
            queryset = queryset.filter(Q(owner_user=user) | Q(category="admin"))
    else:
        queryset = queryset.none()
    return queryset.order_by("-created_at").first()


def _generate_for_order(user, scope, order):
    from orders.models import VendorOrder

    station = order.pickup_station if getattr(order, "pickup_station_id", None) else None
    if user.role == "customer":
        if order.user_id != user.id:
            return None, "You are not authorized to generate a receipt for this order."
        return issue_receipt(
            category=scope["category"],
            receipt_type="customer_order",
            owner_type=scope["owner_type"],
            owner_user=scope["owner_user"],
            actor=user,
            customer=scope["customer"],
            order=order,
            station=station,
            related_entity_type="order",
            related_entity_id=str(order.id),
            related_reference=order.order_number,
            gross_amount=order.total_amount,
            net_amount=order.total_amount,
            payment_method="paid" if order.is_paid else "pending_payment",
            summary={
                "order_number": order.order_number,
                "fulfillment_method": order.fulfillment_method,
                "order_status": order.status,
                "payment_status": "paid" if order.is_paid else "pending",
            },
            event_key=f"manual_generate:order:{order.id}:customer:{user.id}",
        ), ""

    if user.role == "vendor":
        vendor_order = VendorOrder.objects.filter(order=order, vendor=scope["vendor"]).order_by("-id").first()
        if not vendor_order:
            return None, "You are not authorized to generate a receipt for this order."
        return issue_receipt(
            category=scope["category"],
            receipt_type="vendor_order_statement",
            owner_type=scope["owner_type"],
            owner_user=scope["owner_user"],
            actor=user,
            vendor=scope["vendor"],
            order=order,
            vendor_order=vendor_order,
            station=station,
            related_entity_type="order",
            related_entity_id=str(order.id),
            related_reference=vendor_order.order_reference or order.order_number,
            gross_amount=vendor_order.gross_amount,
            commission_amount=vendor_order.platform_commission_amount,
            net_amount=vendor_order.vendor_earning_amount,
            payment_method=vendor_order.payout_status,
            summary={
                "order_number": order.order_number,
                "vendor_order_reference": vendor_order.order_reference,
                "status": vendor_order.status,
                "payout_status": vendor_order.payout_status,
            },
            event_key=f"manual_generate:order:{order.id}:vendor:{scope['vendor'].id}",
        ), ""

    if user.role == "admin":
        can_global = (
            is_super_admin(user)
            or has_admin_permission(user, "orders.view")
            or has_admin_permission(user, "finance.view")
            or has_admin_permission(user, "receipts.manage")
            or has_admin_permission(user, "receipts.view")
        )
        if not can_global and not _is_station_scoped_admin_for_order(user, order):
            return None, "You are not authorized to generate a receipt for this order."
        category = "station" if scope.get("station_owner") else scope["category"]
        owner_type = "station_staff" if scope.get("station_owner") else scope["owner_type"]
        return issue_receipt(
            category=category,
            receipt_type="admin_order_snapshot" if category == "admin" else "station_order_operation",
            owner_type=owner_type,
            owner_user=scope["owner_user"],
            actor=user,
            customer=order.user,
            order=order,
            station=station,
            related_entity_type="order",
            related_entity_id=str(order.id),
            related_reference=order.order_number,
            gross_amount=order.total_amount,
            net_amount=order.total_amount,
            payment_method="paid" if order.is_paid else "pending_payment",
            summary={
                "order_number": order.order_number,
                "fulfillment_method": order.fulfillment_method,
                "order_status": order.status,
                "generated_from": "transaction_view",
            },
            event_key=f"manual_generate:order:{order.id}:{owner_type}:{user.id}",
        ), ""
    return None, "Unsupported user role."


def _generate_for_payment(user, scope, payment):
    from orders.models import VendorOrder

    order = payment.order
    station = order.pickup_station if order and order.pickup_station_id else None
    if user.role == "customer":
        if payment.customer_id != user.id:
            return None, "You are not authorized to generate a receipt for this payment."
        return issue_receipt(
            category=scope["category"],
            receipt_type="customer_payment",
            owner_type=scope["owner_type"],
            owner_user=scope["owner_user"],
            actor=user,
            customer=user,
            order=order,
            payment=payment,
            station=station,
            related_entity_type="payment",
            related_entity_id=str(payment.id),
            related_reference=payment.transaction_id or payment.mpesa_receipt_number or f"PAY-{payment.id}",
            currency=payment.currency,
            gross_amount=payment.amount,
            net_amount=payment.amount,
            payment_method=payment.provider,
            summary={
                "order_number": order.order_number if order else "",
                "payment_status": payment.status,
                "provider": payment.provider,
            },
            event_key=f"manual_generate:payment:{payment.id}:customer:{user.id}",
        ), ""

    if user.role == "vendor":
        vendor_orders = VendorOrder.objects.filter(order=order, vendor=scope["vendor"])
        if not vendor_orders.exists():
            return None, "You are not authorized to generate a receipt for this payment."
        gross = sum((_as_money(row.gross_amount) for row in vendor_orders), Decimal("0"))
        commission = sum((_as_money(row.platform_commission_amount) for row in vendor_orders), Decimal("0"))
        net = sum((_as_money(row.vendor_earning_amount) for row in vendor_orders), Decimal("0"))
        return issue_receipt(
            category=scope["category"],
            receipt_type="vendor_payment_allocation",
            owner_type=scope["owner_type"],
            owner_user=scope["owner_user"],
            actor=user,
            vendor=scope["vendor"],
            order=order,
            payment=payment,
            station=station,
            related_entity_type="payment",
            related_entity_id=str(payment.id),
            related_reference=payment.transaction_id or payment.mpesa_receipt_number or f"PAY-{payment.id}",
            currency=payment.currency,
            gross_amount=gross,
            commission_amount=commission,
            net_amount=net,
            payment_method=payment.provider,
            summary={
                "order_number": order.order_number if order else "",
                "payment_status": payment.status,
                "vendor_split_count": vendor_orders.count(),
            },
            event_key=f"manual_generate:payment:{payment.id}:vendor:{scope['vendor'].id}",
        ), ""

    if user.role == "admin":
        can_global = (
            is_super_admin(user)
            or has_admin_permission(user, "finance.view")
            or has_admin_permission(user, "receipts.view")
            or has_admin_permission(user, "receipts.manage")
        )
        if not can_global:
            return None, "You are not authorized to generate a receipt for this payment."
        return issue_receipt(
            category="admin",
            receipt_type="admin_payment_audit",
            owner_type="admin",
            owner_user=scope["owner_user"],
            actor=user,
            customer=payment.customer,
            order=order,
            payment=payment,
            station=station,
            related_entity_type="payment",
            related_entity_id=str(payment.id),
            related_reference=payment.transaction_id or payment.mpesa_receipt_number or f"PAY-{payment.id}",
            currency=payment.currency,
            gross_amount=payment.amount,
            net_amount=payment.amount,
            payment_method=payment.provider,
            summary={
                "order_number": order.order_number if order else "",
                "payment_status": payment.status,
                "provider": payment.provider,
            },
            event_key=f"manual_generate:payment:{payment.id}:admin:{user.id}",
        ), ""
    return None, "Unsupported user role."


def _generate_for_vendor_order(user, scope, vendor_order):
    if user.role == "customer":
        if vendor_order.order.user_id != user.id:
            return None, "You are not authorized to generate a receipt for this vendor order."
        return issue_receipt(
            category=scope["category"],
            receipt_type="customer_vendor_split",
            owner_type=scope["owner_type"],
            owner_user=scope["owner_user"],
            actor=user,
            customer=user,
            order=vendor_order.order,
            vendor=vendor_order.vendor,
            vendor_order=vendor_order,
            related_entity_type="vendor_order",
            related_entity_id=str(vendor_order.id),
            related_reference=vendor_order.order_reference or vendor_order.order.order_number,
            gross_amount=vendor_order.gross_amount,
            net_amount=vendor_order.gross_amount,
            payment_method=vendor_order.payout_status,
            summary={
                "order_number": vendor_order.order.order_number,
                "vendor_store": vendor_order.vendor.store_name,
                "status": vendor_order.status,
            },
            event_key=f"manual_generate:vendor_order:{vendor_order.id}:customer:{user.id}",
        ), ""

    if user.role == "vendor":
        if scope["vendor"].id != vendor_order.vendor_id:
            return None, "You are not authorized to generate a receipt for this vendor order."
        return issue_receipt(
            category=scope["category"],
            receipt_type="vendor_order_statement",
            owner_type=scope["owner_type"],
            owner_user=scope["owner_user"],
            actor=user,
            vendor=scope["vendor"],
            order=vendor_order.order,
            vendor_order=vendor_order,
            related_entity_type="vendor_order",
            related_entity_id=str(vendor_order.id),
            related_reference=vendor_order.order_reference,
            gross_amount=vendor_order.gross_amount,
            commission_amount=vendor_order.platform_commission_amount,
            net_amount=vendor_order.vendor_earning_amount,
            payment_method=vendor_order.payout_status,
            summary={
                "order_number": vendor_order.order.order_number,
                "status": vendor_order.status,
                "payout_status": vendor_order.payout_status,
            },
            event_key=f"manual_generate:vendor_order:{vendor_order.id}:vendor:{scope['vendor'].id}",
        ), ""

    if user.role == "admin":
        can_global = (
            is_super_admin(user)
            or has_admin_permission(user, "finance.view")
            or has_admin_permission(user, "orders.view")
            or has_admin_permission(user, "receipts.view")
            or has_admin_permission(user, "receipts.manage")
        )
        if not can_global:
            return None, "You are not authorized to generate a receipt for this vendor order."
        return issue_receipt(
            category="admin",
            receipt_type="admin_vendor_order_audit",
            owner_type="admin",
            owner_user=scope["owner_user"],
            actor=user,
            customer=vendor_order.order.user,
            vendor=vendor_order.vendor,
            order=vendor_order.order,
            vendor_order=vendor_order,
            related_entity_type="vendor_order",
            related_entity_id=str(vendor_order.id),
            related_reference=vendor_order.order_reference,
            gross_amount=vendor_order.gross_amount,
            commission_amount=vendor_order.platform_commission_amount,
            net_amount=vendor_order.vendor_earning_amount,
            payment_method=vendor_order.payout_status,
            summary={
                "order_number": vendor_order.order.order_number,
                "status": vendor_order.status,
                "payout_status": vendor_order.payout_status,
            },
            event_key=f"manual_generate:vendor_order:{vendor_order.id}:admin:{user.id}",
        ), ""
    return None, "Unsupported user role."


def _generate_for_payout_request(user, scope, payout):
    if user.role == "vendor":
        if scope["vendor"].id != payout.vendor_id:
            return None, "You are not authorized to generate a receipt for this payout request."
        return issue_receipt(
            category=scope["category"],
            receipt_type="vendor_payout",
            owner_type=scope["owner_type"],
            owner_user=scope["owner_user"],
            actor=user,
            vendor=scope["vendor"],
            payout_request=payout,
            related_entity_type="payout_request",
            related_entity_id=str(payout.id),
            related_reference=payout.external_reference or f"PAYOUT-{payout.id}",
            gross_amount=payout.amount,
            net_amount=payout.amount,
            payment_method="mpesa_b2c",
            summary={
                "status": payout.status,
                "phone_number": payout.phone_number,
                "requested_at": payout.requested_at.isoformat(),
            },
            event_key=f"manual_generate:payout_request:{payout.id}:vendor:{scope['vendor'].id}",
        ), ""

    if user.role == "admin":
        can_global = (
            is_super_admin(user)
            or has_admin_permission(user, "finance.view")
            or has_admin_permission(user, "payouts.manage")
            or has_admin_permission(user, "receipts.manage")
            or has_admin_permission(user, "receipts.view")
        )
        if not can_global:
            return None, "You are not authorized to generate a receipt for this payout request."
        return issue_receipt(
            category="admin",
            receipt_type="admin_financial_action",
            owner_type="admin",
            owner_user=scope["owner_user"],
            actor=user,
            vendor=payout.vendor,
            payout_request=payout,
            related_entity_type="payout_request",
            related_entity_id=str(payout.id),
            related_reference=payout.external_reference or f"PAYOUT-{payout.id}",
            gross_amount=payout.amount,
            net_amount=payout.amount,
            payment_method="mpesa_b2c",
            summary={
                "status": payout.status,
                "phone_number": payout.phone_number,
                "requested_at": payout.requested_at.isoformat(),
            },
            event_key=f"manual_generate:payout_request:{payout.id}:admin:{user.id}",
        ), ""
    return None, "Unsupported user role."


def _generate_for_refund(user, scope, refund):
    if user.role == "customer":
        if refund.customer_id != user.id:
            return None, "You are not authorized to generate a receipt for this refund."
        payment = refund.payment
        return issue_receipt(
            category=scope["category"],
            receipt_type="customer_refund",
            owner_type=scope["owner_type"],
            owner_user=scope["owner_user"],
            actor=user,
            customer=user,
            order=refund.order,
            payment=payment,
            refund=refund,
            related_entity_type="refund",
            related_entity_id=str(refund.id),
            related_reference=refund.order.order_number,
            currency=payment.currency if payment else "KES",
            gross_amount=refund.amount,
            net_amount=refund.amount,
            payment_method=payment.provider if payment else "refund",
            summary={
                "status": refund.status,
                "reason": refund.reason,
                "mpesa_reversal_reference": refund.mpesa_reversal_reference or "",
            },
            event_key=f"manual_generate:refund:{refund.id}:customer:{user.id}",
        ), ""

    if user.role == "vendor":
        from orders.models import VendorOrder

        linked_vendor = VendorOrder.objects.filter(order=refund.order, vendor=scope["vendor"]).exists()
        if not linked_vendor:
            return None, "You are not authorized to generate a receipt for this refund."
        payment = refund.payment
        return issue_receipt(
            category=scope["category"],
            receipt_type="vendor_refund_adjustment",
            owner_type=scope["owner_type"],
            owner_user=scope["owner_user"],
            actor=user,
            vendor=scope["vendor"],
            order=refund.order,
            payment=payment,
            refund=refund,
            related_entity_type="refund",
            related_entity_id=str(refund.id),
            related_reference=refund.order.order_number,
            currency=payment.currency if payment else "KES",
            gross_amount=refund.amount,
            net_amount=refund.amount,
            payment_method=payment.provider if payment else "refund",
            summary={
                "status": refund.status,
                "reason": refund.reason,
            },
            event_key=f"manual_generate:refund:{refund.id}:vendor:{scope['vendor'].id}",
        ), ""

    if user.role == "admin":
        can_global = (
            is_super_admin(user)
            or has_admin_permission(user, "finance.view")
            or has_admin_permission(user, "receipts.view")
            or has_admin_permission(user, "receipts.manage")
        )
        if not can_global:
            return None, "You are not authorized to generate a receipt for this refund."
        payment = refund.payment
        return issue_receipt(
            category="admin",
            receipt_type="admin_financial_action",
            owner_type="admin",
            owner_user=scope["owner_user"],
            actor=user,
            customer=refund.customer,
            order=refund.order,
            payment=payment,
            refund=refund,
            related_entity_type="refund",
            related_entity_id=str(refund.id),
            related_reference=refund.order.order_number,
            currency=payment.currency if payment else "KES",
            gross_amount=refund.amount,
            net_amount=refund.amount,
            payment_method=payment.provider if payment else "refund",
            summary={
                "status": refund.status,
                "reason": refund.reason,
            },
            event_key=f"manual_generate:refund:{refund.id}:admin:{user.id}",
        ), ""
    return None, "Unsupported user role."


def _generate_for_wallet_transaction(user, scope, wallet_tx):
    if user.role == "vendor":
        if scope["vendor"].id != wallet_tx.vendor_id:
            return None, "You are not authorized to generate a receipt for this wallet transaction."
        return issue_receipt(
            category=scope["category"],
            receipt_type="vendor_wallet_transaction",
            owner_type=scope["owner_type"],
            owner_user=scope["owner_user"],
            actor=user,
            vendor=scope["vendor"],
            order=wallet_tx.vendor_order.order if wallet_tx.vendor_order_id else None,
            payment=wallet_tx.payment,
            refund=wallet_tx.refund,
            payout_request=wallet_tx.payout_request,
            vendor_order=wallet_tx.vendor_order,
            related_entity_type="wallet_transaction",
            related_entity_id=str(wallet_tx.id),
            related_reference=wallet_tx.vendor_order.order_reference if wallet_tx.vendor_order_id else f"WALLET-TX-{wallet_tx.id}",
            gross_amount=wallet_tx.amount,
            net_amount=wallet_tx.amount,
            payment_method=wallet_tx.transaction_type,
            summary={
                "transaction_type": wallet_tx.transaction_type,
                "direction": wallet_tx.direction,
                "status": wallet_tx.status,
                "description": wallet_tx.description,
                "balance_after": str(wallet_tx.balance_after),
            },
            event_key=f"manual_generate:wallet_transaction:{wallet_tx.id}:vendor:{scope['vendor'].id}",
        ), ""

    if user.role == "admin":
        can_global = (
            is_super_admin(user)
            or has_admin_permission(user, "finance.view")
            or has_admin_permission(user, "receipts.view")
            or has_admin_permission(user, "receipts.manage")
        )
        if not can_global:
            return None, "You are not authorized to generate a receipt for this wallet transaction."
        return issue_receipt(
            category="admin",
            receipt_type="admin_financial_action",
            owner_type="admin",
            owner_user=scope["owner_user"],
            actor=user,
            vendor=wallet_tx.vendor,
            order=wallet_tx.vendor_order.order if wallet_tx.vendor_order_id else None,
            payment=wallet_tx.payment,
            refund=wallet_tx.refund,
            payout_request=wallet_tx.payout_request,
            vendor_order=wallet_tx.vendor_order,
            related_entity_type="wallet_transaction",
            related_entity_id=str(wallet_tx.id),
            related_reference=wallet_tx.vendor_order.order_reference if wallet_tx.vendor_order_id else f"WALLET-TX-{wallet_tx.id}",
            gross_amount=wallet_tx.amount,
            net_amount=wallet_tx.amount,
            payment_method=wallet_tx.transaction_type,
            summary={
                "transaction_type": wallet_tx.transaction_type,
                "direction": wallet_tx.direction,
                "status": wallet_tx.status,
                "description": wallet_tx.description,
                "balance_after": str(wallet_tx.balance_after),
            },
            event_key=f"manual_generate:wallet_transaction:{wallet_tx.id}:admin:{user.id}",
        ), ""
    return None, "Unsupported user role."


def _generate_for_entity(user, scope, entity_type: str, entity_id: int):
    from orders.models import CustomerRefund, MarketplacePayment, Order, VendorOrder, VendorPayoutRequest, VendorWalletTransaction

    if entity_type == "order":
        try:
            entity = Order.objects.select_related("user", "pickup_station", "shipping_address").get(id=entity_id)
        except Order.DoesNotExist:
            return None, "Order not found."
        return _generate_for_order(user, scope, entity)

    if entity_type == "payment":
        try:
            entity = MarketplacePayment.objects.select_related("order", "order__pickup_station", "customer").get(id=entity_id)
        except MarketplacePayment.DoesNotExist:
            return None, "Payment not found."
        return _generate_for_payment(user, scope, entity)

    if entity_type == "vendor_order":
        try:
            entity = VendorOrder.objects.select_related("order", "order__user", "vendor", "vendor__user").get(id=entity_id)
        except VendorOrder.DoesNotExist:
            return None, "Vendor order not found."
        return _generate_for_vendor_order(user, scope, entity)

    if entity_type == "payout_request":
        try:
            entity = VendorPayoutRequest.objects.select_related("vendor", "vendor__user", "wallet").get(id=entity_id)
        except VendorPayoutRequest.DoesNotExist:
            return None, "Payout request not found."
        return _generate_for_payout_request(user, scope, entity)

    if entity_type == "refund":
        try:
            entity = CustomerRefund.objects.select_related("order", "order__user", "customer", "payment").get(id=entity_id)
        except CustomerRefund.DoesNotExist:
            return None, "Refund not found."
        return _generate_for_refund(user, scope, entity)

    if entity_type == "wallet_transaction":
        try:
            entity = VendorWalletTransaction.objects.select_related(
                "vendor",
                "vendor__user",
                "vendor_order",
                "vendor_order__order",
                "payment",
                "refund",
                "payout_request",
            ).get(id=entity_id)
        except VendorWalletTransaction.DoesNotExist:
            return None, "Wallet transaction not found."
        return _generate_for_wallet_transaction(user, scope, entity)

    return None, "Unsupported entity_type. Use order, payment, vendor_order, payout_request, refund, or wallet_transaction."


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_receipts(request):
    if request.user.role != "customer":
        return Response({"detail": "Customer receipts endpoint is only for customer accounts."}, status=status.HTTP_403_FORBIDDEN)
    queryset = _filtered_queryset(request, _customer_queryset(request.user)).order_by("-created_at")
    return Response(ReceiptSerializer(queryset[:500], many=True, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsVendorUser])
def vendor_receipts(request):
    queryset = _filtered_queryset(request, _vendor_queryset(request.user)).order_by("-created_at")
    return Response(ReceiptSerializer(queryset[:500], many=True, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_receipts(request):
    queryset = _admin_queryset(request.user)
    if not queryset.exists() and not (
        is_super_admin(request.user)
        or has_admin_permission(request.user, "receipts.view")
        or has_admin_permission(request.user, "finance.view")
        or has_admin_permission(request.user, "pickup.view")
        or has_admin_permission(request.user, "pickup.operations")
    ):
        return Response({"detail": "Missing permission to view receipts."}, status=status.HTTP_403_FORBIDDEN)
    queryset = _filtered_queryset(request, queryset).order_by("-created_at")
    return Response(ReceiptSerializer(queryset[:500], many=True, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def station_receipts(request):
    if not (has_admin_permission(request.user, "pickup.view") or has_admin_permission(request.user, "pickup.operations")):
        return Response({"detail": "Missing permission: pickup.view"}, status=status.HTTP_403_FORBIDDEN)
    queryset = _filtered_queryset(request, _station_scope_queryset(request.user)).order_by("-created_at")
    return Response(ReceiptSerializer(queryset[:500], many=True, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def download_receipt_pdf(request, receipt_id: int):
    try:
        receipt = Receipt.objects.select_related("owner_user", "customer", "vendor", "vendor__user", "station").get(id=receipt_id)
    except Receipt.DoesNotExist:
        return Response({"detail": "Receipt not found."}, status=status.HTTP_404_NOT_FOUND)
    if not _can_access_receipt(request.user, receipt):
        return Response({"detail": "You are not authorized to download this receipt."}, status=status.HTTP_403_FORBIDDEN)
    if not receipt.pdf_file:
        return Response({"detail": "Receipt PDF is unavailable."}, status=status.HTTP_404_NOT_FOUND)
    log_admin_activity(
        actor=request.user,
        action="receipt.download",
        description=f"Downloaded receipt {receipt.receipt_number}.",
        target_type="Receipt",
        target_id=str(receipt.id),
        metadata={"receipt_type": receipt.receipt_type, "category": receipt.category},
    )
    response = FileResponse(receipt.pdf_file.open("rb"), as_attachment=True, filename=f"{receipt.receipt_number}.pdf")
    return response


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def regenerate_receipt_view(request, receipt_id: int):
    try:
        receipt = Receipt.objects.select_related("owner_user", "customer", "vendor", "vendor__user", "station").get(id=receipt_id)
    except Receipt.DoesNotExist:
        return Response({"detail": "Receipt not found."}, status=status.HTTP_404_NOT_FOUND)

    can_manage = False
    if request.user.role == "admin":
        can_manage = (
            is_super_admin(request.user)
            or has_admin_permission(request.user, "receipts.manage")
            or has_admin_permission(request.user, "finance.manage")
            or has_admin_permission(request.user, "pickup.manage")
        )
    if not can_manage and not _can_access_receipt(request.user, receipt):
        return Response({"detail": "You are not authorized to regenerate this receipt."}, status=status.HTTP_403_FORBIDDEN)

    reason = str(request.data.get("reason", "")).strip()
    regenerated = regenerate_receipt(receipt, actor=request.user, reason=reason)
    return Response(ReceiptSerializer(regenerated, context={"request": request}).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_manual_receipt(request):
    if not (
        is_super_admin(request.user)
        or has_admin_permission(request.user, "receipts.manage")
        or has_admin_permission(request.user, "finance.manage")
    ):
        return Response({"detail": "Missing permission: receipts.manage"}, status=status.HTTP_403_FORBIDDEN)

    from .services import issue_receipt

    category = str(request.data.get("category", "admin")).strip().lower() or "admin"
    receipt_type = str(request.data.get("receipt_type", "admin_adjustment")).strip().lower() or "admin_adjustment"
    owner_type = str(request.data.get("owner_type", "admin")).strip().lower() or "admin"
    related_entity_type = str(request.data.get("related_entity_type", "manual_action")).strip()
    related_entity_id = str(request.data.get("related_entity_id", "")).strip()
    related_reference = str(request.data.get("related_reference", "")).strip()
    currency = str(request.data.get("currency", "KES")).strip() or "KES"
    payment_method = str(request.data.get("payment_method", "")).strip()
    summary = request.data.get("summary") if isinstance(request.data.get("summary"), dict) else {}
    summary = {**summary, "manual_entry": True}

    try:
        created = issue_receipt(
            category=category,
            receipt_type=receipt_type,
            owner_type=owner_type,
            owner_user=request.user,
            actor=request.user,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            related_reference=related_reference,
            currency=currency,
            gross_amount=request.data.get("gross_amount", "0"),
            fee_amount=request.data.get("fee_amount", "0"),
            commission_amount=request.data.get("commission_amount", "0"),
            tax_amount=request.data.get("tax_amount", "0"),
            net_amount=request.data.get("net_amount", request.data.get("gross_amount", "0")),
            payment_method=payment_method,
            summary=summary,
        )
    except Exception as exc:
        return Response({"detail": f"Failed to issue manual receipt: {exc}"}, status=status.HTTP_400_BAD_REQUEST)

    return Response(ReceiptSerializer(created, context={"request": request}).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_receipt_for_transaction(request):
    entity_type = str(request.data.get("entity_type", "")).strip().lower()
    entity_id_raw = request.data.get("entity_id")
    if not entity_type:
        return Response({"detail": "entity_type is required."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        entity_id = int(entity_id_raw)
    except (TypeError, ValueError):
        return Response({"detail": "entity_id must be a valid integer."}, status=status.HTTP_400_BAD_REQUEST)

    scope = _resolve_owner_scope(request.user)
    if not scope:
        return Response({"detail": "You are not authorized to generate receipts."}, status=status.HTTP_403_FORBIDDEN)

    existing = _find_existing_for_actor(request.user, scope, entity_type, str(entity_id))
    if existing:
        return Response(
            {"created": False, "receipt": ReceiptSerializer(existing, context={"request": request}).data},
            status=status.HTTP_200_OK,
        )

    created, error = _generate_for_entity(request.user, scope, entity_type, entity_id)
    if error:
        lowered = error.lower()
        if "not found" in lowered:
            code = status.HTTP_404_NOT_FOUND
        elif "authorized" in lowered:
            code = status.HTTP_403_FORBIDDEN
        else:
            code = status.HTTP_400_BAD_REQUEST
        return Response({"detail": error}, status=code)
    if not created:
        return Response({"detail": "Unable to generate receipt for this transaction."}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        {"created": True, "receipt": ReceiptSerializer(created, context={"request": request}).data},
        status=status.HTTP_201_CREATED,
    )
