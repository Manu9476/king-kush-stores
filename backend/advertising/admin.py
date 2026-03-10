from django.contrib import admin

from .models import AdvertisingCampaign, AdvertisingEvent, AdvertisingPlacement, AdvertisingRequest


@admin.register(AdvertisingPlacement)
class AdvertisingPlacementAdmin(admin.ModelAdmin):
    list_display = ("name", "key", "max_ads_per_page", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "key", "description")


@admin.register(AdvertisingRequest)
class AdvertisingRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "company_name", "email", "business_type", "status", "created_at", "reviewed_at")
    list_filter = ("status", "business_type", "created_at")
    search_fields = ("full_name", "company_name", "email", "phone_number", "ad_objective")
    autocomplete_fields = ("preferred_placement", "requester", "vendor_profile", "reviewed_by")
    readonly_fields = ("created_at", "updated_at", "reviewed_at")


@admin.register(AdvertisingCampaign)
class AdvertisingCampaignAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "placement", "source_type", "status", "priority", "impression_count", "click_count")
    list_filter = ("status", "source_type", "placement", "is_visible", "is_sponsored")
    search_fields = ("title", "subtitle", "description", "target_url")
    autocomplete_fields = ("placement", "owner", "vendor_context", "linked_request", "approved_by", "created_by")
    readonly_fields = ("impression_count", "click_count", "created_at", "updated_at", "last_served_at")


@admin.register(AdvertisingEvent)
class AdvertisingEventAdmin(admin.ModelAdmin):
    list_display = ("id", "campaign", "event_type", "page_path", "session_id", "created_at")
    list_filter = ("event_type", "created_at")
    search_fields = ("campaign__title", "page_path", "context_key", "session_id")
    autocomplete_fields = ("campaign", "user")
    readonly_fields = ("created_at",)

# Register your models here.
