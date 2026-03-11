from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("advertising", "0002_seed_default_placements"),
    ]

    operations = [
        migrations.AddField(
            model_name="advertisingcampaign",
            name="purpose",
            field=models.CharField(
                choices=[
                    ("sales", "Sales"),
                    ("awareness", "Awareness"),
                    ("new_arrival", "New Arrival"),
                    ("flash_sale", "Flash Sale"),
                    ("vendor_spotlight", "Vendor Spotlight"),
                    ("brand_promotion", "Brand Promotion"),
                    ("other", "Other"),
                ],
                db_index=True,
                default="awareness",
                max_length=30,
            ),
        ),
    ]
