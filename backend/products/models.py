from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.db import models
from django.utils.text import slugify
from users.models import VendorProfile


MONEY_QUANT = Decimal("0.01")


class ProductSaleType(models.TextChoices):
    SINGLE_ITEM = "single_item", "Single Item"
    PIECE_BASED = "piece_based", "Piece Based"
    PACK_BASED = "pack_based", "Pack Based"
    WEIGHT_BASED = "weight_based", "Weight Based"
    VOLUME_BASED = "volume_based", "Volume Based"
    SET_BUNDLE = "set_bundle", "Set / Bundle"
    CUSTOM = "custom", "Custom"

class Category(models.Model):
    """
    Product categories (e.g., Electronics, Fashion).
    Supports sub-categories via the 'parent' self-reference.
    """
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True, blank=True)
    description = models.TextField(blank=True, null=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='subcategories')

    class Meta:
        verbose_name_plural = 'Categories'

    def save(self, *args, **kwargs):
        # Automatically generate a URL-friendly slug from the category name
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Product(models.Model):
    """
    The core product model. Linked strictly to a Vendor and a Category.
    """
    vendor = models.ForeignKey(VendorProfile, on_delete=models.CASCADE, related_name='products')
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, related_name='products')
    
    title = models.CharField(max_length=255)
    slug = models.SlugField(unique=True, blank=True)
    description = models.TextField()
    specifications = models.TextField(blank=True, null=True)
    price = models.DecimalField(max_digits=10, decimal_places=2) # e.g., 99999999.99
    stock = models.PositiveIntegerField(default=0)
    sale_type = models.CharField(
        max_length=40,
        choices=ProductSaleType.choices,
        default=ProductSaleType.SINGLE_ITEM,
        db_index=True,
    )
    base_unit_label = models.CharField(max_length=40, default="item")
    base_quantity_value = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("1.000"))
    stock_unit_label = models.CharField(max_length=40, default="unit")
    auto_price_calculation = models.BooleanField(default=True)
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        if self.base_quantity_value is None or Decimal(str(self.base_quantity_value)) <= Decimal("0"):
            raise ValidationError({"base_quantity_value": "Base quantity value must be greater than zero."})

    def save(self, *args, **kwargs):
        # Automatically generate a URL-friendly slug from the product title
        if not self.slug:
            self.slug = slugify(self.title)
        super().save(*args, **kwargs)

    def get_active_sale_options_queryset(self):
        if not self.pk:
            return ProductSaleOption.objects.none()
        return self.sale_options.filter(is_active=True).order_by("sort_order", "id")

    def get_active_sale_options(self):
        return list(self.get_active_sale_options_queryset())

    def get_default_sale_option(self):
        options = self.get_active_sale_options_queryset()
        return options.filter(is_default=True).first() or options.first()

    def resolve_sale_option(self, option_id: int | None):
        if option_id in (None, "", 0):
            return self.get_default_sale_option()
        option = self.get_active_sale_options_queryset().filter(id=option_id).first()
        if not option:
            raise ValueError("Selected quantity option is unavailable for this product.")
        return option

    def get_unit_price_for_option(self, option=None) -> Decimal:
        base_price = Decimal(str(self.price or "0"))
        if option is None:
            return base_price.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)

        if option.use_manual_price and option.manual_price is not None:
            return Decimal(str(option.manual_price)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)

        if not self.auto_price_calculation and option.manual_price is not None:
            return Decimal(str(option.manual_price)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)

        base_qty = Decimal(str(self.base_quantity_value or "1"))
        if base_qty <= Decimal("0"):
            base_qty = Decimal("1")
        option_equivalent = Decimal(str(option.base_quantity_equivalent or "1"))
        if option_equivalent <= Decimal("0"):
            option_equivalent = Decimal("1")
        computed = (base_price * option_equivalent) / base_qty
        return computed.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)

    def __str__(self):
        return self.title


class ProductSaleOption(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="sale_options")
    label = models.CharField(max_length=120)
    quantity_value = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("1.000"))
    quantity_unit = models.CharField(max_length=40, blank=True, default="")
    base_quantity_equivalent = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("1.000"))
    stock_units_consumed = models.PositiveIntegerField(default=1)
    use_manual_price = models.BooleanField(default=False)
    manual_price = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("sort_order", "id")

    def clean(self):
        if self.quantity_value is None or Decimal(str(self.quantity_value)) <= Decimal("0"):
            raise ValidationError({"quantity_value": "Quantity value must be greater than zero."})
        if self.base_quantity_equivalent is None or Decimal(str(self.base_quantity_equivalent)) <= Decimal("0"):
            raise ValidationError({"base_quantity_equivalent": "Base quantity equivalent must be greater than zero."})
        if self.stock_units_consumed <= 0:
            raise ValidationError({"stock_units_consumed": "Stock units consumed must be at least 1."})
        if self.use_manual_price and (self.manual_price is None or Decimal(str(self.manual_price)) <= Decimal("0")):
            raise ValidationError({"manual_price": "Manual price must be provided and greater than zero."})
        if self.manual_price is not None and Decimal(str(self.manual_price)) <= Decimal("0"):
            raise ValidationError({"manual_price": "Manual price must be greater than zero."})

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_default:
            ProductSaleOption.objects.filter(product=self.product, is_default=True).exclude(id=self.id).update(is_default=False)

    def __str__(self):
        return f"{self.product.title} - {self.label}"


class ProductImage(models.Model):
    """
    Allows multiple images per product. 
    One image can be set as the 'feature' image (the main thumbnail).
    """
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='product_images/')
    alt_text = models.CharField(max_length=255, blank=True, null=True)
    is_feature = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Image for {self.product.title}"
