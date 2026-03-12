import json

from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.db import transaction

from orders.models import OrderItem
from users.models import VendorProfile
from users.permissions import IsApprovedVendor, IsMarketplaceAdmin, has_admin_permission
from users.rbac import log_admin_activity
from users.vendor_profile_utils import get_user_vendor_profile

from promotions.services import attach_live_offers_to_products

from .models import Category, Product, ProductImage
from .serializers import CategorySerializer, ProductSerializer, VendorProductSerializer

ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
MAX_GALLERY_IMAGES = 6


def _validate_product_image(file_obj):
    if file_obj.content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise ValueError("Only JPG, PNG, or WEBP images are allowed.")
    if file_obj.size > MAX_IMAGE_SIZE_BYTES:
        raise ValueError("Image size cannot exceed 5MB.")


def _apply_product_images(request, product: Product):
    replace_images = str(request.data.get("replace_images", "")).lower() in {"true", "1", "yes"}
    feature_image = request.FILES.get("feature_image")
    gallery_images = request.FILES.getlist("gallery_images")

    if not feature_image and not gallery_images and not replace_images:
        return

    if replace_images:
        product.images.all().delete()

    if feature_image:
        _validate_product_image(feature_image)
        product.images.update(is_feature=False)
        ProductImage.objects.create(product=product, image=feature_image, is_feature=True)

    if gallery_images:
        if len(gallery_images) > MAX_GALLERY_IMAGES:
            raise ValueError(f"You can upload up to {MAX_GALLERY_IMAGES} gallery images at once.")
        for image_file in gallery_images:
            _validate_product_image(image_file)
            ProductImage.objects.create(product=product, image=image_file, is_feature=False)


def _normalize_product_payload(request):
    raw_data = request.data
    if hasattr(raw_data, "lists"):
        payload = {}
        for key, values in raw_data.lists():
            payload[key] = values[0] if len(values) == 1 else values
    else:
        payload = dict(raw_data)

    raw_options = payload.get("sale_options_payload")
    if raw_options is None:
        raw_options = payload.get("sale_options")

    if isinstance(raw_options, str):
        if raw_options.strip():
            try:
                payload["sale_options_payload"] = json.loads(raw_options)
            except json.JSONDecodeError as exc:
                raise ValueError("Invalid sale options payload JSON.") from exc
        else:
            payload["sale_options_payload"] = []
    elif raw_options is not None:
        payload["sale_options_payload"] = raw_options

    return payload


def _normalize_product_payload_dict(raw_data):
    payload = dict(raw_data or {})
    raw_options = payload.get("sale_options_payload")
    if raw_options is None:
        raw_options = payload.get("sale_options")
    if isinstance(raw_options, str):
        if raw_options.strip():
            try:
                payload["sale_options_payload"] = json.loads(raw_options)
            except json.JSONDecodeError as exc:
                raise ValueError("Invalid sale options payload JSON.") from exc
        else:
            payload["sale_options_payload"] = []
    elif raw_options is not None:
        payload["sale_options_payload"] = raw_options
    return payload


