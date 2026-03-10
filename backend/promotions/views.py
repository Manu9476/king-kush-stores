from decimal import Decimal

from django.db.models import F, Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from products.serializers import ProductSerializer
from users.permissions import IsApprovedVendor, IsMarketplaceAdmin, has_admin_permission
from users.rbac import log_admin_activity

from .models import (
    PromotionCampaign,
    PromotionCampaignType,
    PromotionEvent,
    PromotionEventType,
    PromotionOffer,
    PromotionOfferReviewStatus,
    PromotionOfferSource,
)
from .serializers import (
    PromotionCampaignSerializer,
    PromotionEventSerializer,
    PromotionOfferSerializer,
)
from .services import (
    attach_live_offers_to_products,
    default_black_friday_sections,
    get_active_campaign,
    get_product_pricing,
    increment_offer_click,
    increment_offer_impressions,
)


SORT_OPTIONS = [
    {"value": "priority", "label": "Featured"},
    {"value": "biggest_discount", "label": "Biggest Discount"},
    {"value": "lowest_price", "label": "Lowest Price"},
    {"value": "popularity", "label": "Most Popular"},
    {"value": "newest", "label": "Newest Deals"},
]


def _offer_queryset_for_campaign(campaign: PromotionCampaign, now: timezone.datetime):
    return (
        PromotionOffer.objects.select_related(
            "campaign",
            "product",
            "product__category",
            "product__vendor",
            "product__vendor__user",
            "submitted_by_vendor",
            "approved_by",
        )
        .filter(
            campaign=campaign,
            review_status=PromotionOfferReviewStatus.APPROVED,
            is_enabled=True,
            product__is_active=True,
            product__vendor__is_approved=True,
            product__vendor__approval_status="approved",
        )
        .filter(
            Q(promotional_stock_limit__isnull=True)
            | Q(promotional_stock_sold__lt=F("promotional_stock_limit"))
        )
        .filter(
            Q(flash_start_at__isnull=True) | Q(flash_start_at__lte=now),
            Q(flash_end_at__isnull=True) | Q(flash_end_at__gte=now),
        )
    )


def _serialize_offer(offer: PromotionOffer, request) -> dict:
    # Reuse product serializer while forcing this offer as the active promotion for that product.
    offer.product._active_promotion_offer = offer
    product_payload = ProductSerializer(offer.product, context={"request": request}).data
    pricing = get_product_pricing(offer.product, offer=offer)
    stock_remaining = offer.promotional_stock_remaining

    return {
        "id": offer.id,
        "product": product_payload,
        "discount_type": offer.discount_type,
        "discount_value": str(offer.discount_value),
        "section_key": offer.section_key,
        "badge_text": offer.badge_text,
        "urgency_text": offer.urgency_text,
        "is_flash_deal": offer.is_flash_deal,
        "flash_end_at": offer.flash_end_at,
        "priority": offer.priority,
        "stock_remaining": stock_remaining,
        "discounted_price": str(pricing["effective_unit_price"]),
        "savings_amount": str(pricing["discount_per_unit"]),
        "savings_percent": int(pricing["savings_percent"]),
        "click_count": int(offer.click_count),
        "impression_count": int(offer.impression_count),
        "created_at": offer.created_at,
    }


def _build_sections(rows: list[dict], section_config: list[dict]) -> list[dict]:
    sections = []
    for section in section_config:
        if not section.get("enabled", True):
            continue
        key = str(section.get("key") or "").strip() or "best_deals"
        title = section.get("title") or key.replace("_", " ").title()
        limit = max(1, min(int(section.get("limit", 12) or 12), 40))

        if key == "flash_sales":
            items = [row for row in rows if row["offer"].is_flash_deal][:limit]
        elif key == "vendor_spotlight":
            items = []
            seen_vendors = set()
            for row in rows:
                vendor_id = row["offer"].product.vendor_id
                if vendor_id in seen_vendors:
                    continue
                seen_vendors.add(vendor_id)
                items.append(row)
                if len(items) >= limit:
                    break
        elif key == "recently_added":
            items = sorted(rows, key=lambda row: row["offer"].created_at, reverse=True)[:limit]
        elif key == "under_1000":
            items = [
                row
                for row in rows
                if Decimal(str(row["pricing"]["effective_unit_price"])) <= Decimal("1000.00")
            ][:limit]
        elif key == "top_categories":
            items = sorted(
                rows,
                key=lambda row: (row["offer"].product.category.name if row["offer"].product.category else "", -row["pricing"]["savings_percent"]),
            )[:limit]
        else:
            custom = [row for row in rows if row["offer"].section_key == key]
            items = custom[:limit] if custom else rows[:limit]

        sections.append(
            {
                "key": key,
                "title": title,
                "items": [row["payload"] for row in items],
                "count": len(items),
            }
        )
    return sections


