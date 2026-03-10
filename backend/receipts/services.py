from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.core.files.base import ContentFile
from django.utils import timezone

from users.rbac import log_admin_activity

from .models import Receipt, generate_receipt_number
from .pdf import build_simple_receipt_pdf


MONEY_QUANT = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(str(value or "0")).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _actor_snapshot(actor) -> dict:
    if not actor or not getattr(actor, "is_authenticated", False):
        return {"id": None, "email": "system", "role": "system"}
    return {
        "id": actor.id,
        "email": actor.email,
        "role": actor.role,
        "customer_id": getattr(actor, "customer_id", ""),
        "name": f"{actor.first_name} {actor.last_name}".strip(),
    }


def _owner_label(receipt: Receipt) -> str:
    if receipt.owner_user_id:
        full_name = f"{receipt.owner_user.first_name} {receipt.owner_user.last_name}".strip()
        if full_name:
            return full_name
        if getattr(receipt.owner_user, "customer_id", ""):
            return receipt.owner_user.customer_id
        return "Account Holder"
    if receipt.vendor_id:
        return receipt.vendor.store_name
    if receipt.customer_id:
        full_name = f"{receipt.customer.first_name} {receipt.customer.last_name}".strip()
        if full_name:
            return full_name
        if getattr(receipt.customer, "customer_id", ""):
            return receipt.customer.customer_id
        return "Customer"
    return receipt.owner_type.replace("_", " ").title()


def _category_heading(category: str) -> str:
    if category == "customer":
        return "CUSTOMER RECEIPT"
    if category == "vendor":
        return "VENDOR RECEIPT"
    if category == "admin":
        return "ADMIN RECEIPT"
    if category == "station":
        return "STATION RECEIPT"
    return "SYSTEM RECEIPT"


def _item_line(title: str, quantity: int, amount: str, option_label: str = "") -> str:
    safe_title = (title or "Item").strip()
    qty = int(quantity or 0)
    suffix = f" ({option_label})" if option_label else ""
    return f"{safe_title}{suffix} x{qty} - {amount}"


def _append_order_items(lines: list[str], receipt: Receipt) -> None:
    items_added = 0
    lines.extend(["", "Items Ordered"])

    if receipt.vendor_order_id:
        vendor_items = (
            receipt.vendor_order.items.select_related("order_item", "order_item__product")
            .all()
        )
        for row in vendor_items:
            order_item = row.order_item
            if not order_item:
                continue
            title = order_item.product.title if order_item.product_id else "Item"
            quantity = int(order_item.quantity or 0)
            option_label = order_item.sale_option_label or ""
            lines.append(_item_line(title, quantity, str(row.line_total), option_label))
            items_added += 1
    elif receipt.order_id:
        order_items = receipt.order.items.select_related("product").all()
        for row in order_items:
            title = row.product.title if row.product_id else "Item"
            quantity = int(row.quantity or 0)
            line_total = money(row.price_at_purchase * quantity)
            lines.append(_item_line(title, quantity, str(line_total), row.sale_option_label or ""))
            items_added += 1

    if items_added == 0:
        lines.append("No order items recorded")


def _build_receipt_lines(receipt: Receipt) -> list[str]:
    header = f"King-Kush Stores - {_category_heading(receipt.category)}"
    issued_at_raw = receipt.created_at or timezone.now()
    issued_at = timezone.localtime(issued_at_raw).strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        header,
        "",
        f"Receipt: {receipt.receipt_number}",
        f"Type: {receipt.receipt_type}",
        f"Issued: {issued_at}",
        f"Status: {receipt.status}",
        f"Owner: {_owner_label(receipt)}",
        "",
        f"Reference: {receipt.related_reference or '-'}",
    ]
    if receipt.order_id:
        lines.append(f"Order: {receipt.order.order_number}")
    if receipt.payment_id:
        lines.append(f"Payment: {receipt.payment.transaction_id or receipt.payment.checkout_request_id or receipt.payment.id}")
    if receipt.refund_id:
        lines.append(f"Refund: #{receipt.refund.id}")
    if receipt.payout_request_id:
        lines.append(f"Payout: #{receipt.payout_request.id}")
    if receipt.vendor_order_id:
        lines.append(f"Vendor Split: {receipt.vendor_order.order_reference}")
    if receipt.station_id:
        lines.append(f"Station: {receipt.station.name} ({receipt.station.city})")

    if receipt.order_id or receipt.vendor_order_id:
        _append_order_items(lines, receipt)

    lines.extend(
        [
            "",
            "Totals",
            f"Currency: {receipt.currency}",
            f"Gross: {receipt.gross_amount}",
            f"Commission: {receipt.commission_amount}",
            f"Fees: {receipt.fee_amount}",
            f"Tax: {receipt.tax_amount}",
            f"Net: {receipt.net_amount}",
            f"Method: {receipt.payment_method or '-'}",
        ]
    )

    safe_summary = receipt.summary or {}
    if safe_summary:
        lines.extend(["", "Notes"])
        for key, value in safe_summary.items():
            if "email" in str(key).lower():
                continue
            lines.append(f"{str(key).replace('_', ' ').title()}: {value}")

    if receipt.actor_snapshot:
        lines.extend(
            [
                "",
                "Actor",
                f"Role: {receipt.actor_snapshot.get('role', 'system')}",
            ]
        )
    return lines


