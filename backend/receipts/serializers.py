from rest_framework import serializers

from .models import Receipt


class ReceiptSerializer(serializers.ModelSerializer):
    owner_email = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()
    vendor_name = serializers.SerializerMethodField()
    station_name = serializers.SerializerMethodField()
    pdf_file_url = serializers.SerializerMethodField()

    class Meta:
        model = Receipt
        fields = (
            "id",
            "receipt_number",
            "category",
            "receipt_type",
            "owner_type",
            "owner_user",
            "owner_email",
            "customer",
            "customer_email",
            "vendor",
            "vendor_name",
            "station",
            "station_name",
            "order",
            "payment",
            "refund",
            "payout_request",
            "vendor_order",
            "related_entity_type",
            "related_entity_id",
            "related_reference",
            "currency",
            "gross_amount",
            "fee_amount",
            "commission_amount",
            "tax_amount",
            "net_amount",
            "payment_method",
            "status",
            "summary",
            "actor_snapshot",
            "revision_of",
            "pdf_file_url",
            "created_at",
        )
        read_only_fields = fields

    def get_owner_email(self, obj):
        return obj.owner_user.email if obj.owner_user_id else ""

    def get_customer_email(self, obj):
        return obj.customer.email if obj.customer_id else ""

    def get_vendor_name(self, obj):
        return obj.vendor.store_name if obj.vendor_id else ""

    def get_station_name(self, obj):
        if not obj.station_id:
            return ""
        return f"{obj.station.name} ({obj.station.city})"

    def get_pdf_file_url(self, obj):
        if not obj.pdf_file:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.pdf_file.url)
        return obj.pdf_file.url

