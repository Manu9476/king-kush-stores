from decimal import Decimal

from django.db import models
from users.models import CustomUser, VendorProfile
from products.models import Product
import uuid

class ShippingAddress(models.Model):
    """
    Stores customer delivery addresses.
    """
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='addresses')
    full_name = models.CharField(max_length=255)
    phone_number = models.CharField(max_length=20)
    address_line_1 = models.CharField(max_length=255)
    address_line_2 = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=20, blank=True, null=True)
    country = models.CharField(max_length=100, default='Kenya')
    
    is_default = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.full_name} - {self.city}"


class Cart(models.Model):
    """
    The shopping cart attached to a specific user.
    """
    user = models.OneToOneField(CustomUser, on_delete=models.CASCADE, related_name='cart')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Cart for {self.user.email}"


class CartItem(models.Model):
    """
    Individual items placed inside the Cart.
    """
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    added_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.quantity} x {self.product.title}"


class Order(models.Model):
    """
    The final confirmed order created during checkout.
    """
    FULFILLMENT_CHOICES = (
        ("delivery", "Delivery"),
        ("pickup", "Pickup Station"),
    )
    STATUS_CHOICES = (
        ('Pending', 'Pending'),
        ('Processing', 'Processing'),
        ('Shipped', 'Shipped'),
        ('Delivered', 'Delivered'),
        ('Cancelled', 'Cancelled'),
    )

    user = models.ForeignKey(CustomUser, on_delete=models.PROTECT, related_name='orders')
    order_number = models.CharField(max_length=50, unique=True, editable=False)
    shipping_address = models.ForeignKey(ShippingAddress, on_delete=models.PROTECT)
    fulfillment_method = models.CharField(max_length=20, choices=FULFILLMENT_CHOICES, default="delivery", db_index=True)
    pickup_station = models.ForeignKey(
        "pickup.PickupStation",
        on_delete=models.SET_NULL,
        related_name="orders",
        null=True,
        blank=True,
    )
    pickup_ready_at = models.DateTimeField(null=True, blank=True)
    picked_up_at = models.DateTimeField(null=True, blank=True)
    
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Pending')
    
    # We will use this later for M-Pesa integration
    is_paid = models.BooleanField(default=False)
    paid_at = models.DateTimeField(null=True, blank=True)
    payment_verified_at = models.DateTimeField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=120, blank=True, null=True, db_index=True)
    stock_reservation_expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    stock_released_at = models.DateTimeField(null=True, blank=True, db_index=True)
    stock_release_reason = models.CharField(max_length=80, blank=True, default="")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "idempotency_key"],
                condition=models.Q(idempotency_key__isnull=False),
                name="uniq_order_idempotency_per_user",
            ),
        ]

    def save(self, *args, **kwargs):
        # Generate a unique order number if it doesn't exist
        if not self.order_number:
            self.order_number = f"ORD-{uuid.uuid4().hex[:8].upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Order {self.order_number} - {self.user.email}"


class OrderItem(models.Model):
    """
    A snapshot of a product at the time of purchase, locked into an Order.
    Crucial for vendor dashboards to see exactly what they need to fulfill.
    """
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    
    # We lock in the price here so if the vendor changes the product price 
    # tomorrow, it doesn't alter this historical order.
    price_at_purchase = models.DecimalField(max_digits=10, decimal_places=2)
    original_price = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    promotion_offer = models.ForeignKey(
        "promotions.PromotionOffer",
        on_delete=models.SET_NULL,
        related_name="order_items",
        blank=True,
        null=True,
    )
    quantity = models.PositiveIntegerField(default=1)
    sale_option = models.ForeignKey(
        "products.ProductSaleOption",
        on_delete=models.SET_NULL,
        related_name="order_items",
        blank=True,
        null=True,
    )
    sale_option_label = models.CharField(max_length=120, blank=True, default="")
    sale_option_quantity_value = models.DecimalField(max_digits=12, decimal_places=3, blank=True, null=True)
    sale_option_quantity_unit = models.CharField(max_length=40, blank=True, default="")
    sale_option_stock_units_consumed = models.PositiveIntegerField(default=1)

    def __str__(self):
        return f"{self.quantity} x {self.product.title} (Order: {self.order.order_number})"


