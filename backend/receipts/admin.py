from django.contrib import admin

from .models import Receipt


@admin.register(Receipt)
class ReceiptAdmin(admin.ModelAdmin):
    list_display = (
        "receipt_number",
        "category",
        "receipt_type",
        "owner_type",
        "owner_user",
        "related_reference",
        "gross_amount",
        "net_amount",
        "created_at",
    )
    list_filter = ("category", "receipt_type", "owner_type", "status", "created_at")
    search_fields = (
        "receipt_number",
        "receipt_type",
        "related_reference",
        "related_entity_type",
        "owner_user__email",
        "customer__email",
        "vendor__store_name",
    )
    readonly_fields = [field.name for field in Receipt._meta.fields]

