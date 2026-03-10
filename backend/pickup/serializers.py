from rest_framework import serializers

from orders.models import Order
from users.models import CustomUser, VendorProfile

from .models import PickupOrderOperation, PickupStation, PickupStationAssignment
from .services import sync_vendor_owned_stations, vendor_station_sync_payload


class PickupStationSerializer(serializers.ModelSerializer):
    vendor_profile = serializers.PrimaryKeyRelatedField(
        queryset=VendorProfile.objects.select_related("user").all(),
        required=False,
        allow_null=True,
    )
    vendor_store_name = serializers.SerializerMethodField()
    vendor_email = serializers.SerializerMethodField()

    class Meta:
        model = PickupStation
        fields = (
            "id",
            "ownership_type",
            "vendor_profile",
            "vendor_store_name",
            "vendor_email",
            "name",
            "city",
            "address",
            "operating_hours",
            "contact_phone",
            "contact_email",
            "services",
            "is_active",
            "supports_pickup",
            "supports_returns",
            "approval_status",
            "is_visible_to_customers",
            "sync_name",
            "sync_address",
            "sync_contact",
            "sync_operating_hours",
            "sync_active_status",
            "last_vendor_sync_at",
            "temporary_notice",
            "notice_updated_at",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "notice_updated_at",
            "last_vendor_sync_at",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        )

    def validate_services(self, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("Services must be a list of strings.")
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        return cleaned

    def validate(self, attrs):
        ownership_type = attrs.get("ownership_type", getattr(self.instance, "ownership_type", "platform"))
        vendor_profile = attrs.get("vendor_profile", getattr(self.instance, "vendor_profile", None))

        if ownership_type == "vendor":
            if not vendor_profile:
                raise serializers.ValidationError({"vendor_profile": "Vendor-managed stations must be linked to a vendor profile."})
            # Vendor-owned stations default to sync-enabled unless explicitly set otherwise.
            attrs.setdefault("sync_name", True)
            attrs.setdefault("sync_address", True)
            attrs.setdefault("sync_contact", True)
            attrs.setdefault("sync_operating_hours", True)
            attrs.setdefault("sync_active_status", True)
            attrs.setdefault("approval_status", "pending")
        else:
            attrs["vendor_profile"] = None
            attrs["sync_name"] = False
            attrs["sync_address"] = False
            attrs["sync_contact"] = False
            attrs["sync_operating_hours"] = False
            attrs["sync_active_status"] = False
            if attrs.get("approval_status") == "pending":
                attrs["approval_status"] = "approved"

        return attrs

    def create(self, validated_data):
        station = super().create(validated_data)
        if station.ownership_type == "vendor" and station.vendor_profile_id:
            snapshot = vendor_station_sync_payload(station.vendor_profile)
            if station.sync_name:
                station.name = snapshot["name"]
            if station.sync_address:
                station.city = snapshot["city"]
                station.address = snapshot["address"]
            if station.sync_contact:
                station.contact_phone = snapshot["contact_phone"]
                station.contact_email = snapshot["contact_email"]
            if station.sync_operating_hours:
                station.operating_hours = snapshot["operating_hours"]
            if station.sync_active_status:
                station.is_active = snapshot["is_active"]
                if station.approval_status not in {"suspended", "rejected"}:
                    station.approval_status = "approved" if snapshot["is_active"] else "pending"
            station.save()
            sync_vendor_owned_stations(station.vendor_profile)
        return station

    def update(self, instance, validated_data):
        station = super().update(instance, validated_data)
        if station.ownership_type == "vendor" and station.vendor_profile_id:
            sync_vendor_owned_stations(station.vendor_profile)
        return station

    def get_vendor_store_name(self, obj):
        if not obj.vendor_profile_id:
            return ""
        return obj.vendor_profile.store_name

    def get_vendor_email(self, obj):
        if not obj.vendor_profile_id:
            return ""
        return obj.vendor_profile.user.email


class PickupStationAssignmentSerializer(serializers.ModelSerializer):
    station_name = serializers.SerializerMethodField()
    user_email = serializers.SerializerMethodField()
    assigned_by_email = serializers.SerializerMethodField()
    user_full_name = serializers.SerializerMethodField()

    class Meta:
        model = PickupStationAssignment
        fields = (
            "id",
            "station",
            "station_name",
            "user",
            "user_email",
            "user_full_name",
            "role",
            "can_manage_local_staff",
            "is_active",
            "notes",
            "assigned_by",
            "assigned_by_email",
            "assigned_at",
            "updated_at",
        )
        read_only_fields = ("id", "assigned_by", "assigned_by_email", "assigned_at", "updated_at")

    def validate_user(self, value: CustomUser):
        if value.role != "admin":
            raise serializers.ValidationError("Only admin/staff accounts can be assigned to station operations.")
        return value

    def get_station_name(self, obj):
        return obj.station.name if obj.station_id else ""

    def get_user_email(self, obj):
        return obj.user.email if obj.user_id else ""

    def get_user_full_name(self, obj):
        if not obj.user_id:
            return ""
        full_name = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return full_name or obj.user.email

    def get_assigned_by_email(self, obj):
        return obj.assigned_by.email if obj.assigned_by else ""


class PickupOrderOperationSerializer(serializers.ModelSerializer):
    station_name = serializers.SerializerMethodField()
    order_number = serializers.SerializerMethodField()
    actor_email = serializers.SerializerMethodField()

    class Meta:
        model = PickupOrderOperation
        fields = (
            "id",
            "station",
            "station_name",
            "order",
            "order_number",
            "actor",
            "actor_email",
            "event_type",
            "notes",
            "metadata",
            "created_at",
        )
        read_only_fields = fields

    def get_station_name(self, obj):
        return obj.station.name if obj.station_id else ""

    def get_order_number(self, obj):
        return obj.order.order_number if obj.order_id else ""

    def get_actor_email(self, obj):
        return obj.actor.email if obj.actor_id else ""


class PickupOrderSummarySerializer(serializers.ModelSerializer):
    station_name = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()
    shipping_city = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            "id",
            "order_number",
            "status",
            "is_paid",
            "total_amount",
            "created_at",
            "updated_at",
            "fulfillment_method",
            "pickup_ready_at",
            "picked_up_at",
            "station_name",
            "customer_email",
            "shipping_city",
        )

    def get_station_name(self, obj):
        return obj.pickup_station.name if getattr(obj, "pickup_station_id", None) else ""

    def get_customer_email(self, obj):
        return obj.user.email if obj.user_id else ""

    def get_shipping_city(self, obj):
        if not obj.shipping_address_id:
            return ""
        return obj.shipping_address.city
