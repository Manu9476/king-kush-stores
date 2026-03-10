from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0009_backfill_admin_level_and_seed_staff_roles"),
    ]

    operations = [
        migrations.AddField(
            model_name="vendorprofile",
            name="business_hours",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]

