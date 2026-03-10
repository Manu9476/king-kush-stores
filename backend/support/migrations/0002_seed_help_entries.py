from django.db import migrations


def seed_help_entries(apps, schema_editor):
    KnowledgeBaseEntry = apps.get_model("support", "KnowledgeBaseEntry")

    defaults = [
        {
            "title": "How do I track my order?",
            "slug": "how-do-i-track-my-order",
            "category": "orders",
            "entry_type": "faq",
            "short_answer": "Use the Track Your Order page and enter your order number.",
            "content": "Open Track Your Order from the footer, submit your order number, and view your current delivery status.",
            "sort_order": 1,
            "is_published": True,
        },
        {
            "title": "How to request a return or refund",
            "slug": "how-to-request-a-return-or-refund",
            "category": "returns",
            "entry_type": "faq",
            "short_answer": "Use your account order details to request a return.",
            "content": "Go to My Account, open your order details, and use the return request option where the order is eligible.",
            "sort_order": 2,
            "is_published": True,
        },
        {
            "title": "How to place an order on King-Kush",
            "slug": "how-to-place-an-order-on-king-kush",
            "category": "orders",
            "entry_type": "guide",
            "short_answer": "Browse, add to cart, checkout, and confirm payment.",
            "content": "Search products, add items to cart, proceed to checkout, confirm address and payment details, then place your order.",
            "sort_order": 1,
            "is_published": True,
        },
        {
            "title": "How vendors can start selling",
            "slug": "how-vendors-can-start-selling",
            "category": "vendor",
            "entry_type": "guide",
            "short_answer": "Register as vendor and complete admin approval.",
            "content": "Sign up as a vendor, complete business profile and verification details, then start listing products once approved.",
            "sort_order": 2,
            "is_published": True,
        },
    ]

    for entry in defaults:
        KnowledgeBaseEntry.objects.get_or_create(
            slug=entry["slug"],
            defaults=entry,
        )


def remove_seed_help_entries(apps, schema_editor):
    KnowledgeBaseEntry = apps.get_model("support", "KnowledgeBaseEntry")
    slugs = [
        "how-do-i-track-my-order",
        "how-to-request-a-return-or-refund",
        "how-to-place-an-order-on-king-kush",
        "how-vendors-can-start-selling",
    ]
    KnowledgeBaseEntry.objects.filter(slug__in=slugs).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("support", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_help_entries, remove_seed_help_entries),
    ]
