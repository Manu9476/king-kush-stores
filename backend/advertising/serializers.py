from django.db.models import F
from django.utils import timezone
from rest_framework import serializers

from .models import (
    AdvertisingBusinessType,
    AdvertisingCampaign,
    AdvertisingCampaignPurpose,
    AdvertisingCampaignSource,
    AdvertisingCampaignStatus,
    AdvertisingEvent,
    AdvertisingEventType,
    AdvertisingPlacement,
    AdvertisingRequest,
    AdvertisingRequestStatus,
)


class AdvertisingPlacementSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdvertisingPlacement
        fields = (
            "id",
            "key",
            "name",
            "description",
            "max_ads_per_page",
            "default_image_width",
            "default_image_height",
            "is_active",
            "created_at",
            "updated_at",
        )


class AdvertisingRequestCreateSerializer(serializers.ModelSerializer):
    preferred_placement_id = serializers.PrimaryKeyRelatedField(
        source="preferred_placement",
        queryset=AdvertisingPlacement.objects.filter(is_active=True),
        write_only=True,
        required=False,
        allow_null=True,
    )
    preferred_placement = AdvertisingPlacementSerializer(read_only=True)
    business_type = serializers.ChoiceField(choices=AdvertisingBusinessType.choices, default=AdvertisingBusinessType.OTHER)

    class Meta:
        model = AdvertisingRequest
        fields = (
            "id",
            "full_name",
            "company_name",
            "email",
            "phone_number",
            "business_type",
            "ad_objective",
            "preferred_placement_id",
            "preferred_placement",
            "campaign_duration",
            "budget_range",
            "message",
            "status",
            "created_at",
        )
        read_only_fields = ("id", "status", "created_at")

    def create(self, validated_data):
        request = self.context.get("request")
        user = request.user if request and request.user.is_authenticated else None
        vendor_profile = getattr(user, "vendor_profile", None) if user else None
        return AdvertisingRequest.objects.create(
            requester=user,
            vendor_profile=vendor_profile,
            **validated_data,
        )


class AdvertisingRequestAdminSerializer(serializers.ModelSerializer):
    preferred_placement = AdvertisingPlacementSerializer(read_only=True)
    preferred_placement_id = serializers.PrimaryKeyRelatedField(
        source="preferred_placement",
        queryset=AdvertisingPlacement.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )
    requester_email = serializers.SerializerMethodField()
    reviewed_by_email = serializers.SerializerMethodField()

    class Meta:
        model = AdvertisingRequest
        fields = (
            "id",
            "requester",
            "requester_email",
            "vendor_profile",
            "full_name",
            "company_name",
            "email",
            "phone_number",
            "business_type",
            "ad_objective",
            "preferred_placement",
            "preferred_placement_id",
            "campaign_duration",
            "budget_range",
            "message",
            "status",
            "admin_notes",
            "reviewed_by",
            "reviewed_by_email",
            "reviewed_at",
            "created_at",
            "updated_at",
        )

    def get_requester_email(self, obj: AdvertisingRequest) -> str:
        return obj.requester.email if obj.requester else ""

    def get_reviewed_by_email(self, obj: AdvertisingRequest) -> str:
        return obj.reviewed_by.email if obj.reviewed_by else ""


class AdvertisingRequestReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdvertisingRequest
        fields = ("status", "admin_notes")

    def validate_status(self, value):
        allowed = {choice[0] for choice in AdvertisingRequestStatus.choices}
        if value not in allowed:
            raise serializers.ValidationError("Invalid request status.")
        return value


