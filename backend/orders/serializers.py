# backend/orders/serializers.py
import re
from rest_framework import serializers
from .models import (
    CustomerRefund,
    MarketplacePayment,
    Order,
    OrderItem,
    PaymentMethod,
    ShippingAddress,
    VendorOrder,
    VendorOrderItem,
    VendorPayoutRequest,
    VendorWallet,
    VendorWalletTransaction,
)
from products.models import Product
from users.serializers import UserSerializer

# A lean serializer for displaying product info inside an order item
class OrderItemProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ('id', 'title', 'slug')

class OrderItemSerializer(serializers.ModelSerializer):
    product = OrderItemProductSerializer(read_only=True)
    promotion_badge = serializers.SerializerMethodField()
    savings_per_unit = serializers.SerializerMethodField()
    selected_unit_label = serializers.SerializerMethodField()
    
    class Meta:
        model = OrderItem
        fields = (
            'id',
            'product',
            'price_at_purchase',
            'original_price',
            'quantity',
            'sale_option',
            'sale_option_label',
            'sale_option_quantity_value',
            'sale_option_quantity_unit',
            'sale_option_stock_units_consumed',
            'selected_unit_label',
            'promotion_offer',
            'promotion_badge',
            'savings_per_unit',
        )

    def get_promotion_badge(self, obj):
        if obj.promotion_offer_id:
            return obj.promotion_offer.badge_text
        return ""

    def get_savings_per_unit(self, obj):
        if obj.original_price is None:
            return "0.00"
        return str(max(obj.original_price - obj.price_at_purchase, 0))

    def get_selected_unit_label(self, obj):
        if obj.sale_option_label:
            return obj.sale_option_label
        return obj.product.base_unit_label if obj.product_id else "unit"

class ShippingAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShippingAddress
        fields = '__all__'
        read_only_fields = ('id', 'user')

class OrderSerializer(serializers.ModelSerializer):
    # Use the correct related_name 'items' from the OrderItem model
    items = OrderItemSerializer(many=True, read_only=True)
    shipping_address = ShippingAddressSerializer(read_only=True)
    user = UserSerializer(read_only=True)
    pickup_station = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'user', 'order_number', 'shipping_address', 'total_amount', 
            'status', 'is_paid', 'paid_at', 'payment_verified_at', 'created_at',
            'fulfillment_method', 'pickup_station', 'pickup_ready_at', 'picked_up_at', 'items'
        ]

    def get_pickup_station(self, obj):
        if not getattr(obj, "pickup_station_id", None):
            return None
        station = obj.pickup_station
        return {
            "id": station.id,
            "ownership_type": station.ownership_type,
            "name": station.name,
            "city": station.city,
            "address": station.address,
            "contact_phone": station.contact_phone,
            "operating_hours": station.operating_hours,
            "is_active": station.is_active,
            "temporary_notice": station.temporary_notice,
        }


def _mask_mpesa_phone(phone: str) -> str:
    digits = ''.join(ch for ch in phone if ch.isdigit())
    if len(digits) <= 4:
        return digits
    return f"{digits[:2]}{'*' * (len(digits) - 4)}{digits[-2:]}"


def _parse_expiry(value: str) -> tuple[int, int]:
    cleaned = value.strip()
    match = re.match(r'^(0[1-9]|1[0-2])\/(\d{2}|\d{4})$', cleaned)
    if not match:
        raise serializers.ValidationError("Card expiry must be in MM/YY or MM/YYYY format.")

    month = int(match.group(1))
    year_raw = match.group(2)
    year = int(year_raw)
    if len(year_raw) == 2:
        year += 2000
    if year < 2000 or year > 2100:
        raise serializers.ValidationError("Card expiry year is invalid.")

    return month, year


