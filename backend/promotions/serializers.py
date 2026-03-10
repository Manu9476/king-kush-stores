from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from products.models import Product
from products.serializers import ProductSerializer

from .models import (
    PromotionCampaign,
    PromotionCampaignStatus,
    PromotionDiscountType,
    PromotionEvent,
    PromotionEventType,
    PromotionOffer,
    PromotionOfferReviewStatus,
)
from .services import get_product_pricing


class PromotionCampaignSerializer(serializers.ModelSerializer):
    banner_image_url = serializers.SerializerMethodField()

    class Meta:
        model = PromotionCampaign
        fields = (
            "id",
            "campaign_type",
            "name",
            "slug",
            "description",
            "hero_title",
            "hero_subtitle",
            "hero_cta_label",
            "hero_cta_url",
            "countdown_label",
            "announcement_text",
            "banner_image",
            "banner_image_url",
            "status",
            "is_visible",
            "starts_at",
            "ends_at",
            "sections_config",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "slug", "created_by", "updated_by", "created_at", "updated_at", "banner_image_url")

    def get_banner_image_url(self, obj):
        if not obj.banner_image:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.banner_image.url)
        return obj.banner_image.url


class PromotionOfferSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(source="product", queryset=Product.objects.all(), write_only=True)
    campaign_id = serializers.PrimaryKeyRelatedField(source="campaign", queryset=PromotionCampaign.objects.all(), write_only=True)
    discounted_price = serializers.SerializerMethodField()
    savings_amount = serializers.SerializerMethodField()
    savings_percent = serializers.SerializerMethodField()
    stock_remaining = serializers.SerializerMethodField()

    class Meta:
        model = PromotionOffer
        fields = (
            "id",
            "campaign",
            "campaign_id",
            "product",
            "product_id",
            "submitted_by_vendor",
            "source_type",
            "review_status",
            "discount_type",
            "discount_value",
            "promotional_stock_limit",
            "promotional_stock_sold",
            "stock_remaining",
            "section_key",
            "badge_text",
            "urgency_text",
            "is_flash_deal",
            "flash_start_at",
            "flash_end_at",
            "is_enabled",
            "priority",
            "admin_notes",
            "approved_by",
            "approved_at",
            "impression_count",
            "click_count",
            "orders_count",
            "units_sold",
            "revenue_generated",
            "discounted_price",
            "savings_amount",
            "savings_percent",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "submitted_by_vendor",
            "source_type",
            "approved_by",
            "approved_at",
            "impression_count",
            "click_count",
            "orders_count",
            "units_sold",
            "revenue_generated",
            "discounted_price",
            "savings_amount",
            "savings_percent",
            "stock_remaining",
            "created_at",
            "updated_at",
        )

    def get_discounted_price(self, obj):
        pricing = get_product_pricing(obj.product, quantity=1, offer=obj)
        return str(pricing["effective_unit_price"])

    def get_savings_amount(self, obj):
        pricing = get_product_pricing(obj.product, quantity=1, offer=obj)
        return str(pricing["discount_per_unit"])

    def get_savings_percent(self, obj):
        pricing = get_product_pricing(obj.product, quantity=1, offer=obj)
        return int(pricing["savings_percent"])

    def get_stock_remaining(self, obj):
        remaining = obj.promotional_stock_remaining
        return None if remaining is None else int(remaining)

    def validate(self, attrs):
        instance = getattr(self, "instance", None)
        discount_type = attrs.get("discount_type", getattr(instance, "discount_type", PromotionDiscountType.PERCENTAGE))
        discount_value = attrs.get("discount_value", getattr(instance, "discount_value", Decimal("0.00")))
        product = attrs.get("product", getattr(instance, "product", None))

        if discount_type == PromotionDiscountType.PERCENTAGE and discount_value > Decimal("99.99"):
            raise serializers.ValidationError({"discount_value": "Percentage discount cannot exceed 99.99."})

        if discount_type == PromotionDiscountType.FIXED and product and discount_value >= product.price:
            raise serializers.ValidationError({"discount_value": "Fixed discount must be less than product price."})

        campaign = attrs.get("campaign", getattr(instance, "campaign", None))
        if campaign and campaign.status == PromotionCampaignStatus.ENDED:
            raise serializers.ValidationError({"campaign_id": "Cannot attach offers to an ended campaign."})

        return attrs


class PromotionPublicOfferSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    discounted_price = serializers.SerializerMethodField()
    savings_amount = serializers.SerializerMethodField()
    savings_percent = serializers.SerializerMethodField()
    stock_remaining = serializers.SerializerMethodField()

    class Meta:
        model = PromotionOffer
        fields = (
            "id",
            "product",
            "discount_type",
            "discount_value",
            "section_key",
            "badge_text",
            "urgency_text",
            "is_flash_deal",
            "flash_end_at",
            "priority",
            "stock_remaining",
            "discounted_price",
            "savings_amount",
            "savings_percent",
        )

    def get_discounted_price(self, obj):
        return str(get_product_pricing(obj.product, quantity=1, offer=obj)["effective_unit_price"])

    def get_savings_amount(self, obj):
        return str(get_product_pricing(obj.product, quantity=1, offer=obj)["discount_per_unit"])

    def get_savings_percent(self, obj):
        return int(get_product_pricing(obj.product, quantity=1, offer=obj)["savings_percent"])

    def get_stock_remaining(self, obj):
        remaining = obj.promotional_stock_remaining
        return None if remaining is None else int(remaining)


class PromotionEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = PromotionEvent
        fields = ("id", "offer", "event_type", "page_path", "created_at")
        read_only_fields = ("id", "created_at")

    def validate_event_type(self, value):
        if value not in {PromotionEventType.IMPRESSION, PromotionEventType.CLICK}:
            raise serializers.ValidationError("Invalid promotion event type.")
        return value
