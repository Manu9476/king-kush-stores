from django.db import migrations


NEW_ENTRIES = [
    {
        "title": "What payment methods are accepted?",
        "slug": "what-payment-methods-are-accepted",
        "category": "payments",
        "entry_type": "faq",
        "short_answer": "King-Kush currently supports M-Pesa, with more options planned.",
        "content": (
            "At checkout, choose your preferred available option. "
            "M-Pesa payments are confirmed by callback before order processing begins."
        ),
        "sort_order": 1,
        "is_published": True,
    },
    {
        "title": "How long does shipping take?",
        "slug": "how-long-does-shipping-take",
        "category": "shipping",
        "entry_type": "faq",
        "short_answer": "Delivery timelines depend on location, item type, and vendor processing speed.",
        "content": (
            "After payment confirmation, vendors process orders and shipping timelines update in order tracking. "
            "Use Track Your Order for latest status."
        ),
        "sort_order": 1,
        "is_published": True,
    },
    {
        "title": "How to manage your account profile",
        "slug": "how-to-manage-your-account-profile",
        "category": "account",
        "entry_type": "guide",
        "short_answer": "Update your profile, addresses, and preferences from the account dashboard.",
        "content": (
            "Open My Account to edit profile details, delivery addresses, and account preferences. "
            "You can also review order history and saved items."
        ),
        "sort_order": 1,
        "is_published": True,
    },
    {
        "title": "How to contact support quickly",
        "slug": "how-to-contact-support-quickly",
        "category": "general",
        "entry_type": "guide",
        "short_answer": "Use Contact Us or create a support ticket from Help Center.",
        "content": (
            "If your answer is not in Help Center, open Contact Us and submit your issue. "
            "Include your order number and clear details to get faster support."
        ),
        "sort_order": 1,
        "is_published": True,
    },
]


def seed_additional_help_entries(apps, schema_editor):
    KnowledgeBaseEntry = apps.get_model("support", "KnowledgeBaseEntry")
    for entry in NEW_ENTRIES:
        KnowledgeBaseEntry.objects.get_or_create(
            slug=entry["slug"],
            defaults=entry,
        )


def remove_additional_help_entries(apps, schema_editor):
    KnowledgeBaseEntry = apps.get_model("support", "KnowledgeBaseEntry")
    KnowledgeBaseEntry.objects.filter(slug__in=[entry["slug"] for entry in NEW_ENTRIES]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("support", "0003_supportticketattachment"),
    ]

    operations = [
        migrations.RunPython(seed_additional_help_entries, remove_additional_help_entries),
    ]