@api_view(["GET"])
@permission_classes([AllowAny])
def get_products(request):
    products = Product.objects.select_related("vendor", "vendor__user", "category").all()
    user = request.user

    is_admin = bool(user and user.is_authenticated and user.role == "admin" and has_admin_permission(user, "products.view"))
    if not is_admin:
        products = products.filter(is_active=True, vendor__approval_status="approved", vendor__is_approved=True)
    product_list = list(products)
    attach_live_offers_to_products(product_list)

    serializer = ProductSerializer(product_list, many=True, context={"request": request})
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([AllowAny])
def get_product(request, pk):
    products = Product.objects.select_related("vendor", "vendor__user", "category").all()
    try:
        if str(pk).isdigit():
            product = products.get(id=pk)
        else:
            product = products.filter(slug__iexact=pk).first() or products.filter(title__iexact=pk).first()
            if not product:
                return Response({"detail": "Product Not Found"}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        is_admin = bool(
            user and user.is_authenticated and user.role == "admin" and has_admin_permission(user, "products.view")
        )
        vendor_profile = get_user_vendor_profile(user)
        is_owner_vendor = bool(
            user
            and user.is_authenticated
            and user.role == "vendor"
            and vendor_profile
            and product.vendor_id == vendor_profile.id
        )
        if not (is_admin or is_owner_vendor):
            if not product.is_active or product.vendor.approval_status != "approved" or not product.vendor.is_approved:
                return Response({"detail": "Product Not Found"}, status=status.HTTP_404_NOT_FOUND)

        attach_live_offers_to_products([product])
        serializer = ProductSerializer(product, many=False, context={"request": request})
        return Response(serializer.data)
    except Product.DoesNotExist:
        return Response({"detail": "Product Not Found"}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def get_categories(request):
    categories = Category.objects.all().order_by("name")
    serializer = CategorySerializer(categories, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_categories(request):
    if request.method == "GET":
        if not has_admin_permission(request.user, "products.view"):
            return Response({"detail": "Missing permission: products.view"}, status=status.HTTP_403_FORBIDDEN)
        categories = Category.objects.all().order_by("name")
        return Response(CategorySerializer(categories, many=True).data, status=status.HTTP_200_OK)

    if not has_admin_permission(request.user, "products.create"):
        return Response({"detail": "Missing permission: products.create"}, status=status.HTTP_403_FORBIDDEN)

    name = str(request.data.get("name", "")).strip()
    if not name:
        return Response({"detail": "Category name is required."}, status=status.HTTP_400_BAD_REQUEST)
    if Category.objects.filter(name__iexact=name).exists():
        return Response({"detail": "A category with this name already exists."}, status=status.HTTP_400_BAD_REQUEST)

    serializer = CategorySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    category = serializer.save()

    log_admin_activity(
        actor=request.user,
        action="category.create",
        description=f"Created category '{category.name}'.",
        target_type="Category",
        target_id=str(category.id),
        metadata={"slug": category.slug, "parent": category.parent_id},
    )
    return Response(CategorySerializer(category).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsApprovedVendor])
def vendor_dashboard_summary(request):
    vendor_profile = request.user.vendor_profile
    products = Product.objects.filter(vendor=vendor_profile)
    product_count = products.count()
    active_product_count = products.filter(is_active=True).count()

    vendor_items_qs = OrderItem.objects.filter(product__vendor=vendor_profile).select_related("order")
    vendor_items = list(vendor_items_qs)
    total_units_sold = sum(item.quantity for item in vendor_items)
    total_sales_value = sum(item.price_at_purchase * item.quantity for item in vendor_items)
    order_count = vendor_items_qs.values("order_id").distinct().count()

    return Response(
        {
            "store_name": vendor_profile.store_name,
            "approval_status": vendor_profile.approval_status,
            "products_total": product_count,
            "products_active": active_product_count,
            "orders_total": order_count,
            "units_sold": total_units_sold,
            "sales_total": str(total_sales_value),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET", "POST"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([IsAuthenticated, IsApprovedVendor])
def vendor_products(request):
    vendor_profile = request.user.vendor_profile

    if request.method == "GET":
        products = list(Product.objects.filter(vendor=vendor_profile).select_related("category").order_by("-created_at"))
        attach_live_offers_to_products(products)
        serializer = ProductSerializer(products, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    try:
        payload = _normalize_product_payload(request)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    serializer = VendorProductSerializer(data=payload, context={"vendor_profile": vendor_profile})
    serializer.is_valid(raise_exception=True)
    product = serializer.save()
    try:
        _apply_product_images(request, product)
    except ValueError as exc:
        product.delete()
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(ProductSerializer(product, context={"request": request}).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([IsAuthenticated, IsApprovedVendor])
def vendor_product_detail(request, product_id: int):
    vendor_profile = request.user.vendor_profile
    try:
        product = Product.objects.get(id=product_id, vendor=vendor_profile)
    except Product.DoesNotExist:
        return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    try:
        payload = _normalize_product_payload(request)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    serializer = VendorProductSerializer(product, data=payload, partial=True, context={"vendor_profile": vendor_profile})
    serializer.is_valid(raise_exception=True)
    product = serializer.save()
    try:
        _apply_product_images(request, product)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(ProductSerializer(product, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsApprovedVendor])
def vendor_products_bulk_import(request):
    vendor_profile = request.user.vendor_profile
    if request.method == "GET":
        return Response(
            {
                "detail": "Submit a JSON payload with 'products': [...].",
                "template": {
                    "products": [
                        {
                            "title": "Fresh Milk",
                            "description": "Pasteurized milk",
                            "specifications": "Keep refrigerated",
                            "price": "120.00",
                            "stock": 5000,
                            "sale_type": "volume_based",
                            "base_unit_label": "litre",
                            "base_quantity_value": "1",
                            "stock_unit_label": "ml",
                            "auto_price_calculation": True,
                            "category_id": None,
                            "is_active": True,
                            "sale_options_payload": [
                                {
                                    "label": "500 ml",
                                    "quantity_value": "500",
                                    "quantity_unit": "ml",
                                    "base_quantity_equivalent": "0.5",
                                    "stock_units_consumed": 500,
                                    "is_default": True,
                                    "is_active": True,
                                }
                            ],
                        }
                    ]
                },
            },
            status=status.HTTP_200_OK,
        )

    entries = request.data.get("products")
    if not isinstance(entries, list) or len(entries) == 0:
        return Response({"detail": "Payload must include a non-empty 'products' list."}, status=status.HTTP_400_BAD_REQUEST)

    created = []
    errors = []
    with transaction.atomic():
        for index, row in enumerate(entries):
            try:
                payload = _normalize_product_payload_dict(row)
            except ValueError as exc:
                errors.append({"index": index, "detail": str(exc)})
                continue
            serializer = VendorProductSerializer(data=payload, context={"vendor_profile": vendor_profile})
            if serializer.is_valid():
                product = serializer.save()
                created.append(product)
            else:
                errors.append({"index": index, "errors": serializer.errors})

    return Response(
        {
            "created_count": len(created),
            "failed_count": len(errors),
            "created": ProductSerializer(created, many=True, context={"request": request}).data,
            "errors": errors,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET", "POST"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_products(request):
    if request.method == "GET":
        if not has_admin_permission(request.user, "products.view"):
            return Response({"detail": "Missing permission: products.view"}, status=status.HTTP_403_FORBIDDEN)
        products = list(Product.objects.select_related("vendor", "vendor__user", "category").order_by("-created_at"))
        attach_live_offers_to_products(products)
        serializer = ProductSerializer(products, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    if not has_admin_permission(request.user, "products.create"):
        return Response({"detail": "Missing permission: products.create"}, status=status.HTTP_403_FORBIDDEN)

    vendor_profile_id = request.data.get("vendor_profile_id")
    if not vendor_profile_id:
        return Response({"detail": "vendor_profile_id is required for admin product creation."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        vendor_profile = VendorProfile.objects.get(id=vendor_profile_id)
    except VendorProfile.DoesNotExist:
        return Response({"detail": "Vendor profile not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        payload = _normalize_product_payload(request)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    serializer = VendorProductSerializer(data=payload, context={"vendor_profile": vendor_profile})
    serializer.is_valid(raise_exception=True)
    product = serializer.save()
    try:
        _apply_product_images(request, product)
    except ValueError as exc:
        product.delete()
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    log_admin_activity(
        actor=request.user,
        action="product.create",
        description=f"Created product '{product.title}'.",
        target_type="Product",
        target_id=str(product.id),
        metadata={"vendor_profile_id": product.vendor_id, "price": str(product.price)},
    )

    return Response(ProductSerializer(product, context={"request": request}).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_product_detail(request, product_id: int):
    try:
        product = Product.objects.get(id=product_id)
    except Product.DoesNotExist:
        return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        if not has_admin_permission(request.user, "products.delete"):
            return Response({"detail": "Missing permission: products.delete"}, status=status.HTTP_403_FORBIDDEN)
        product_title = product.title
        product.delete()
        log_admin_activity(
            actor=request.user,
            action="product.delete",
            description=f"Deleted product '{product_title}'.",
            target_type="Product",
            target_id=str(product_id),
            metadata={},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    if not has_admin_permission(request.user, "products.edit"):
        return Response({"detail": "Missing permission: products.edit"}, status=status.HTTP_403_FORBIDDEN)

    previous_vendor_id = product.vendor_id
    previous_stock = product.stock
    previous_price = str(product.price)

    try:
        payload = _normalize_product_payload(request)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    vendor_profile_id = payload.get("vendor_profile_id")
    vendor_profile = product.vendor
    if vendor_profile_id:
        try:
            vendor_profile = VendorProfile.objects.get(id=vendor_profile_id)
        except VendorProfile.DoesNotExist:
            return Response({"detail": "Vendor profile not found."}, status=status.HTTP_404_NOT_FOUND)

    serializer = VendorProductSerializer(product, data=payload, partial=True, context={"vendor_profile": vendor_profile})
    serializer.is_valid(raise_exception=True)
    product = serializer.save(vendor=vendor_profile)
    try:
        _apply_product_images(request, product)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    log_admin_activity(
        actor=request.user,
        action="product.update",
        description=f"Updated product '{product.title}'.",
        target_type="Product",
        target_id=str(product.id),
        metadata={
            "vendor_profile_id_from": previous_vendor_id,
            "vendor_profile_id_to": product.vendor_id,
            "stock_from": previous_stock,
            "stock_to": product.stock,
            "price_from": previous_price,
            "price_to": str(product.price),
        },
    )

    return Response(ProductSerializer(product, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_products_bulk_import(request):
    if request.method == "GET":
        if not has_admin_permission(request.user, "products.create"):
            return Response({"detail": "Missing permission: products.create"}, status=status.HTTP_403_FORBIDDEN)
        return Response(
            {
                "detail": "Submit a JSON payload with 'products': [...]. Each product must include vendor_profile_id.",
                "template": {
                    "products": [
                        {
                            "vendor_profile_id": 1,
                            "title": "Eggs",
                            "description": "Farm fresh eggs",
                            "price": "25.00",
                            "stock": 300,
                            "sale_type": "piece_based",
                            "base_unit_label": "egg",
                            "base_quantity_value": "1",
                            "stock_unit_label": "egg",
                            "auto_price_calculation": True,
                            "category_id": None,
                            "is_active": True,
                            "sale_options_payload": [
                                {
                                    "label": "1 egg",
                                    "quantity_value": "1",
                                    "quantity_unit": "egg",
                                    "base_quantity_equivalent": "1",
                                    "stock_units_consumed": 1,
                                    "is_default": True,
                                    "is_active": True,
                                },
                                {
                                    "label": "12 eggs",
                                    "quantity_value": "12",
                                    "quantity_unit": "egg",
                                    "base_quantity_equivalent": "12",
                                    "stock_units_consumed": 12,
                                    "is_default": False,
                                    "is_active": True,
                                },
                            ],
                        }
                    ]
                },
            },
            status=status.HTTP_200_OK,
        )

    if not has_admin_permission(request.user, "products.create"):
        return Response({"detail": "Missing permission: products.create"}, status=status.HTTP_403_FORBIDDEN)

    entries = request.data.get("products")
    if not isinstance(entries, list) or len(entries) == 0:
        return Response({"detail": "Payload must include a non-empty 'products' list."}, status=status.HTTP_400_BAD_REQUEST)

    fallback_vendor_profile_id = request.data.get("vendor_profile_id")
    created = []
    errors = []
    with transaction.atomic():
        for index, row in enumerate(entries):
            try:
                payload = _normalize_product_payload_dict(row)
            except ValueError as exc:
                errors.append({"index": index, "detail": str(exc)})
                continue

            vendor_profile_id = payload.get("vendor_profile_id") or fallback_vendor_profile_id
            if not vendor_profile_id:
                errors.append({"index": index, "detail": "vendor_profile_id is required."})
                continue
            try:
                vendor_profile = VendorProfile.objects.get(id=vendor_profile_id)
            except VendorProfile.DoesNotExist:
                errors.append({"index": index, "detail": f"Vendor profile {vendor_profile_id} not found."})
                continue
            payload.pop("vendor_profile_id", None)

            serializer = VendorProductSerializer(data=payload, context={"vendor_profile": vendor_profile})
            if serializer.is_valid():
                product = serializer.save()
                created.append(product)
            else:
                errors.append({"index": index, "errors": serializer.errors})

    return Response(
        {
            "created_count": len(created),
            "failed_count": len(errors),
            "created": ProductSerializer(created, many=True, context={"request": request}).data,
            "errors": errors,
        },
        status=status.HTTP_200_OK,
    )