class AdvertisingCampaignSerializer(serializers.ModelSerializer):
    placement = AdvertisingPlacementSerializer(read_only=True)
    placement_id = serializers.PrimaryKeyRelatedField(
        source="placement",
        queryset=AdvertisingPlacement.objects.filter(is_active=True),
        write_only=True,
        required=True,
    )
    creative_image_url = serializers.SerializerMethodField()
    ctr = serializers.SerializerMethodField()
    owner_email = serializers.SerializerMethodField()
    approved_by_email = serializers.SerializerMethodField()

    class Meta:
        model = AdvertisingCampaign
        fields = (
            "id",
            "source_type",
            "linked_request",
            "placement",
            "placement_id",
            "owner",
            "owner_email",
            "vendor_context",
            "title",
            "purpose",
            "subtitle",
            "description",
            "target_url",
            "cta_label",
            "creative_image",
            "creative_image_url",
            "category_context",
            "status",
            "is_visible",
            "is_sponsored",
            "priority",
            "start_at",
            "end_at",
            "budget_amount",
            "pricing_notes",
            "impression_count",
            "click_count",
            "ctr",
            "approved_by",
            "approved_by_email",
            "approved_at",
            "approval_notes",
            "created_by",
            "last_served_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "impression_count",
            "click_count",
            "ctr",
            "approved_by",
            "approved_by_email",
            "approved_at",
            "created_by",
            "last_served_at",
            "created_at",
            "updated_at",
        )

    def get_creative_image_url(self, obj: AdvertisingCampaign) -> str:
        if not obj.creative_image:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.creative_image.url)
        return obj.creative_image.url

    def get_ctr(self, obj: AdvertisingCampaign) -> float:
        return obj.ctr

    def get_owner_email(self, obj: AdvertisingCampaign) -> str:
        return obj.owner.email if obj.owner else ""

    def get_approved_by_email(self, obj: AdvertisingCampaign) -> str:
        return obj.approved_by.email if obj.approved_by else ""

    def validate_source_type(self, value):
        allowed = {choice[0] for choice in AdvertisingCampaignSource.choices}
        if value not in allowed:
            raise serializers.ValidationError("Invalid campaign source.")
        return value

    def validate_purpose(self, value):
        allowed = {choice[0] for choice in AdvertisingCampaignPurpose.choices}
        if value not in allowed:
            raise serializers.ValidationError("Invalid campaign purpose.")
        return value

    def validate_status(self, value):
        allowed = {choice[0] for choice in AdvertisingCampaignStatus.choices}
        if value not in allowed:
            raise serializers.ValidationError("Invalid campaign status.")
        return value

    def validate(self, attrs):
        start_at = attrs.get("start_at", getattr(self.instance, "start_at", None))
        end_at = attrs.get("end_at", getattr(self.instance, "end_at", None))
        if start_at and end_at and end_at < start_at:
            raise serializers.ValidationError({"end_at": "End date must be after start date."})
        return attrs


class AdvertisingPublicCampaignSerializer(serializers.ModelSerializer):
    placement = AdvertisingPlacementSerializer(read_only=True)
    creative_image_url = serializers.SerializerMethodField()
    ctr = serializers.SerializerMethodField()

    class Meta:
        model = AdvertisingCampaign
        fields = (
            "id",
            "source_type",
            "placement",
            "title",
            "purpose",
            "subtitle",
            "description",
            "target_url",
            "cta_label",
            "creative_image_url",
            "category_context",
            "is_sponsored",
            "priority",
            "start_at",
            "end_at",
            "impression_count",
            "click_count",
            "ctr",
        )

    def get_creative_image_url(self, obj: AdvertisingCampaign) -> str:
        if not obj.creative_image:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.creative_image.url)
        return obj.creative_image.url

    def get_ctr(self, obj: AdvertisingCampaign) -> float:
        return obj.ctr


class AdvertisingEventCreateSerializer(serializers.Serializer):
    campaign_id = serializers.PrimaryKeyRelatedField(source="campaign", queryset=AdvertisingCampaign.objects.all())
    event_type = serializers.ChoiceField(choices=AdvertisingEventType.choices)
    page_path = serializers.CharField(required=False, allow_blank=True, max_length=255)
    context_key = serializers.CharField(required=False, allow_blank=True, max_length=120)
    session_id = serializers.CharField(required=False, allow_blank=True, max_length=120)

    def validate(self, attrs):
        campaign: AdvertisingCampaign = attrs["campaign"]
        if not campaign.is_live(timezone.now()):
            raise serializers.ValidationError({"campaign_id": "Campaign is not active."})
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        user = request.user if request and request.user.is_authenticated else None
        event = AdvertisingEvent.objects.create(
            campaign=validated_data["campaign"],
            event_type=validated_data["event_type"],
            user=user,
            page_path=validated_data.get("page_path", ""),
            context_key=validated_data.get("context_key", ""),
            session_id=validated_data.get("session_id", ""),
            ip_address=(request.META.get("REMOTE_ADDR") if request else None),
            user_agent=(request.META.get("HTTP_USER_AGENT", "")[:255] if request else ""),
        )
        if event.event_type == AdvertisingEventType.IMPRESSION:
            AdvertisingCampaign.objects.filter(id=event.campaign_id).update(
                impression_count=F("impression_count") + 1,
                last_served_at=timezone.now(),
            )
        else:
            AdvertisingCampaign.objects.filter(id=event.campaign_id).update(click_count=F("click_count") + 1)
        return event
