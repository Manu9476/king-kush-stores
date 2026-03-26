from django.db import migrations, models


def backfill_mission_and_vision(apps, schema_editor):
    CompanyProfile = apps.get_model("content", "CompanyProfile")
    for company in CompanyProfile.objects.all().iterator():
        combined = (company.mission_vision or "").strip()
        updates = []
        if combined and not (company.mission or "").strip():
            company.mission = combined
            updates.append("mission")
        if updates:
            company.save(update_fields=updates)


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0002_seed_default_departments"),
    ]

    operations = [
        migrations.AddField(
            model_name="companyprofile",
            name="mission",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="companyprofile",
            name="vision",
            field=models.TextField(blank=True),
        ),
        migrations.RunPython(backfill_mission_and_vision, migrations.RunPython.noop),
    ]
