from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0003_product_auto_price_calculation_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="barcode",
            field=models.CharField(blank=True, db_index=True, max_length=64, null=True, unique=True),
        ),
    ]