@api_view(["GET"])
@permission_classes([AllowAny])
def public_black_friday(request):
    now = timezone.now()
    campaign = get_active_campaign(campaign_type=PromotionCampaignType.BLACK_FRIDAY, now=now)

    if not campaign:
        return Response(
            {
                "active": False,
                "campaign": None,
                "countdown": None,
                "products": [],
                "sections": [],
                "filters": {
                    "categories": [],
                    "vendors": [],
                    "sort_options": SORT_OPTIONS,
                },
                "fallback_message": "No active Black Friday deals right now. Check back soon for upcoming offers.",
                "generated_at": now,
            },
            status=status.HTTP_200_OK,
        )

    query = str(request.query_params.get("q", "")).strip()
    category_filter = str(request.query_params.get("category", "")).strip()
    vendor_filter = str(request.query_params.get("vendor", "")).strip()
    sort_by = str(request.query_params.get("sort", "priority")).strip().lower() or "priority"
    stock_filter = str(request.query_params.get("in_stock", "")).strip().lower()

    offers_qs = _offer_queryset_for_campaign(campaign, now)

    if query:
        offers_qs = offers_qs.filter(
            Q(product__title__icontains=query)
            | Q(product__description__icontains=query)
            | Q(product__category__name__icontains=query)
            | Q(product__vendor__store_name__icontains=query)
        )

    if category_filter:
        if category_filter.isdigit():
            offers_qs = offers_qs.filter(product__category_id=int(category_filter))
        else:
            offers_qs = offers_qs.filter(
                Q(product__category__slug__iexact=category_filter)
                | Q(product__category__name__iexact=category_filter)
            )

    if vendor_filter:
        if vendor_filter.isdigit():
            offers_qs = offers_qs.filter(product__vendor_id=int(vendor_filter))
        else:
            offers_qs = offers_qs.filter(Q(product__vendor__store_name__icontains=vendor_filter))

    if stock_filter in {"1", "true", "yes", "in_stock"}:
        offers_qs = offers_qs.filter(product__stock__gt=0)

    offers = list(offers_qs)
    if offers:
        attach_live_offers_to_products([offer.product for offer in offers], now=now)

    rows = []
    for offer in offers:
        pricing = get_product_pricing(offer.product, offer=offer, quantity=1, now=now)
        if not pricing["promotion_active"]:
            continue
        rows.append(
            {
                "offer": offer,
                "pricing": pricing,
                "payload": _serialize_offer(offer, request),
            }
        )

    if sort_by == "biggest_discount":
        rows.sort(key=lambda row: (row["pricing"]["savings_percent"], row["pricing"]["discount_per_unit"]), reverse=True)
    elif sort_by == "lowest_price":
        rows.sort(key=lambda row: (row["pricing"]["effective_unit_price"], -row["pricing"]["savings_percent"]))
    elif sort_by == "popularity":
        rows.sort(key=lambda row: (row["offer"].click_count, row["offer"].impression_count, row["pricing"]["savings_percent"]), reverse=True)
    elif sort_by == "newest":
        rows.sort(key=lambda row: row["offer"].created_at, reverse=True)
    else:
        rows.sort(key=lambda row: (row["offer"].priority, row["pricing"]["savings_percent"]), reverse=True)

    section_config = campaign.sections_config if isinstance(campaign.sections_config, list) and campaign.sections_config else default_black_friday_sections()
    sections = _build_sections(rows, section_config)

    categories = {}
    vendors = {}
    for row in rows:
        offer = row["offer"]
        if offer.product.category_id:
            key = offer.product.category_id
            categories.setdefault(
                key,
                {
                    "id": offer.product.category_id,
                    "name": offer.product.category.name,
                    "slug": offer.product.category.slug,
                    "count": 0,
                },
            )
            categories[key]["count"] += 1

        vendor_key = offer.product.vendor_id
        vendors.setdefault(
            vendor_key,
            {
                "id": vendor_key,
                "name": offer.product.vendor.store_name,
                "count": 0,
            },
        )
        vendors[vendor_key]["count"] += 1

    increment_offer_impressions([row["offer"].id for row in rows])

    remaining_seconds = None
    if campaign.ends_at:
        remaining_seconds = max(int((campaign.ends_at - now).total_seconds()), 0)

    return Response(
        {
            "active": True,
            "campaign": PromotionCampaignSerializer(campaign, context={"request": request}).data,
            "countdown": {
                "label": campaign.countdown_label or "Sale ends in",
                "ends_at": campaign.ends_at,
                "seconds_remaining": remaining_seconds,
            },
            "totals": {
                "products_in_campaign": len(rows),
                "vendors_participating": len(vendors),
                "categories_on_sale": len(categories),
            },
            "products": [row["payload"] for row in rows],
            "sections": sections,
            "filters": {
                "categories": sorted(categories.values(), key=lambda row: row["name"]),
                "vendors": sorted(vendors.values(), key=lambda row: row["name"]),
                "sort_options": SORT_OPTIONS,
            },
            "generated_at": now,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def black_friday_event(request):
    serializer = PromotionEventSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    event = serializer.save(user=request.user if request.user.is_authenticated else None)

    if event.event_type == PromotionEventType.CLICK:
        increment_offer_click(event.offer)
    elif event.event_type == PromotionEventType.IMPRESSION:
        increment_offer_impressions([event.offer_id])

    return Response({"id": event.id, "detail": "Event recorded."}, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsApprovedVendor])
def vendor_black_friday_submissions(request):
    vendor_profile = request.user.vendor_profile
    if request.method == "GET":
        campaign_id = request.query_params.get("campaign_id")
        queryset = PromotionOffer.objects.select_related("campaign", "product", "product__category").filter(submitted_by_vendor=vendor_profile)
        if campaign_id and str(campaign_id).isdigit():
            queryset = queryset.filter(campaign_id=int(campaign_id))
        serializer = PromotionOfferSerializer(queryset.order_by("-updated_at"), many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    campaign_id = request.data.get("campaign_id")
    product_id = request.data.get("product_id")
    if not campaign_id or not product_id:
        return Response({"detail": "campaign_id and product_id are required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        campaign = PromotionCampaign.objects.get(id=campaign_id, campaign_type=PromotionCampaignType.BLACK_FRIDAY)
    except PromotionCampaign.DoesNotExist:
        return Response({"detail": "Black Friday campaign not found."}, status=status.HTTP_404_NOT_FOUND)

    product = vendor_profile.products.filter(id=product_id).first()
    if not product:
        return Response({"detail": "Product not found in your store."}, status=status.HTTP_404_NOT_FOUND)

    payload = request.data.copy()
    payload["campaign_id"] = campaign.id
    payload["product_id"] = product.id

    existing = PromotionOffer.objects.filter(campaign=campaign, product=product).first()
    serializer = PromotionOfferSerializer(existing, data=payload, partial=bool(existing), context={"request": request})
    serializer.is_valid(raise_exception=True)
    offer = serializer.save(
        submitted_by_vendor=vendor_profile,
        source_type=PromotionOfferSource.VENDOR,
        review_status=PromotionOfferReviewStatus.PENDING_REVIEW,
        approved_by=None,
        approved_at=None,
    )

    log_admin_activity(
        actor=request.user,
        action="promotion.offer.vendor_submit",
        description=f"Vendor submitted Black Friday offer for '{product.title}'.",
        target_type="PromotionOffer",
        target_id=str(offer.id),
        metadata={"campaign_id": campaign.id, "product_id": product.id},
    )

    return Response(PromotionOfferSerializer(offer, context={"request": request}).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([IsMarketplaceAdmin])
def admin_black_friday_campaigns(request):
    if request.method == "GET":
        if not has_admin_permission(request.user, "promotions.view"):
            return Response({"detail": "Missing permission: promotions.view"}, status=status.HTTP_403_FORBIDDEN)

        status_filter = str(request.query_params.get("status", "")).strip()
        query = str(request.query_params.get("q", "")).strip()
        queryset = PromotionCampaign.objects.filter(campaign_type=PromotionCampaignType.BLACK_FRIDAY)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if query:
            queryset = queryset.filter(Q(name__icontains=query) | Q(description__icontains=query))
        serializer = PromotionCampaignSerializer(queryset.order_by("-starts_at", "-updated_at"), many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    if not has_admin_permission(request.user, "promotions.manage"):
        return Response({"detail": "Missing permission: promotions.manage"}, status=status.HTTP_403_FORBIDDEN)

    serializer = PromotionCampaignSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    campaign = serializer.save(campaign_type=PromotionCampaignType.BLACK_FRIDAY, created_by=request.user, updated_by=request.user)

    log_admin_activity(
        actor=request.user,
        action="promotion.campaign.create",
        description=f"Created Black Friday campaign '{campaign.name}'.",
        target_type="PromotionCampaign",
        target_id=str(campaign.id),
        metadata={"status": campaign.status},
    )
    return Response(PromotionCampaignSerializer(campaign, context={"request": request}).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([IsMarketplaceAdmin])
def admin_black_friday_campaign_detail(request, campaign_id: int):
    if not has_admin_permission(request.user, "promotions.manage"):
        return Response({"detail": "Missing permission: promotions.manage"}, status=status.HTTP_403_FORBIDDEN)

    campaign = PromotionCampaign.objects.filter(id=campaign_id, campaign_type=PromotionCampaignType.BLACK_FRIDAY).first()
    if not campaign:
        return Response({"detail": "Campaign not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        campaign_name = campaign.name
        campaign.delete()
        log_admin_activity(
            actor=request.user,
            action="promotion.campaign.delete",
            description=f"Deleted Black Friday campaign '{campaign_name}'.",
            target_type="PromotionCampaign",
            target_id=str(campaign_id),
            metadata={},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = PromotionCampaignSerializer(campaign, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    updated = serializer.save(updated_by=request.user)
    log_admin_activity(
        actor=request.user,
        action="promotion.campaign.update",
        description=f"Updated Black Friday campaign '{updated.name}'.",
        target_type="PromotionCampaign",
        target_id=str(updated.id),
        metadata={"status": updated.status, "is_visible": updated.is_visible},
    )
    return Response(PromotionCampaignSerializer(updated, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@permission_classes([IsMarketplaceAdmin])
def admin_black_friday_offers(request):
    if request.method == "GET":
        if not has_admin_permission(request.user, "promotions.view"):
            return Response({"detail": "Missing permission: promotions.view"}, status=status.HTTP_403_FORBIDDEN)

        query = str(request.query_params.get("q", "")).strip()
        campaign_id = str(request.query_params.get("campaign_id", "")).strip()
        review_status = str(request.query_params.get("review_status", "")).strip()
        source_type = str(request.query_params.get("source_type", "")).strip()

        queryset = PromotionOffer.objects.select_related("campaign", "product", "product__category", "product__vendor", "submitted_by_vendor")
        queryset = queryset.filter(campaign__campaign_type=PromotionCampaignType.BLACK_FRIDAY)
        if campaign_id.isdigit():
            queryset = queryset.filter(campaign_id=int(campaign_id))
        if review_status:
            queryset = queryset.filter(review_status=review_status)
        if source_type:
            queryset = queryset.filter(source_type=source_type)
        if query:
            queryset = queryset.filter(
                Q(product__title__icontains=query)
                | Q(product__vendor__store_name__icontains=query)
                | Q(campaign__name__icontains=query)
            )

        serializer = PromotionOfferSerializer(queryset.order_by("-priority", "-updated_at"), many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    if not has_admin_permission(request.user, "promotions.manage"):
        return Response({"detail": "Missing permission: promotions.manage"}, status=status.HTTP_403_FORBIDDEN)

    serializer = PromotionOfferSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    offer = serializer.save(source_type=PromotionOfferSource.ADMIN)

    if offer.review_status == PromotionOfferReviewStatus.APPROVED:
        offer.approved_by = request.user
        offer.approved_at = timezone.now()
        offer.save(update_fields=["approved_by", "approved_at", "updated_at"])

    log_admin_activity(
        actor=request.user,
        action="promotion.offer.create",
        description=f"Created Black Friday offer for '{offer.product.title}'.",
        target_type="PromotionOffer",
        target_id=str(offer.id),
        metadata={"campaign_id": offer.campaign_id, "product_id": offer.product_id},
    )

    return Response(PromotionOfferSerializer(offer, context={"request": request}).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsMarketplaceAdmin])
def admin_black_friday_offer_detail(request, offer_id: int):
    if not has_admin_permission(request.user, "promotions.manage"):
        return Response({"detail": "Missing permission: promotions.manage"}, status=status.HTTP_403_FORBIDDEN)

    offer = PromotionOffer.objects.select_related("campaign", "product").filter(
        id=offer_id, campaign__campaign_type=PromotionCampaignType.BLACK_FRIDAY
    ).first()
    if not offer:
        return Response({"detail": "Offer not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        product_title = offer.product.title
        offer.delete()
        log_admin_activity(
            actor=request.user,
            action="promotion.offer.delete",
            description=f"Deleted Black Friday offer for '{product_title}'.",
            target_type="PromotionOffer",
            target_id=str(offer_id),
            metadata={},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = PromotionOfferSerializer(offer, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    updated = serializer.save()

    if updated.review_status == PromotionOfferReviewStatus.APPROVED:
        updated.approved_by = request.user
        updated.approved_at = timezone.now()
        updated.save(update_fields=["approved_by", "approved_at", "updated_at"])

    log_admin_activity(
        actor=request.user,
        action="promotion.offer.update",
        description=f"Updated Black Friday offer for '{updated.product.title}'.",
        target_type="PromotionOffer",
        target_id=str(updated.id),
        metadata={
            "review_status": updated.review_status,
            "discount_type": updated.discount_type,
            "discount_value": str(updated.discount_value),
            "is_enabled": updated.is_enabled,
        },
    )
    return Response(PromotionOfferSerializer(updated, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsMarketplaceAdmin])
def admin_black_friday_analytics(request):
    if not has_admin_permission(request.user, "promotions.view"):
        return Response({"detail": "Missing permission: promotions.view"}, status=status.HTTP_403_FORBIDDEN)

    campaign = get_active_campaign(campaign_type=PromotionCampaignType.BLACK_FRIDAY)
    campaigns = PromotionCampaign.objects.filter(campaign_type=PromotionCampaignType.BLACK_FRIDAY)
    offers = PromotionOffer.objects.filter(campaign__campaign_type=PromotionCampaignType.BLACK_FRIDAY)

    totals = offers.aggregate(
        impressions=Sum("impression_count"),
        clicks=Sum("click_count"),
        orders=Sum("orders_count"),
        units=Sum("units_sold"),
        revenue=Sum("revenue_generated"),
    )

    top_offers = offers.select_related("campaign", "product", "product__category", "product__vendor").order_by(
        "-orders_count", "-click_count", "-impression_count"
    )[:12]

    return Response(
        {
            "active_campaign": PromotionCampaignSerializer(campaign, context={"request": request}).data if campaign else None,
            "totals": {
                "campaigns_total": campaigns.count(),
                "offers_total": offers.count(),
                "offers_approved": offers.filter(review_status=PromotionOfferReviewStatus.APPROVED).count(),
                "offers_pending": offers.filter(review_status=PromotionOfferReviewStatus.PENDING_REVIEW).count(),
                "impressions": int(totals.get("impressions") or 0),
                "clicks": int(totals.get("clicks") or 0),
                "orders": int(totals.get("orders") or 0),
                "units_sold": int(totals.get("units") or 0),
                "revenue": str(totals.get("revenue") or Decimal("0.00")),
            },
            "top_offers": PromotionOfferSerializer(top_offers, many=True, context={"request": request}).data,
        },
        status=status.HTTP_200_OK,
    )
