from django.db import migrations


def seed_departments(apps, schema_editor):
    Department = apps.get_model("content", "Department")
    defaults = [
        ("Design", 1),
        ("Development", 2),
        ("Marketing", 3),
        ("Management", 4),
        ("Content", 5),
        ("Other", 99),
    ]
    for name, order in defaults:
        Department.objects.get_or_create(name=name, defaults={"sort_order": order, "is_active": True})


def unseed_departments(apps, schema_editor):
    Department = apps.get_model("content", "Department")
    Department.objects.filter(name__in=["Design", "Development", "Marketing", "Management", "Content", "Other"]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_departments, unseed_departments),
    ]
