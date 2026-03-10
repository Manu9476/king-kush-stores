from __future__ import annotations

import uuid
from decimal import Decimal

from django.db import models
from django.utils import timezone

from users.models import CustomUser, VendorProfile


def generate_receipt_number() -> str:
    stamp = timezone.now().strftime("%Y%m%d")
    return f"RCP-{stamp}-{uuid.uuid4().hex[:10].upper()}"


class Receipt(models.Model):
    CATEGORY_CHOICES = (
        ("customer", "Customer"),
        ("vendor", "Vendor"),
        ("admin", "Admin"),
        ("station", "Station"),
        ("system", "System"),
    )
    OWNER_TYPE_CHOICES = (
        ("customer", "Customer"),
        ("vendor", "Vendor"),
        ("admin", "Admin"),
        ("station_staff", "Station Staff"),
        ("platform", "Platform"),
        ("system", "System"),
    )
    STATUS_CHOICES = (
        ("issued", "Issued"),
        ("voided", "Voided"),
        ("replaced", "Replaced"),
    )

    receipt_number = models.CharField(max_length=40, unique=True, db_index=True, editable=False)
    event_key = models.CharField(max_length=120, unique=True, blank=True, null=True, db_index=True)

    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, db_index=True)
    receipt_type = models.CharField(max_length=80, db_index=True)
    owner_type = models.CharField(max_length=30, choices=OWNER_TYPE_CHOICES, db_index=True)
    owner_user = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="owned_receipts",
    )

    customer = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="customer_receipts",
    )
    vendor = models.ForeignKey(
        VendorProfile,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="receipts",
    )
    station = models.ForeignKey(
        "pickup.PickupStation",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="receipts",
    )

    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="receipts",
    )
    payment = models.ForeignKey(
        "orders.MarketplacePayment",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="receipts",
    )
    refund = models.ForeignKey(
        "orders.CustomerRefund",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="receipts",
    )
    payout_request = models.ForeignKey(
        "orders.VendorPayoutRequest",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="receipts",
    )
    vendor_order = models.ForeignKey(
        "orders.VendorOrder",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="receipts",
    )

    related_entity_type = models.CharField(max_length=80, blank=True)
    related_entity_id = models.CharField(max_length=80, blank=True)
    related_reference = models.CharField(max_length=120, blank=True, db_index=True)

    currency = models.CharField(max_length=12, default="KES")
    gross_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    fee_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    commission_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    net_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    payment_method = models.CharField(max_length=60, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="issued", db_index=True)

    summary = models.JSONField(default=dict, blank=True)
    actor_snapshot = models.JSONField(default=dict, blank=True)

    revision_of = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="revisions",
    )

    pdf_file = models.FileField(upload_to="receipts/%Y/%m/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["category", "receipt_type"]),
            models.Index(fields=["owner_type", "owner_user"]),
        ]

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError("Receipt records are immutable. Create a new revision instead.")
        if not self.receipt_number:
            self.receipt_number = generate_receipt_number()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.receipt_number} ({self.receipt_type})"

