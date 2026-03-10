from django.contrib import admin

from .models import PickupOrderOperation, PickupStation, PickupStationAssignment


@admin.register(PickupStation)
class PickupStationAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "ownership_type",
        "vendor_profile",
        "city",
        "contact_phone",
        "approval_status",
        "is_visible_to_customers",
        "is_active",
        "supports_pickup",
        "supports_returns",
        "updated_at",
    )
    list_filter = (
        "ownership_type",
        "approval_status",
        "is_visible_to_customers",
        "city",
        "is_active",
        "supports_pickup",
        "supports_returns",
    )
    search_fields = ("name", "city", "address", "contact_phone", "vendor_profile__store_name", "vendor_profile__user__email")


@admin.register(PickupStationAssignment)
class PickupStationAssignmentAdmin(admin.ModelAdmin):
    list_display = ("station", "user", "role", "is_active", "can_manage_local_staff", "assigned_at")
    list_filter = ("role", "is_active", "station__city")
    search_fields = ("station__name", "station__city", "user__email")


@admin.register(PickupOrderOperation)
class PickupOrderOperationAdmin(admin.ModelAdmin):
    list_display = ("station", "order", "event_type", "actor", "created_at")
    list_filter = ("event_type", "station__city")
    search_fields = ("order__order_number", "station__name", "actor__email")