class PaymentMethod(models.Model):
    """
    Stores reusable customer payment methods.
    Only masked/safe payment data is stored.
    """

    METHOD_CHOICES = (
        ('card', 'Card'),
        ('mpesa', 'M-Pesa'),
    )

    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='payment_methods')
    method_type = models.CharField(max_length=20, choices=METHOD_CHOICES)
    provider = models.CharField(max_length=50, blank=True, null=True)
    cardholder_name = models.CharField(max_length=120, blank=True, null=True)
    card_last4 = models.CharField(max_length=4, blank=True, null=True)
    card_expiry_month = models.PositiveSmallIntegerField(blank=True, null=True)
    card_expiry_year = models.PositiveSmallIntegerField(blank=True, null=True)
    mpesa_phone_masked = models.CharField(max_length=25, blank=True, null=True)
    billing_email = models.EmailField(blank=True, null=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_default', '-updated_at']

    def __str__(self):
        if self.method_type == 'card':
            return f"{self.user.email} - {self.provider or 'Card'} ****{self.card_last4 or ''}"
        return f"{self.user.email} - M-Pesa {self.mpesa_phone_masked or ''}"


class MarketplacePayment(models.Model):
    """
    Central marketplace payment record (platform escrow layer).
    Customer pays platform account first, then system allocates vendor earnings internally.
    """

    STATUS_CHOICES = (
        ("initiated", "Initiated"),
        ("pending_confirmation", "Pending Confirmation"),
        ("confirmed", "Confirmed"),
        ("failed", "Failed"),
        ("cancelled", "Cancelled"),
        ("refunded", "Refunded"),
        ("reversed", "Reversed"),
    )
    PROVIDER_CHOICES = (
        ("mpesa", "M-Pesa"),
        ("card", "Card"),
        ("paypal", "PayPal"),
        ("bank_transfer", "Bank Transfer"),
    )

    order = models.ForeignKey("Order", on_delete=models.PROTECT, related_name="marketplace_payments")
    customer = models.ForeignKey(CustomUser, on_delete=models.PROTECT, related_name="marketplace_payments")
    provider = models.CharField(max_length=30, choices=PROVIDER_CHOICES, default="mpesa", db_index=True)
    payment_channel = models.CharField(max_length=50, default="mpesa_stk")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, default="KES")
    phone_number = models.CharField(max_length=25, blank=True, null=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="initiated", db_index=True)

    # M-Pesa references / external transaction metadata
    merchant_request_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    checkout_request_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    transaction_id = models.CharField(max_length=120, blank=True, null=True, unique=True)
    mpesa_receipt_number = models.CharField(max_length=120, blank=True, null=True, db_index=True)
    result_code = models.CharField(max_length=20, blank=True, null=True)
    result_desc = models.CharField(max_length=255, blank=True, null=True)

    initiated_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(blank=True, null=True)
    callback_payload = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    idempotency_key = models.CharField(max_length=120, blank=True, null=True, db_index=True)

    class Meta:
        ordering = ("-initiated_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "idempotency_key"],
                condition=models.Q(idempotency_key__isnull=False),
                name="uniq_payment_idempotency_per_customer",
            ),
        ]

    def __str__(self):
        return f"{self.provider.upper()} payment #{self.id} ({self.status}) - {self.amount}"


class VendorOrder(models.Model):
    """
    Per-vendor split of a parent marketplace order.
    """

    STATUS_CHOICES = (
        ("Pending", "Pending"),
        ("Processing", "Processing"),
        ("Shipped", "Shipped"),
        ("Delivered", "Delivered"),
        ("Cancelled", "Cancelled"),
        ("Refunded", "Refunded"),
    )
    PAYOUT_STATUS_CHOICES = (
        ("pending_wallet", "Pending Wallet Credit"),
        ("available_for_payout", "Available For Payout"),
        ("partially_paid", "Partially Paid"),
        ("paid_out", "Paid Out"),
        ("refunded", "Refunded"),
    )

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="vendor_orders")
    vendor = models.ForeignKey(VendorProfile, on_delete=models.PROTECT, related_name="vendor_orders")
    order_reference = models.CharField(max_length=80, db_index=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="Pending", db_index=True)

    gross_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    platform_commission_rate = models.DecimalField(max_digits=5, decimal_places=4, default=Decimal("0.1000"))
    platform_commission_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    vendor_earning_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    refunded_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    payout_status = models.CharField(max_length=30, choices=PAYOUT_STATUS_CHOICES, default="pending_wallet", db_index=True)
    earnings_released = models.BooleanField(default=False)
    released_at = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = (("order", "vendor"),)
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        if not self.order_reference:
            self.order_reference = f"{self.order.order_number}-V{self.vendor_id}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.order_reference} ({self.vendor.store_name})"


