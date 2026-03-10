from decimal import Decimal

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("orders", "0007_order_pickup_station"),
        ("pickup", "0002_pickupstation_hybrid_ownership"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("users", "0010_vendorprofile_business_hours"),
    ]

    operations = [
        migrations.CreateModel(
            name="Receipt",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("receipt_number", models.CharField(db_index=True, editable=False, max_length=40, unique=True)),
                ("event_key", models.CharField(blank=True, db_index=True, max_length=120, null=True, unique=True)),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("customer", "Customer"),
                            ("vendor", "Vendor"),
                            ("admin", "Admin"),
                            ("station", "Station"),
                            ("system", "System"),
                        ],
                        db_index=True,
                        max_length=20,
                    ),
                ),
                ("receipt_type", models.CharField(db_index=True, max_length=80)),
                (
                    "owner_type",
                    models.CharField(
                        choices=[
                            ("customer", "Customer"),
                            ("vendor", "Vendor"),
                            ("admin", "Admin"),
                            ("station_staff", "Station Staff"),
                            ("platform", "Platform"),
                            ("system", "System"),
                        ],
                        db_index=True,
                        max_length=30,
                    ),
                ),
                ("related_entity_type", models.CharField(blank=True, max_length=80)),
                ("related_entity_id", models.CharField(blank=True, max_length=80)),
                ("related_reference", models.CharField(blank=True, db_index=True, max_length=120)),
                ("currency", models.CharField(default="KES", max_length=12)),
                ("gross_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=14)),
                ("fee_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=14)),
                ("commission_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=14)),
                ("tax_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=14)),
                ("net_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=14)),
                ("payment_method", models.CharField(blank=True, max_length=60)),
                (
                    "status",
                    models.CharField(
                        choices=[("issued", "Issued"), ("voided", "Voided"), ("replaced", "Replaced")],
                        db_index=True,
                        default="issued",
                        max_length=20,
                    ),
                ),
                ("summary", models.JSONField(blank=True, default=dict)),
                ("actor_snapshot", models.JSONField(blank=True, default=dict)),
                ("pdf_file", models.FileField(blank=True, null=True, upload_to="receipts/%Y/%m/")),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                (
                    "customer",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="customer_receipts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "order",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="receipts",
                        to="orders.order",
                    ),
                ),
                (
                    "owner_user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="owned_receipts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "payment",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="receipts",
                        to="orders.marketplacepayment",
                    ),
                ),
                (
                    "payout_request",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="receipts",
                        to="orders.vendorpayoutrequest",
                    ),
                ),
                (
                    "refund",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="receipts",
                        to="orders.customerrefund",
                    ),
                ),
                (
                    "revision_of",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="revisions",
                        to="receipts.receipt",
                    ),
                ),
                (
                    "station",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="receipts",
                        to="pickup.pickupstation",
                    ),
                ),
                (
                    "vendor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="receipts",
                        to="users.vendorprofile",
                    ),
                ),
                (
                    "vendor_order",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="receipts",
                        to="orders.vendororder",
                    ),
                ),
            ],
            options={
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddIndex(
            model_name="receipt",
            index=models.Index(fields=["category", "receipt_type"], name="receipts_re_categor_c5fc1f_idx"),
        ),
        migrations.AddIndex(
            model_name="receipt",
            index=models.Index(fields=["owner_type", "owner_user"], name="receipts_re_owner_t_6f8ced_idx"),
        ),
    ]

