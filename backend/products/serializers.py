import copy
from decimal import Decimal

from rest_framework import serializers

from promotions.services import build_product_promotion_payload
from users.models import VendorProfile

from .models import Category, Product, ProductImage, ProductSaleOption


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description", "parent"]


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "image", "alt_text", "is_feature"]


class ProductSaleOptionSerializer(serializers.ModelSerializer):
    computed_unit_price = serializers.SerializerMethodField()
    display_label = serializers.SerializerMethodField()

    class Meta:
        model = ProductSaleOption
        fields = [
            "id",
            "label",
            "quantity_value",
            "quantity_unit",
            "base_quantity_equivalent",
            "stock_units_consumed",
            "use_manual_price",
            "manual_price",
            "sort_order",
            "is_default",
            "is_active",
            "computed_unit_price",
            "display_label",
        ]

    def get_computed_unit_price(self, obj):
        return str(obj.product.get_unit_price_for_option(obj))

    def get_display_label(self, obj):
        qty = obj.quantity_value
        unit = obj.quantity_unit or obj.product.base_unit_label
        return f"{qty} {unit}".strip()


class ProductSaleOptionWriteSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    label = serializers.CharField(max_length=120)
    quantity_value = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))
    quantity_unit = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    base_quantity_equivalent = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))
    stock_units_consumed = serializers.IntegerField(min_value=1)
    use_manual_price = serializers.BooleanField(required=False, default=False)
    manual_price = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        allow_null=True,
        min_value=Decimal("0.01"),
    )
    sort_order = serializers.IntegerField(required=False, default=0)
    is_default = serializers.BooleanField(required=False, default=False)
    is_active = serializers.BooleanField(required=False, default=True)

    def validate(self, attrs):
        use_manual_price = bool(attrs.get("use_manual_price"))
        manual_price = attrs.get("manual_price")
        if use_manual_price and manual_price is None:
            raise serializers.ValidationError({"manual_price": "Manual price is required when use_manual_price is enabled."})
        if manual_price is not None and not use_manual_price:
            attrs["use_manual_price"] = True
        return attrs


SALE_TYPE_UNIT_PRESETS = {
    "single_item": {"item", "unit", "piece"},
    "piece_based": {"piece", "pieces", "item", "items", "egg", "eggs", "pc", "pcs", "unit", "dozen", "crate"},
    "pack_based": {"pack", "packet", "box", "bundle", "crate", "set", "dozen"},
    "weight_based": {"kg", "g", "gram", "grams", "kilogram", "kilograms"},
    "volume_based": {"ml", "l", "lt", "litre", "litres", "liter", "liters"},
    "set_bundle": {"set", "bundle", "pair", "piece", "items"},
}


def _unit_token(value: str) -> str:
    return str(value or "").strip().lower()


def _sync_product_sale_options(product: Product, options_data: list[dict]) -> None:
    existing = {row.id: row for row in product.sale_options.all()}
    kept_ids: list[int] = []

    for index, raw_option in enumerate(options_data):
        payload = copy.deepcopy(raw_option)
        option_id = payload.pop("id", None)
        if "sort_order" not in payload:
            payload["sort_order"] = index
        if not payload.get("quantity_unit"):
            payload["quantity_unit"] = product.base_unit_label

        if option_id:
            option = existing.get(option_id)
            if not option:
                raise serializers.ValidationError({"sale_options_payload": f"Option id {option_id} does not belong to this product."})
            for key, value in payload.items():
                setattr(option, key, value)
            option.full_clean()
            option.save()
            kept_ids.append(option.id)
            continue

        option = ProductSaleOption(product=product, **payload)
        option.full_clean()
        option.save()
        kept_ids.append(option.id)

    ProductSaleOption.objects.filter(product=product).exclude(id__in=kept_ids).delete()

    options_qs = ProductSaleOption.objects.filter(product=product).order_by("sort_order", "id")
    if not options_qs.exists():
        return
    default_option = options_qs.filter(is_default=True).first() or options_qs.first()
    if default_option and not default_option.is_default:
        default_option.is_default = True
        default_option.save(update_fields=["is_default"])
    ProductSaleOption.objects.filter(product=product).exclude(id=default_option.id).update(is_default=False)