class PaymentMethodSerializer(serializers.ModelSerializer):
    card_number = serializers.CharField(write_only=True, required=False, allow_blank=True)
    card_expiry = serializers.CharField(write_only=True, required=False, allow_blank=True)
    mpesa_phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    display_name = serializers.SerializerMethodField()
    masked_reference = serializers.SerializerMethodField()

    class Meta:
        model = PaymentMethod
        fields = (
            'id',
            'user',
            'method_type',
            'provider',
            'cardholder_name',
            'card_last4',
            'card_expiry_month',
            'card_expiry_year',
            'mpesa_phone_masked',
            'billing_email',
            'is_default',
            'created_at',
            'updated_at',
            'display_name',
            'masked_reference',
            'card_number',
            'card_expiry',
            'mpesa_phone',
        )
        read_only_fields = (
            'id',
            'user',
            'card_last4',
            'card_expiry_month',
            'card_expiry_year',
            'mpesa_phone_masked',
            'created_at',
            'updated_at',
            'display_name',
            'masked_reference',
        )

    def get_display_name(self, obj: PaymentMethod) -> str:
        if obj.method_type == 'card':
            return f"{obj.provider or 'Card'} ending {obj.card_last4 or '****'}"
        return f"M-Pesa {obj.mpesa_phone_masked or ''}".strip()

    def get_masked_reference(self, obj: PaymentMethod) -> str:
        if obj.method_type == 'card':
            expiry = ""
            if obj.card_expiry_month and obj.card_expiry_year:
                expiry = f" (exp {obj.card_expiry_month:02d}/{str(obj.card_expiry_year)[-2:]})"
            return f"**** **** **** {obj.card_last4 or '****'}{expiry}"
        return obj.mpesa_phone_masked or ""

    def validate(self, attrs):
        method_type = attrs.get('method_type', getattr(self.instance, 'method_type', None))
        if method_type not in {'card', 'mpesa'}:
            raise serializers.ValidationError({'method_type': 'Method type must be card or mpesa.'})

        if method_type == 'card':
            card_number = attrs.pop('card_number', None)
            card_expiry = attrs.pop('card_expiry', None)

            if card_number:
                digits = ''.join(ch for ch in card_number if ch.isdigit())
                if len(digits) < 12 or len(digits) > 19:
                    raise serializers.ValidationError({'card_number': 'Card number looks invalid.'})
                attrs['card_last4'] = digits[-4:]
            elif not self.instance or not self.instance.card_last4:
                raise serializers.ValidationError({'card_number': 'Card number is required for card methods.'})

            if card_expiry:
                month, year = _parse_expiry(card_expiry)
                attrs['card_expiry_month'] = month
                attrs['card_expiry_year'] = year
            elif not self.instance or not (self.instance.card_expiry_month and self.instance.card_expiry_year):
                raise serializers.ValidationError({'card_expiry': 'Card expiry is required for card methods.'})

            cardholder = attrs.get('cardholder_name', getattr(self.instance, 'cardholder_name', '')).strip()
            if not cardholder:
                raise serializers.ValidationError({'cardholder_name': 'Cardholder name is required for card methods.'})
            attrs['cardholder_name'] = cardholder
            attrs['provider'] = (attrs.get('provider') or getattr(self.instance, 'provider', '') or 'Card').strip()
            attrs['mpesa_phone_masked'] = None

        if method_type == 'mpesa':
            mpesa_phone = attrs.pop('mpesa_phone', None)
            if mpesa_phone:
                digits = ''.join(ch for ch in mpesa_phone if ch.isdigit())
                if len(digits) < 9:
                    raise serializers.ValidationError({'mpesa_phone': 'M-Pesa phone number looks invalid.'})
                attrs['mpesa_phone_masked'] = _mask_mpesa_phone(digits)
            elif not self.instance or not self.instance.mpesa_phone_masked:
                raise serializers.ValidationError({'mpesa_phone': 'M-Pesa phone number is required.'})

            attrs['provider'] = 'M-Pesa'
            attrs['cardholder_name'] = None
            attrs['card_last4'] = None
            attrs['card_expiry_month'] = None
            attrs['card_expiry_year'] = None

        return attrs


class MarketplacePaymentSerializer(serializers.ModelSerializer):
    order_number = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()

    class Meta:
        model = MarketplacePayment
        fields = (
            "id",
            "order",
            "order_number",
            "customer",
            "customer_email",
            "provider",
            "payment_channel",
            "amount",
            "currency",
            "phone_number",
            "status",
            "merchant_request_id",
            "checkout_request_id",
            "transaction_id",
            "mpesa_receipt_number",
            "result_code",
            "result_desc",
            "initiated_at",
            "confirmed_at",
            "metadata",
        )
        read_only_fields = fields

    def get_order_number(self, obj):
        return obj.order.order_number if obj.order_id else ""

    def get_customer_email(self, obj):
        return obj.customer.email if obj.customer_id else ""


