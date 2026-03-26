from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0003_order_payment_verified_at_marketplacepayment_and_more"),
        ("products", "0004_product_barcode"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ProductReview",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("author_name", models.CharField(max_length=180)),
                ("rating", models.PositiveSmallIntegerField()),
                ("title", models.CharField(blank=True, max_length=180)),
                ("content", models.TextField()),
                ("is_verified_purchase", models.BooleanField(db_index=True, default=False)),
                ("is_approved", models.BooleanField(db_index=True, default=True)),
                ("is_featured", models.BooleanField(db_index=True, default=False)),
                ("is_seeded", models.BooleanField(db_index=True, default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("order_item", models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name="product_reviews", to="orders.orderitem")),
                ("product", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="reviews", to="products.product")),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name="product_reviews", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ("-is_featured", "-created_at"),
            },
        ),
        migrations.CreateModel(
            name="ProductReviewComment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("author_name", models.CharField(max_length=180)),
                ("content", models.TextField()),
                ("is_approved", models.BooleanField(db_index=True, default=True)),
                ("is_admin_reply", models.BooleanField(db_index=True, default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("review", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="comments", to="products.productreview")),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name="product_review_comments", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ("created_at",),
            },
        ),
        migrations.AddConstraint(
            model_name="productreview",
            constraint=models.UniqueConstraint(
                condition=models.Q(user__isnull=False),
                fields=("product", "user"),
                name="uniq_product_review_per_user",
            ),
        ),
    ]
