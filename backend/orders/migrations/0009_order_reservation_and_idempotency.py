from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0008_orderitem_sale_option_orderitem_sale_option_label_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="idempotency_key",
            field=models.CharField(blank=True, db_index=True, max_length=120, null=True),
        ),
        migrations.AddField(
            model_name="order",
            name="stock_released_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="order",
            name="stock_release_reason",
            field=models.CharField(blank=True, default="", max_length=80),
        ),
        migrations.AddField(
            model_name="order",
            name="stock_reservation_expires_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="marketplacepayment",
            name="idempotency_key",
            field=models.CharField(blank=True, db_index=True, max_length=120, null=True),
        ),
        migrations.AddConstraint(
            model_name="order",
            constraint=models.UniqueConstraint(
                condition=models.Q(idempotency_key__isnull=False),
                fields=("user", "idempotency_key"),
                name="uniq_order_idempotency_per_user",
            ),
        ),
        migrations.AddConstraint(
            model_name="marketplacepayment",
            constraint=models.UniqueConstraint(
                condition=models.Q(idempotency_key__isnull=False),
                fields=("customer", "idempotency_key"),
                name="uniq_payment_idempotency_per_customer",
            ),
        ),
    ]
