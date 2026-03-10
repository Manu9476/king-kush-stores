from collections import defaultdict


ADMIN_PERMISSION_CATALOG = [
    {"code": "dashboard.view", "module": "dashboard", "action": "view", "label": "View dashboard"},
    {"code": "analytics.view", "module": "analytics", "action": "view", "label": "View analytics"},
    {"code": "customers.view", "module": "customers", "action": "view", "label": "View customer profiles"},
    {"code": "customers.edit", "module": "customers", "action": "edit", "label": "Edit customer accounts"},
    {"code": "orders.view", "module": "orders", "action": "view", "label": "View orders"},
    {"code": "orders.edit", "module": "orders", "action": "edit", "label": "Edit order status and shipping"},
    {"code": "orders.approve", "module": "orders", "action": "approve", "label": "Approve order actions"},
    {"code": "payments.manage", "module": "finance", "action": "edit", "label": "Manage payment confirmations and callbacks"},
    {"code": "finance.view", "module": "finance", "action": "view", "label": "View marketplace finance dashboards"},
    {"code": "finance.manage", "module": "finance", "action": "edit", "label": "Manage refunds and financial controls"},
    {"code": "payouts.manage", "module": "finance", "action": "approve", "label": "Approve and process vendor payouts"},
    {"code": "vendors.view", "module": "vendors", "action": "view", "label": "View vendors"},
    {"code": "vendors.approve", "module": "vendors", "action": "approve", "label": "Approve or reject vendors"},
    {"code": "vendors.edit", "module": "vendors", "action": "edit", "label": "Edit vendor records"},
    {"code": "products.view", "module": "products", "action": "view", "label": "View products"},
    {"code": "products.create", "module": "products", "action": "create", "label": "Create products"},
    {"code": "products.edit", "module": "products", "action": "edit", "label": "Edit products"},
    {"code": "products.approve", "module": "products", "action": "approve", "label": "Approve products"},
    {"code": "products.delete", "module": "products", "action": "delete", "label": "Delete products"},
    {"code": "support.view", "module": "support", "action": "view", "label": "View support tickets"},
    {"code": "support.reply", "module": "support", "action": "edit", "label": "Reply to support tickets"},
    {"code": "helpcenter.manage", "module": "support", "action": "edit", "label": "Manage help center articles"},
    {"code": "chatbot.view", "module": "chatbot", "action": "view", "label": "View chatbot conversations"},
    {"code": "chatbot.manage", "module": "chatbot", "action": "edit", "label": "Manage chatbot system"},
    {"code": "careers.view", "module": "careers", "action": "view", "label": "View careers data"},
    {"code": "careers.manage", "module": "careers", "action": "edit", "label": "Manage careers module"},
    {"code": "advertising.view", "module": "advertising", "action": "view", "label": "View advertising requests, campaigns, and analytics"},
    {"code": "advertising.manage", "module": "advertising", "action": "edit", "label": "Create and manage advertising campaigns and placements"},
    {"code": "advertising.approve", "module": "advertising", "action": "approve", "label": "Approve or reject advertising requests"},
    {"code": "promotions.view", "module": "promotions", "action": "view", "label": "View promotion campaigns, offers, and analytics"},
    {"code": "promotions.manage", "module": "promotions", "action": "edit", "label": "Create and manage promotion campaigns and offers"},
    {"code": "promotions.approve", "module": "promotions", "action": "approve", "label": "Approve vendor-submitted promotion offers"},
    {"code": "content.manage", "module": "content", "action": "edit", "label": "Manage marketing/content sections"},
    {"code": "moderation.manage", "module": "moderation", "action": "edit", "label": "Moderate reported content"},
    {"code": "pickup.view", "module": "pickup", "action": "view", "label": "View pickup stations, assignments, and logs"},
    {"code": "pickup.manage", "module": "pickup", "action": "edit", "label": "Create, update, activate, and deactivate pickup stations"},
    {"code": "pickup.assign", "module": "pickup", "action": "approve", "label": "Assign station managers and station staff"},
    {"code": "pickup.operations", "module": "pickup", "action": "edit", "label": "Run station operations for assigned pickup stations"},
    {"code": "receipts.view", "module": "receipts", "action": "view", "label": "View and download role-scoped receipts"},
    {"code": "receipts.manage", "module": "receipts", "action": "edit", "label": "Regenerate receipts and issue manual receipt records"},
    {"code": "staff.view", "module": "staff", "action": "view", "label": "View staff accounts"},
    {"code": "staff.manage", "module": "staff", "action": "edit", "label": "Manage staff accounts and roles"},
    {"code": "settings.manage", "module": "settings", "action": "edit", "label": "Manage platform settings"},
]

