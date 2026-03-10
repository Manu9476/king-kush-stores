from django.db import migrations, models
import uuid


def _generate_customer_id():
    return f"CUS-{uuid.uuid4().hex[:10].upper()}"


def populate_customer_ids(apps, schema_editor):
    CustomUser = apps.get_model("users", "CustomUser")
    for user in CustomUser.objects.filter(customer_id__isnull=True):
        candidate = _generate_customer_id()
        while CustomUser.objects.filter(customer_id=candidate).exists():
            candidate = _generate_customer_id()
        user.customer_id = candidate
        user.save(update_fields=["customer_id"])


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="customuser",
            name="customer_id",
            field=models.CharField(blank=True, db_index=True, editable=False, max_length=20, null=True, unique=True),
        ),
        migrations.RunPython(populate_customer_ids, migrations.RunPython.noop),
    ]