class ProductSerializer(serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, read_only=True)
    category = CategorySerializer(read_only=True)
    image = serializers.SerializerMethodField()
    sale_options = ProductSaleOptionSerializer(many=True, read_only=True)
    default_sale_option_id = serializers.SerializerMethodField()
    display_price_label = serializers.SerializerMethodField()

    vendor_name = serializers.CharField(source="vendor.store_name", read_only=True)
    vendor_profile_id = serializers.IntegerField(source="vendor.id", read_only=True)
    effective_price = serializers.SerializerMethodField()
    original_price = serializers.SerializerMethodField()
    savings_amount = serializers.SerializerMethodField()
    savings_percent = serializers.SerializerMethodField()
    promotion_active = serializers.SerializerMethodField()
    promotion_badge = serializers.SerializerMethodField()
    promotion_ends_at = serializers.SerializerMethodField()
    urgency_text = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "vendor_profile_id",
            "vendor_name",
            "category",
            "title",
            "slug",
            "description",
            "specifications",
            "price",
            "effective_price",
            "original_price",
            "savings_amount",
            "savings_percent",
            "promotion_active",
            "promotion_badge",
            "promotion_ends_at",
            "urgency_text",
            "stock",
            "sale_type",
            "base_unit_label",
            "base_quantity_value",
            "stock_unit_label",
            "auto_price_calculation",
            "sale_options",
            "default_sale_option_id",
            "display_price_label",
            "is_active",
            "images",
            "image",
            "created_at",
        ]

    def get_image(self, obj):
        request = self.context.get("request")
        feature_image = obj.images.filter(is_feature=True).first()
        if feature_image:
            return request.build_absolute_uri(feature_image.image.url)

        first_image = obj.images.first()
        if first_image:
            return request.build_absolute_uri(first_image.image.url)

        return None

    def get_default_sale_option_id(self, obj):
        option = obj.get_default_sale_option()
        return option.id if option else None

    def get_display_price_label(self, obj):
        option = obj.get_default_sale_option()
        if not option:
            return f"{obj.price} / {obj.base_unit_label}"
        return f"{obj.get_unit_price_for_option(option)} / {option.label}"

    def _promotion_payload(self, obj):
        payload = getattr(obj, "_promotion_payload_cache", None)
        if payload is None:
            default_option = obj.get_default_sale_option()
            unit_price = obj.get_unit_price_for_option(default_option)
            payload = build_product_promotion_payload(obj, unit_price=unit_price, option=default_option)
            setattr(obj, "_promotion_payload_cache", payload)
        return payload

    def get_effective_price(self, obj):
        return self._promotion_payload(obj)["effective_price"]

    def get_original_price(self, obj):
        return self._promotion_payload(obj)["original_price"]

    def get_savings_amount(self, obj):
        return self._promotion_payload(obj)["savings_amount"]

    def get_savings_percent(self, obj):
        return self._promotion_payload(obj)["savings_percent"]

    def get_promotion_active(self, obj):
        return self._promotion_payload(obj)["promotion_active"]

    def get_promotion_badge(self, obj):
        return self._promotion_payload(obj)["promotion_badge"]

    def get_promotion_ends_at(self, obj):
        return self._promotion_payload(obj)["promotion_ends_at"]

    def get_urgency_text(self, obj):
        return self._promotion_payload(obj)["urgency_text"]


class VendorProductSerializer(serializers.ModelSerializer):
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        source="category",
        write_only=True,
        required=False,
        allow_null=True,
    )
    category = CategorySerializer(read_only=True)
    sale_options = ProductSaleOptionSerializer(many=True, read_only=True)
    sale_options_payload = ProductSaleOptionWriteSerializer(many=True, write_only=True, required=False)

    class Meta:
        model = Product
        fields = (
            "id",
            "title",
            "slug",
            "description",
            "specifications",
            "price",
            "stock",
            "sale_type",
            "base_unit_label",
            "base_quantity_value",
            "stock_unit_label",
            "auto_price_calculation",
            "is_active",
            "category",
            "category_id",
            "sale_options",
            "sale_options_payload",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "slug", "created_at", "updated_at", "category", "sale_options")

    def validate(self, attrs):
        sale_type = attrs.get("sale_type", getattr(self.instance, "sale_type", "single_item"))
        base_unit_label = attrs.get("base_unit_label", getattr(self.instance, "base_unit_label", "item"))
        base_quantity_value = attrs.get("base_quantity_value", getattr(self.instance, "base_quantity_value", Decimal("1")))
        options_payload = attrs.get("sale_options_payload")

        if Decimal(str(base_quantity_value or "0")) <= Decimal("0"):
            raise serializers.ValidationError({"base_quantity_value": "Base quantity value must be greater than zero."})

        if sale_type in SALE_TYPE_UNIT_PRESETS:
            allowed = SALE_TYPE_UNIT_PRESETS[sale_type]
            normalized_base = _unit_token(base_unit_label)
            if normalized_base and normalized_base not in allowed:
                raise serializers.ValidationError(
                    {"base_unit_label": f"'{base_unit_label}' does not match typical units for {sale_type}. Allowed examples: {sorted(allowed)}"}
                )

            if options_payload is not None:
                invalid_rows = []
                for index, option in enumerate(options_payload):
                    option_unit = _unit_token(option.get("quantity_unit") or base_unit_label)
                    if option_unit and option_unit not in allowed:
                        invalid_rows.append(
                            {
                                "index": index,
                                "unit": option.get("quantity_unit"),
                                "allowed_examples": sorted(allowed),
                            }
                        )
                if invalid_rows:
                    raise serializers.ValidationError({"sale_options_payload": invalid_rows})

        if sale_type == "single_item":
            if Decimal(str(base_quantity_value or "0")) != Decimal("1"):
                raise serializers.ValidationError({"base_quantity_value": "single_item products should use base_quantity_value = 1."})
        return attrs

    def create(self, validated_data):
        vendor_profile: VendorProfile = self.context["vendor_profile"]
        options_payload = validated_data.pop("sale_options_payload", [])
        product = Product.objects.create(vendor=vendor_profile, **validated_data)
        if options_payload:
            _sync_product_sale_options(product, options_payload)
        return product

    def update(self, instance, validated_data):
        options_payload = validated_data.pop("sale_options_payload", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.full_clean()
        instance.save()

        if options_payload is not None:
            _sync_product_sale_options(instance, options_payload)
        return instance