def _pdf_filename(receipt_number: str) -> str:
    return f"{receipt_number}.pdf"


def issue_receipt(
    *,
    category: str,
    receipt_type: str,
    owner_type: str,
    owner_user=None,
    actor=None,
    customer=None,
    vendor=None,
    station=None,
    order=None,
    payment=None,
    refund=None,
    payout_request=None,
    vendor_order=None,
    related_entity_type: str = "",
    related_entity_id: str = "",
    related_reference: str = "",
    currency: str = "KES",
    gross_amount=Decimal("0.00"),
    fee_amount=Decimal("0.00"),
    commission_amount=Decimal("0.00"),
    tax_amount=Decimal("0.00"),
    net_amount=Decimal("0.00"),
    payment_method: str = "",
    status: str = "issued",
    summary: dict | None = None,
    event_key: str = "",
    revision_of: Receipt | None = None,
) -> Receipt:
    if event_key:
        existing = Receipt.objects.filter(event_key=event_key).first()
        if existing:
            return existing

    receipt = Receipt(
        receipt_number=generate_receipt_number(),
        event_key=event_key or None,
        category=category,
        receipt_type=receipt_type,
        owner_type=owner_type,
        owner_user=owner_user,
        customer=customer,
        vendor=vendor,
        station=station,
        order=order,
        payment=payment,
        refund=refund,
        payout_request=payout_request,
        vendor_order=vendor_order,
        related_entity_type=related_entity_type[:80],
        related_entity_id=str(related_entity_id or "")[:80],
        related_reference=str(related_reference or "")[:120],
        currency=(currency or "KES")[:12],
        gross_amount=money(gross_amount),
        fee_amount=money(fee_amount),
        commission_amount=money(commission_amount),
        tax_amount=money(tax_amount),
        net_amount=money(net_amount),
        payment_method=(payment_method or "")[:60],
        status=status,
        summary=summary or {},
        actor_snapshot=_actor_snapshot(actor),
        revision_of=revision_of,
    )

    # Build PDF before insert so immutable save policy stays intact.
    lines = _build_receipt_lines(receipt)
    pdf_content = build_simple_receipt_pdf(lines)
    receipt.pdf_file.save(_pdf_filename(receipt.receipt_number), ContentFile(pdf_content), save=False)
    receipt.save()

    log_admin_activity(
        actor=actor,
        action="receipt.issue",
        description=f"Issued {receipt.receipt_type} receipt {receipt.receipt_number}.",
        target_type="Receipt",
        target_id=str(receipt.id),
        metadata={
            "category": receipt.category,
            "owner_type": receipt.owner_type,
            "reference": receipt.related_reference,
            "event_key": receipt.event_key or "",
        },
    )
    return receipt


def regenerate_receipt(existing: Receipt, *, actor=None, reason: str = "") -> Receipt:
    next_summary = dict(existing.summary or {})
    if reason.strip():
        next_summary["regeneration_reason"] = reason.strip()
    next_summary["regenerated_from"] = existing.receipt_number
    return issue_receipt(
        category=existing.category,
        receipt_type=existing.receipt_type,
        owner_type=existing.owner_type,
        owner_user=existing.owner_user,
        actor=actor,
        customer=existing.customer,
        vendor=existing.vendor,
        station=existing.station,
        order=existing.order,
        payment=existing.payment,
        refund=existing.refund,
        payout_request=existing.payout_request,
        vendor_order=existing.vendor_order,
        related_entity_type=existing.related_entity_type,
        related_entity_id=existing.related_entity_id,
        related_reference=existing.related_reference,
        currency=existing.currency,
        gross_amount=existing.gross_amount,
        fee_amount=existing.fee_amount,
        commission_amount=existing.commission_amount,
        tax_amount=existing.tax_amount,
        net_amount=existing.net_amount,
        payment_method=existing.payment_method,
        summary=next_summary,
        revision_of=existing,
    )


def issue_receipt_safe(**kwargs):
    try:
        return issue_receipt(**kwargs)
    except Exception:
        # Receipt failures should not interrupt core transaction flows.
        return None
