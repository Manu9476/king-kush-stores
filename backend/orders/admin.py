from django.contrib import admin
from .models import (
    Cart,
    CartItem,
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

class CartItemInline(admin.TabularInline):
    """
    Displays items inside a Cart directly on the Cart admin page.
    """
    model = CartItem
    extra = 0

class CartAdmin(admin.ModelAdmin):
    """
    Configures how the Cart model is displayed.
    """
    list_display = ['user', 'created_at', 'updated_at']
    search_fields = ['user__email']
    inlines = [CartItemInline]

class OrderItemInline(admin.TabularInline):
    """
    Displays purchased products directly inside the Order admin page.
    """
    model = OrderItem
    extra = 0
    # Make price read-only so admins don't accidentally change historical purchase prices
    readonly_fields = ['price_at_purchase'] 

class OrderAdmin(admin.ModelAdmin):
    """
    Configures how the final Order is displayed.
    """
    list_display = ['order_number', 'user', 'status', 'total_amount', 'is_paid', 'created_at']
    list_filter = ['status', 'is_paid', 'created_at']
    search_fields = ['order_number', 'user__email']
    
    # Order numbers are auto-generated, so we make them read-only
    readonly_fields = ['order_number', 'created_at', 'updated_at']
    inlines = [OrderItemInline]

class ShippingAddressAdmin(admin.ModelAdmin):
    """
    Configures how Shipping Addresses are displayed.
    """
    list_display = ['full_name', 'user', 'city', 'phone_number', 'is_default']
    search_fields = ['full_name', 'user__email', 'city', 'phone_number']
    list_filter = ['city', 'is_default']


class PaymentMethodAdmin(admin.ModelAdmin):
    list_display = ['user', 'method_type', 'provider', 'card_last4', 'mpesa_phone_masked', 'is_default', 'updated_at']
    search_fields = ['user__email', 'provider', 'card_last4', 'mpesa_phone_masked', 'billing_email']
    list_filter = ['method_type', 'is_default', 'updated_at']
    readonly_fields = ['card_last4', 'mpesa_phone_masked', 'updated_at', 'created_at']


@admin.register(MarketplacePayment)
class MarketplacePaymentAdmin(admin.ModelAdmin):
    list_display = ['id', 'order', 'customer', 'provider', 'amount', 'status', 'transaction_id', 'initiated_at']
    list_filter = ['provider', 'status', 'initiated_at']
    search_fields = ['order__order_number', 'customer__email', 'transaction_id', 'mpesa_receipt_number', 'checkout_request_id']
    readonly_fields = ['initiated_at', 'confirmed_at', 'callback_payload', 'metadata']


@admin.register(VendorOrder)
class VendorOrderAdmin(admin.ModelAdmin):
    list_display = ['order_reference', 'order', 'vendor', 'status', 'gross_amount', 'platform_commission_amount', 'vendor_earning_amount', 'payout_status']
    list_filter = ['status', 'payout_status', 'created_at']
    search_fields = ['order_reference', 'order__order_number', 'vendor__store_name', 'vendor__user__email']


@admin.register(VendorOrderItem)
class VendorOrderItemAdmin(admin.ModelAdmin):
    list_display = ['vendor_order', 'order_item', 'line_total']
    search_fields = ['vendor_order__order_reference', 'order_item__order__order_number', 'order_item__product__title']


@admin.register(VendorWallet)
class VendorWalletAdmin(admin.ModelAdmin):
    list_display = ['vendor', 'available_balance', 'pending_balance', 'lifetime_earnings', 'total_paid_out', 'updated_at']
    search_fields = ['vendor__store_name', 'vendor__user__email']
    readonly_fields = ['updated_at']


@admin.register(VendorWalletTransaction)
class VendorWalletTransactionAdmin(admin.ModelAdmin):
    list_display = ['id', 'vendor', 'transaction_type', 'direction', 'amount', 'balance_after', 'status', 'created_at']
    list_filter = ['transaction_type', 'direction', 'status', 'created_at']
    search_fields = ['vendor__store_name', 'vendor__user__email', 'description', 'vendor_order__order_reference']
    readonly_fields = ['created_at']


@admin.register(VendorPayoutRequest)
class VendorPayoutRequestAdmin(admin.ModelAdmin):
    list_display = ['id', 'vendor', 'amount', 'status', 'requested_at', 'paid_at', 'external_reference']
    list_filter = ['status', 'requested_at', 'paid_at']
    search_fields = ['vendor__store_name', 'vendor__user__email', 'phone_number', 'external_reference']
    readonly_fields = ['requested_at', 'reviewed_at', 'paid_at']


@admin.register(CustomerRefund)
class CustomerRefundAdmin(admin.ModelAdmin):
    list_display = ['id', 'order', 'customer', 'amount', 'status', 'mpesa_reversal_reference', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['order__order_number', 'customer__email', 'mpesa_reversal_reference']
    readonly_fields = ['created_at', 'completed_at']

# Register the models
admin.site.register(ShippingAddress, ShippingAddressAdmin)
admin.site.register(Cart, CartAdmin)
admin.site.register(Order, OrderAdmin)
admin.site.register(PaymentMethod, PaymentMethodAdmin)
