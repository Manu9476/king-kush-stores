from django.db import migrations


ROLE_TEMPLATES = [
    {
        "name": "Customer Support Staff",
        "slug": "customer-support-staff",
        "description": "Handles customer inquiries, ticket responses, and help center updates.",
        "permissions": [
            "dashboard.view",
            "customers.view",
            "orders.view",
            "support.view",
            "support.reply",
            "helpcenter.manage",
        ],
    },
    {
        "name": "Order Management Staff",
        "slug": "order-management-staff",
        "description": "Manages orders, shipping status, and fulfillment coordination.",
        "permissions": [
            "dashboard.view",
            "orders.view",
            "orders.edit",
            "orders.approve",
            "customers.view",
        ],
    },
    {
        "name": "Vendor Management Staff",
        "slug": "vendor-management-staff",
        "description": "Reviews vendor applications and manages vendor compliance.",
        "permissions": [
            "dashboard.view",
            "vendors.view",
            "vendors.approve",
            "vendors.edit",
            "products.view",
        ],
    },
    {
        "name": "Product Management Staff",
        "slug": "product-management-staff",
        "description": "Maintains product quality, listings, and category standards.",
        "permissions": [
            "dashboard.view",
            "products.view",
            "products.create",
            "products.edit",
            "products.approve",
        ],
    },
    {
        "name": "Content Marketing Staff",
        "slug": "content-marketing-staff",
        "description": "Maintains campaigns, promotional content, and public-facing copy.",
        "permissions": [
            "dashboard.view",
            "content.manage",
            "careers.view",
            "careers.manage",
        ],
    },
    {
        "name": "Technical Moderation Staff",
        "slug": "technical-moderation-staff",
        "description": "Monitors safety, moderation, and policy enforcement.",
        "permissions": [
            "dashboard.view",
            "moderation.manage",
            "products.view",
            "products.edit",
            "support.view",
            "chatbot.view",
        ],
    },
]


def backfill_admin_level_and_seed_roles(apps, schema_editor):
    CustomUser = apps.get_model("users", "CustomUser")
    StaffRole = apps.get_model("users", "StaffRole")

    # Existing admin users become super admins by default to avoid accidental lockout.
    CustomUser.objects.filter(role="admin", admin_level="").update(admin_level="super_admin")
    CustomUser.objects.exclude(role="admin").exclude(admin_level="").update(admin_level="")

    for template in ROLE_TEMPLATES:
        role, created = StaffRole.objects.get_or_create(
            slug=template["slug"],
            defaults={
                "name": template["name"],
                "description": template["description"],
                "permissions": template["permissions"],
                "is_active": True,
            },
        )
        if not created and not role.permissions:
            role.permissions = template["permissions"]
            role.save(update_fields=["permissions", "updated_at"])


def reverse_backfill(apps, schema_editor):
    CustomUser = apps.get_model("users", "CustomUser")
    CustomUser.objects.filter(role="admin", admin_level="super_admin").update(admin_level="")


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0008_staffrole_customuser_admin_level_adminactivitylog_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_admin_level_and_seed_roles, reverse_backfill),
    ]
