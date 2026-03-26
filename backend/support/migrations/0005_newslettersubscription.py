from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("support", "0004_seed_additional_help_entries"),
    ]

    operations = [
        migrations.CreateModel(
            name="NewsletterSubscription",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.EmailField(max_length=254, unique=True)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("subscribed_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ("-subscribed_at",),
            },
        ),
    ]
