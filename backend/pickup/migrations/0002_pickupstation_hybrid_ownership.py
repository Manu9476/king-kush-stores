from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0010_vendorprofile_business_hours"),
        ("pickup", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="pickupstation",
            name="approval_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("approved", "Approved"),
                    ("suspended", "Suspended"),
                    ("rejected", "Rejected"),
                ],
                db_index=True,
                default="approved",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="pickupstation",
            name="is_visible_to_customers",
            field=models.BooleanField(db_index=True, default=True),
        ),
        migrations.AddField(
            model_name="pickupstation",
            name="last_vendor_sync_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="pickupstation",
            name="ownership_type",
            field=models.CharField(
                choices=[("platform", "Platform Managed"), ("vendor", "Vendor Managed")],
                db_index=True,
                default="platform",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="pickupstation",
            name="sync_active_status",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="pickupstation",
            name="sync_address",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="pickupstation",
            name="sync_contact",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="pickupstation",
            name="sync_name",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="pickupstation",
            name="sync_operating_hours",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="pickupstation",
            name="vendor_profile",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="pickup_stations",
                to="users.vendorprofile",
            ),
        ),
        migrations.RunSQL(
            sql=(
                "UPDATE pickup_pickupstation "
                "SET sync_name = FALSE, sync_address = FALSE, sync_contact = FALSE, sync_operating_hours = FALSE, sync_active_status = FALSE "
                "WHERE ownership_type = 'platform';"
            ),
            reverse_sql=(
                "UPDATE pickup_pickupstation "
                "SET sync_name = TRUE, sync_address = TRUE, sync_contact = TRUE, sync_operating_hours = TRUE, sync_active_status = TRUE "
                "WHERE ownership_type = 'platform';"
            ),
        ),
    ]
