import json

from django.db.models import Avg, Count, Q
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

from .models import Category, Product, ProductImage, ProductReview, ProductReviewComment
from .serializers import (
    CategorySerializer,
    ProductReviewAdminUpdateSerializer,
    ProductReviewCommentAdminUpdateSerializer,
    ProductReviewCommentCreateSerializer,
    ProductReviewCommentSerializer,
    ProductReviewCreateSerializer,
    ProductReviewSerializer,
    ProductSerializer,
    VendorProductSerializer,
)

ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
MAX_GALLERY_IMAGES = 6


def _with_review_summary(queryset):
    return queryset.annotate(
        approved_review_count=Count("reviews", filter=Q(reviews__is_approved=True), distinct=True),
        approved_rating_average=Avg("reviews__rating", filter=Q(reviews__is_approved=True)),
    )


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
    products = _with_review_summary(Product.objects.select_related("vendor", "vendor__user", "category").all())
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
    products = _with_review_summary(Product.objects.select_related("vendor", "vendor__user", "category").all())
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


def _get_review_eligible_order_item(user, product: Product):
    if not getattr(user, "is_authenticated", False) or getattr(user, "role", "") != "customer":
        return None
    return (
        OrderItem.objects.filter(
            order__user=user,
            product=product,
        )
        .filter(Q(order__is_paid=True) | Q(order__status="Delivered"))
        .select_related("order")
        .order_by("-order__created_at")
        .first()
    )


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def product_reviews(request, product_id: int):
    try:
        product = _with_review_summary(
            Product.objects.select_related("vendor", "vendor__user", "category")
        ).get(id=product_id)
    except Product.DoesNotExist:
        return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

    user = request.user
    is_admin = bool(user and user.is_authenticated and user.role == "admin" and has_admin_permission(user, "products.view"))
    vendor_profile = get_user_vendor_profile(user)
    is_owner_vendor = bool(
        user and user.is_authenticated and user.role == "vendor" and vendor_profile and product.vendor_id == vendor_profile.id
    )
    if not (is_admin or is_owner_vendor):
        if not product.is_active or product.vendor.approval_status != "approved" or not product.vendor.is_approved:
            return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        reviews_qs = product.reviews.all().prefetch_related("comments")
        if not is_admin:
            reviews_qs = reviews_qs.filter(is_approved=True)
        user_review = None
        can_review = False
        if user and user.is_authenticated:
            user_review = reviews_qs.filter(user=user).first() if is_admin else product.reviews.filter(user=user).first()
            can_review = bool(_get_review_eligible_order_item(user, product) and not user_review)
        return Response(
            {
                "summary": {
                    "average_rating": round(float(getattr(product, "approved_rating_average", 0) or 0), 1),
                    "review_count": int(getattr(product, "approved_review_count", 0) or 0),
                },
                "can_review": can_review,
                "user_review": ProductReviewSerializer(user_review, context={"request": request}).data if user_review else None,
                "items": ProductReviewSerializer(
                    reviews_qs,
                    many=True,
                    context={"request": request, "include_hidden_comments": is_admin},
                ).data,
            },
            status=status.HTTP_200_OK,
        )

    if not user or not user.is_authenticated:
        return Response({"detail": "Sign in to leave a review."}, status=status.HTTP_401_UNAUTHORIZED)
    if getattr(user, "role", "") != "customer":
        return Response({"detail": "Only customer accounts can submit product reviews."}, status=status.HTTP_403_FORBIDDEN)
    if ProductReview.objects.filter(product=product, user=user).exists():
        return Response({"detail": "You have already reviewed this product."}, status=status.HTTP_400_BAD_REQUEST)

    eligible_order_item = _get_review_eligible_order_item(user, product)
    if not eligible_order_item:
        return Response({"detail": "You can only review products you have purchased."}, status=status.HTTP_403_FORBIDDEN)

    serializer = ProductReviewCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    review = ProductReview.objects.create(
        product=product,
        user=user,
        order_item=eligible_order_item,
        author_name=(f"{user.first_name} {user.last_name}".strip() or user.email.split("@")[0]),
        rating=serializer.validated_data["rating"],
        title=str(serializer.validated_data.get("title", "")).strip(),
        content=serializer.validated_data["content"],
        is_verified_purchase=True,
        is_approved=True,
    )
    return Response(ProductReviewSerializer(review, context={"request": request}).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def product_review_detail(request, review_id: int):
    try:
        review = ProductReview.objects.select_related("product", "user").get(id=review_id)
    except ProductReview.DoesNotExist:
        return Response({"detail": "Review not found."}, status=status.HTTP_404_NOT_FOUND)

    if review.user_id != request.user.id:
        return Response({"detail": "You can only manage your own reviews."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        review.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = ProductReviewCreateSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    for field in ("rating", "title", "content"):
        if field in serializer.validated_data:
            setattr(review, field, serializer.validated_data[field])
    review.full_clean()
    review.save()
    return Response(ProductReviewSerializer(review, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def product_review_comments(request, review_id: int):
    try:
        review = ProductReview.objects.select_related("product").get(id=review_id, is_approved=True)
    except ProductReview.DoesNotExist:
        return Response({"detail": "Review not found."}, status=status.HTTP_404_NOT_FOUND)

    serializer = ProductReviewCommentCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = request.user
    comment = ProductReviewComment.objects.create(
        review=review,
        user=user,
        author_name=(f"{user.first_name} {user.last_name}".strip() or user.email.split("@")[0]),
        content=serializer.validated_data["content"],
        is_approved=True,
        is_admin_reply=bool(user.role == "admin"),
    )
    return Response(ProductReviewCommentSerializer(comment, context={"request": request}).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def product_review_comment_detail(request, comment_id: int):
    try:
        comment = ProductReviewComment.objects.select_related("user").get(id=comment_id)
    except ProductReviewComment.DoesNotExist:
        return Response({"detail": "Comment not found."}, status=status.HTTP_404_NOT_FOUND)

    if comment.user_id != request.user.id:
        return Response({"detail": "You can only manage your own comments."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = ProductReviewCommentCreateSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    comment.content = serializer.validated_data.get("content", comment.content)
    comment.full_clean()
    comment.save()
    return Response(ProductReviewCommentSerializer(comment, context={"request": request}).data, status=status.HTTP_200_OK)


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
                            "barcode": "6291041500213",
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
        products = list(_with_review_summary(Product.objects.select_related("vendor", "vendor__user", "category").order_by("-created_at")))
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


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_product_generate_barcode(request, product_id: int):
    if not has_admin_permission(request.user, "products.edit"):
        return Response({"detail": "Missing permission: products.edit"}, status=status.HTTP_403_FORBIDDEN)
    try:
        product = Product.objects.get(id=product_id)
    except Product.DoesNotExist:
        return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

    force = str(request.data.get("force", "")).strip().lower() in {"1", "true", "yes"}
    if product.barcode and not force:
        return Response(
            {
                "detail": "Product already has a barcode. Use force=true to replace it.",
                "barcode": product.barcode,
                "product": ProductSerializer(product, context={"request": request}).data,
            },
            status=status.HTTP_200_OK,
        )

    previous_barcode = product.barcode
    product.barcode = Product.generate_unique_barcode()
    product.save(update_fields=["barcode", "updated_at"])
    log_admin_activity(
        actor=request.user,
        action="product.barcode.generate",
        description=f"Generated barcode for '{product.title}'.",
        target_type="Product",
        target_id=str(product.id),
        metadata={"previous_barcode": previous_barcode, "new_barcode": product.barcode},
    )
    return Response(
        {
            "detail": "Barcode generated successfully.",
            "barcode": product.barcode,
            "product": ProductSerializer(product, context={"request": request}).data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_product_reviews(request):
    if not has_admin_permission(request.user, "products.view"):
        return Response({"detail": "Missing permission: products.view"}, status=status.HTTP_403_FORBIDDEN)

    queryset = ProductReview.objects.select_related("product", "user", "product__vendor").prefetch_related("comments").all()
    status_filter = str(request.query_params.get("status", "")).strip().lower()
    query = str(request.query_params.get("q", "")).strip()

    if status_filter == "approved":
        queryset = queryset.filter(is_approved=True)
    elif status_filter == "hidden":
        queryset = queryset.filter(is_approved=False)
    elif status_filter == "featured":
        queryset = queryset.filter(is_featured=True)

    if query:
        queryset = queryset.filter(
            Q(product__title__icontains=query)
            | Q(author_name__icontains=query)
            | Q(content__icontains=query)
            | Q(title__icontains=query)
            | Q(user__email__icontains=query)
        )

    payload = []
    for review in queryset.order_by("-created_at"):
        serialized = ProductReviewSerializer(
            review,
            context={"request": request, "include_hidden_comments": True},
        ).data
        serialized["product"] = {
            "id": review.product_id,
            "title": review.product.title,
            "slug": review.product.slug,
            "vendor_name": review.product.vendor.store_name if review.product.vendor else "",
        }
        serialized["user_email"] = review.user.email if review.user else ""
        payload.append(serialized)
    return Response(payload, status=status.HTTP_200_OK)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_product_review_detail(request, review_id: int):
    try:
        review = ProductReview.objects.get(id=review_id)
    except ProductReview.DoesNotExist:
        return Response({"detail": "Review not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        if not has_admin_permission(request.user, "products.delete"):
            return Response({"detail": "Missing permission: products.delete"}, status=status.HTTP_403_FORBIDDEN)
        review.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if not has_admin_permission(request.user, "products.edit"):
        return Response({"detail": "Missing permission: products.edit"}, status=status.HTTP_403_FORBIDDEN)

    serializer = ProductReviewAdminUpdateSerializer(review, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(
        ProductReviewSerializer(review, context={"request": request, "include_hidden_comments": True}).data,
        status=status.HTTP_200_OK,
    )


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_product_review_comment_detail(request, comment_id: int):
    try:
        comment = ProductReviewComment.objects.select_related("review").get(id=comment_id)
    except ProductReviewComment.DoesNotExist:
        return Response({"detail": "Comment not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        if not has_admin_permission(request.user, "products.delete"):
            return Response({"detail": "Missing permission: products.delete"}, status=status.HTTP_403_FORBIDDEN)
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if not has_admin_permission(request.user, "products.edit"):
        return Response({"detail": "Missing permission: products.edit"}, status=status.HTTP_403_FORBIDDEN)

    serializer = ProductReviewCommentAdminUpdateSerializer(comment, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(ProductReviewCommentSerializer(comment, context={"request": request}).data, status=status.HTTP_200_OK)


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
                            "barcode": "6153001234567",
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