class VendorOrderItem(models.Model):
    vendor_order = models.ForeignKey(VendorOrder, on_delete=models.CASCADE, related_name="items")
    order_item = models.OneToOneField(OrderItem, on_delete=models.CASCADE, related_name="vendor_order_item")
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    def __str__(self):
        return f"{self.vendor_order.order_reference} -> {self.order_item.product.title}"


class VendorWallet(models.Model):
    vendor = models.OneToOneField(VendorProfile, on_delete=models.CASCADE, related_name="wallet")
    available_balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    pending_balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    lifetime_earnings = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total_paid_out = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total_refunded = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Wallet - {self.vendor.store_name}"


class VendorPayoutRequest(models.Model):
    STATUS_CHOICES = (
        ("requested", "Requested"),
        ("under_review", "Under Review"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("paid", "Paid"),
        ("failed", "Failed"),
        ("cancelled", "Cancelled"),
    )

    vendor = models.ForeignKey(VendorProfile, on_delete=models.PROTECT, related_name="payout_requests")
    wallet = models.ForeignKey(VendorWallet, on_delete=models.PROTECT, related_name="payout_requests")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    phone_number = models.CharField(max_length=25)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="requested", db_index=True)

    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(blank=True, null=True)
    paid_at = models.DateTimeField(blank=True, null=True)
    reviewed_by = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        related_name="reviewed_payout_requests",
        blank=True,
        null=True,
    )
    external_reference = models.CharField(max_length=120, blank=True, null=True, db_index=True)
    notes = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("-requested_at",)

    def __str__(self):
        return f"Payout #{self.id} - {self.vendor.store_name} ({self.status})"


class CustomerRefund(models.Model):
    STATUS_CHOICES = (
        ("initiated", "Initiated"),
        ("completed", "Completed"),
        ("failed", "Failed"),
        ("cancelled", "Cancelled"),
    )

    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="refunds")
    payment = models.ForeignKey(MarketplacePayment, on_delete=models.PROTECT, related_name="refunds", blank=True, null=True)
    customer = models.ForeignKey(CustomUser, on_delete=models.PROTECT, related_name="refunds")
    requested_by = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        related_name="processed_refunds",
        blank=True,
        null=True,
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="initiated", db_index=True)
    mpesa_reversal_reference = models.CharField(max_length=120, blank=True, null=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"Refund #{self.id} - {self.order.order_number}"


class VendorWalletTransaction(models.Model):
    TRANSACTION_TYPE_CHOICES = (
        ("credit_sale_pending", "Credit Sale To Pending"),
        ("release_to_available", "Release Pending To Available"),
        ("debit_payout", "Payout Debit"),
        ("debit_refund", "Refund Debit"),
        ("manual_adjustment", "Manual Adjustment"),
    )
    DIRECTION_CHOICES = (
        ("credit", "Credit"),
        ("debit", "Debit"),
    )
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("failed", "Failed"),
        ("reversed", "Reversed"),
    )

    wallet = models.ForeignKey(VendorWallet, on_delete=models.CASCADE, related_name="transactions")
    vendor = models.ForeignKey(VendorProfile, on_delete=models.PROTECT, related_name="wallet_transactions")
    vendor_order = models.ForeignKey(VendorOrder, on_delete=models.SET_NULL, related_name="wallet_transactions", null=True, blank=True)
    payment = models.ForeignKey(MarketplacePayment, on_delete=models.SET_NULL, related_name="wallet_transactions", null=True, blank=True)
    payout_request = models.ForeignKey(VendorPayoutRequest, on_delete=models.SET_NULL, related_name="wallet_transactions", null=True, blank=True)
    refund = models.ForeignKey(CustomerRefund, on_delete=models.SET_NULL, related_name="wallet_transactions", null=True, blank=True)

    transaction_type = models.CharField(max_length=30, choices=TRANSACTION_TYPE_CHOICES, db_index=True)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    balance_after = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="completed", db_index=True)
    description = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.vendor.store_name} {self.direction} {self.amount} ({self.transaction_type})"
