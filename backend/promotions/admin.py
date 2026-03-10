from django.contrib import admin

from .models import PromotionCampaign, PromotionEvent, PromotionOffer


@admin.register(PromotionCampaign)
class PromotionCampaignAdmin(admin.ModelAdmin):
    list_display = ("name", "campaign_type", "status", "starts_at", "ends_at", "is_visible", "updated_at")
    list_filter = ("campaign_type", "status", "is_visible")
    search_fields = ("name", "description", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(PromotionOffer)
class PromotionOfferAdmin(admin.ModelAdmin):
    list_display = (
        "campaign",
        "product",
        "source_type",
        "review_status",
        "discount_type",
        "discount_value",
        "is_enabled",
        "priority",
        "updated_at",
    )
    list_filter = ("campaign", "source_type", "review_status", "discount_type", "is_enabled", "is_flash_deal")
    search_fields = ("campaign__name", "product__title", "product__vendor__store_name")


@admin.register(PromotionEvent)
class PromotionEventAdmin(admin.ModelAdmin):
    list_display = ("offer", "event_type", "user", "page_path", "created_at")
    list_filter = ("event_type",)
    search_fields = ("offer__product__title", "page_path", "user__email")