class VendorOrderItemSerializer(serializers.ModelSerializer):
    product_id = serializers.SerializerMethodField()
    product_title = serializers.SerializerMethodField()
    quantity = serializers.SerializerMethodField()
    price_at_purchase = serializers.SerializerMethodField()
    selected_unit_label = serializers.SerializerMethodField()

    class Meta:
        model = VendorOrderItem
        fields = (
            "id",
            "order_item",
            "product_id",
            "product_title",
            "quantity",
            "selected_unit_label",
            "price_at_purchase",
            "line_total",
        )

    def get_product_id(self, obj):
        return obj.order_item.product_id if obj.order_item_id else None

    def get_product_title(self, obj):
        return obj.order_item.product.title if obj.order_item_id else ""

    def get_quantity(self, obj):
        return obj.order_item.quantity if obj.order_item_id else 0

    def get_price_at_purchase(self, obj):
        return str(obj.order_item.price_at_purchase) if obj.order_item_id else "0.00"

    def get_selected_unit_label(self, obj):
        if not obj.order_item_id:
            return "unit"
        if obj.order_item.sale_option_label:
            return obj.order_item.sale_option_label
        return obj.order_item.product.base_unit_label


class VendorOrderSerializer(serializers.ModelSerializer):
    vendor_name = serializers.SerializerMethodField()
    vendor_email = serializers.SerializerMethodField()
    order_number = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()
    items = VendorOrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = VendorOrder
        fields = (
            "id",
            "order",
            "order_number",
            "order_reference",
            "vendor",
            "vendor_name",
            "vendor_email",
            "customer_email",
            "status",
            "gross_amount",
            "platform_commission_rate",
            "platform_commission_amount",
            "vendor_earning_amount",
            "refunded_amount",
            "payout_status",
            "earnings_released",
            "released_at",
            "created_at",
            "updated_at",
            "items",
        )

    def get_vendor_name(self, obj):
        return obj.vendor.store_name if obj.vendor_id else ""

    def get_vendor_email(self, obj):
        return obj.vendor.user.email if obj.vendor_id else ""

    def get_order_number(self, obj):
        return obj.order.order_number if obj.order_id else ""

    def get_customer_email(self, obj):
        return obj.order.user.email if obj.order_id else ""


class VendorWalletTransactionSerializer(serializers.ModelSerializer):
    order_reference = serializers.SerializerMethodField()

    class Meta:
        model = VendorWalletTransaction
        fields = (
            "id",
            "transaction_type",
            "direction",
            "amount",
            "balance_after",
            "status",
            "description",
            "order_reference",
            "created_at",
            "metadata",
        )

    def get_order_reference(self, obj):
        return obj.vendor_order.order_reference if obj.vendor_order_id else ""


class VendorWalletSerializer(serializers.ModelSerializer):
    vendor_name = serializers.SerializerMethodField()

    class Meta:
        model = VendorWallet
        fields = (
            "id",
            "vendor",
            "vendor_name",
            "available_balance",
            "pending_balance",
            "lifetime_earnings",
            "total_paid_out",
            "total_refunded",
            "updated_at",
        )

    def get_vendor_name(self, obj):
        return obj.vendor.store_name if obj.vendor_id else ""


class VendorPayoutRequestSerializer(serializers.ModelSerializer):
    vendor_name = serializers.SerializerMethodField()
    vendor_email = serializers.SerializerMethodField()

    class Meta:
        model = VendorPayoutRequest
        fields = (
            "id",
            "vendor",
            "vendor_name",
            "vendor_email",
            "wallet",
            "amount",
            "phone_number",
            "status",
            "requested_at",
            "reviewed_at",
            "paid_at",
            "reviewed_by",
            "external_reference",
            "notes",
            "metadata",
        )
        read_only_fields = (
            "id",
            "wallet",
            "status",
            "requested_at",
            "reviewed_at",
            "paid_at",
            "reviewed_by",
            "external_reference",
            "metadata",
        )

    def get_vendor_name(self, obj):
        return obj.vendor.store_name if obj.vendor_id else ""

    def get_vendor_email(self, obj):
        return obj.vendor.user.email if obj.vendor_id else ""


class CustomerRefundSerializer(serializers.ModelSerializer):
    order_number = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()

    class Meta:
        model = CustomerRefund
        fields = (
            "id",
            "order",
            "order_number",
            "payment",
            "customer",
            "customer_email",
            "requested_by",
            "amount",
            "reason",
            "status",
            "mpesa_reversal_reference",
            "metadata",
            "created_at",
            "completed_at",
        )
        read_only_fields = fields

    def get_order_number(self, obj):
        return obj.order.order_number if obj.order_id else ""

    def get_customer_email(self, obj):
        return obj.customer.email if obj.customer_id else ""