ALL_ADMIN_PERMISSION_CODES = [item["code"] for item in ADMIN_PERMISSION_CATALOG]

DEFAULT_DEPARTMENT_ROLE_TEMPLATES = [
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
            "receipts.view",
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
            "pickup.view",
            "pickup.operations",
            "customers.view",
            "finance.view",
            "receipts.view",
        ],
    },
    {
        "name": "Pickup Operations Staff",
        "slug": "pickup-operations-staff",
        "description": "Handles station-level pickup readiness, collection, notices, and return drop-offs.",
        "permissions": [
            "dashboard.view",
            "orders.view",
            "pickup.view",
            "pickup.operations",
            "receipts.view",
        ],
    },
    {
        "name": "Finance Operations Staff",
        "slug": "finance-operations-staff",
        "description": "Monitors payments, vendor settlements, payouts, and refund operations.",
        "permissions": [
            "dashboard.view",
            "orders.view",
            "payments.manage",
            "finance.view",
            "finance.manage",
            "payouts.manage",
            "receipts.view",
            "receipts.manage",
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
            "promotions.view",
            "promotions.manage",
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
            "advertising.view",
            "advertising.manage",
            "advertising.approve",
            "promotions.view",
            "promotions.manage",
            "promotions.approve",
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


def permission_catalog_payload():
    grouped = defaultdict(list)
    for item in ADMIN_PERMISSION_CATALOG:
        grouped[item["module"]].append(
            {
                "code": item["code"],
                "action": item["action"],
                "label": item["label"],
            }
        )
    return [{"module": module, "permissions": permissions} for module, permissions in grouped.items()]


def modules_from_permissions(permission_codes: list[str]) -> list[str]:
    module_by_code = {item["code"]: item["module"] for item in ADMIN_PERMISSION_CATALOG}
    modules = {"dashboard"}
    for code in permission_codes:
        module = module_by_code.get(code)
        if module:
            modules.add(module)
    return sorted(modules)


def sanitize_permission_codes(permission_codes: list[str]) -> list[str]:
    valid_codes = set(ALL_ADMIN_PERMISSION_CODES)
    cleaned = [code for code in permission_codes if isinstance(code, str) and code in valid_codes]
    return sorted(set(cleaned))


def ensure_default_staff_roles():
    from .models import StaffRole

    for template in DEFAULT_DEPARTMENT_ROLE_TEMPLATES:
        role, created = StaffRole.objects.get_or_create(
            slug=template["slug"],
            defaults={
                "name": template["name"],
                "description": template["description"],
                "permissions": sanitize_permission_codes(template["permissions"]),
                "is_active": True,
            },
        )
        if not created:
            changed = False
            desired_permissions = sanitize_permission_codes(template["permissions"])
            current_permissions = role.permissions if isinstance(role.permissions, list) else []
            merged_permissions = sanitize_permission_codes([*current_permissions, *desired_permissions])
            if merged_permissions != current_permissions:
                role.permissions = merged_permissions
                changed = True
            if not role.description and template["description"]:
                role.description = template["description"]
                changed = True
            if changed:
                role.save(update_fields=["permissions", "description", "updated_at"])


def log_admin_activity(
    actor,
    action: str,
    description: str,
    target_type: str = "",
    target_id: str = "",
    metadata: dict | None = None,
):
    from .models import AdminActivityLog

    AdminActivityLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id else "",
        description=description[:255],
        metadata=metadata or {},
    )
