from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from .models import (
    PromotionCampaign,
    PromotionCampaignStatus,
    PromotionCampaignType,
    PromotionDiscountType,
    PromotionOffer,
    PromotionOfferReviewStatus,
)

MONEY_QUANT = Decimal("0.01")


def quantize_money(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def default_black_friday_sections() -> list[dict]:
    return [
        {"key": "best_deals", "title": "Best Deals", "limit": 12, "enabled": True},
        {"key": "flash_sales", "title": "Flash Sales", "limit": 8, "enabled": True},
        {"key": "vendor_spotlight", "title": "Vendor Spotlight Offers", "limit": 8, "enabled": True},
        {"key": "recently_added", "title": "Recently Added Deals", "limit": 12, "enabled": True},
        {"key": "under_1000", "title": "Under KES 1,000", "limit": 12, "enabled": True},
    ]


def get_active_campaign(
    campaign_type: str = PromotionCampaignType.BLACK_FRIDAY,
    now: timezone.datetime | None = None,
) -> PromotionCampaign | None:
    now = now or timezone.now()
    queryset = PromotionCampaign.objects.filter(
        campaign_type=campaign_type,
        is_visible=True,
    ).exclude(
        status__in=[PromotionCampaignStatus.DRAFT, PromotionCampaignStatus.PAUSED, PromotionCampaignStatus.ENDED]
    ).filter(
        Q(starts_at__isnull=True) | Q(starts_at__lte=now),
        Q(ends_at__isnull=True) | Q(ends_at__gte=now),
    )
    return queryset.order_by("-starts_at", "-updated_at").first()


def get_live_offer_for_product(
    product,
    *,
    now: timezone.datetime | None = None,
    campaign: PromotionCampaign | None = None,
) -> PromotionOffer | None:
    now = now or timezone.now()
    campaign = campaign or get_active_campaign(now=now)
    if not campaign:
        return None

    queryset = (
        PromotionOffer.objects.select_related("campaign")
        .filter(
            campaign=campaign,
            product_id=product.id,
            review_status=PromotionOfferReviewStatus.APPROVED,
            is_enabled=True,
        )
        .filter(
            Q(promotional_stock_limit__isnull=True) | Q(promotional_stock_sold__lt=F("promotional_stock_limit"))
        )
        .filter(
            Q(flash_start_at__isnull=True) | Q(flash_start_at__lte=now),
            Q(flash_end_at__isnull=True) | Q(flash_end_at__gte=now),
        )
        .order_by("-priority", "-updated_at")
    )
    return queryset.first()


def attach_live_offers_to_products(products, *, now: timezone.datetime | None = None) -> None:
    product_list = list(products)
    if not product_list:
        return

    now = now or timezone.now()
    campaign = get_active_campaign(now=now)
    if not campaign:
        for product in product_list:
            setattr(product, "_active_promotion_offer", None)
        return

    product_ids = [product.id for product in product_list]
    offers = (
        PromotionOffer.objects.select_related("campaign")
        .filter(
            campaign=campaign,
            product_id__in=product_ids,
            review_status=PromotionOfferReviewStatus.APPROVED,
            is_enabled=True,
        )
        .filter(
            Q(promotional_stock_limit__isnull=True) | Q(promotional_stock_sold__lt=F("promotional_stock_limit"))
        )
        .filter(
            Q(flash_start_at__isnull=True) | Q(flash_start_at__lte=now),
            Q(flash_end_at__isnull=True) | Q(flash_end_at__gte=now),
        )
        .order_by("product_id", "-priority", "-updated_at")
    )

    best_by_product: dict[int, PromotionOffer] = {}
    for offer in offers:
        if offer.product_id not in best_by_product:
            best_by_product[offer.product_id] = offer

    for product in product_list:
        setattr(product, "_active_promotion_offer", best_by_product.get(product.id))


def _calculate_discounted_price(base_price: Decimal, offer: PromotionOffer) -> Decimal:
    base_price = quantize_money(base_price)
    if offer.discount_type == PromotionDiscountType.PERCENTAGE:
        discount_amount = quantize_money(base_price * (offer.discount_value / Decimal("100")))
    else:
        discount_amount = quantize_money(offer.discount_value)

    if discount_amount < Decimal("0.00"):
        discount_amount = Decimal("0.00")
    if discount_amount > base_price:
        discount_amount = base_price

    return quantize_money(base_price - discount_amount)


def get_product_pricing(
    product,
    *,
    quantity: int = 1,
    offer: PromotionOffer | None = None,
    now: timezone.datetime | None = None,
    unit_price: Decimal | int | float | str | None = None,
) -> dict:
    quantity = max(int(quantity or 1), 1)
    now = now or timezone.now()
    base_price = quantize_money(unit_price if unit_price is not None else product.price)

    if offer is None:
        offer = getattr(product, "_active_promotion_offer", None)
    if offer is None:
        offer = get_live_offer_for_product(product, now=now)

    if not offer or not offer.is_live(now=now):
        return {
            "offer": None,
            "promotion_active": False,
            "base_unit_price": base_price,
            "effective_unit_price": base_price,
            "discount_per_unit": Decimal("0.00"),
            "savings_percent": 0,
            "promotion_badge": "",
            "promotion_ends_at": None,
            "urgency_text": "",
            "promotional_stock_remaining": None,
            "promotional_units": 0,
            "regular_units": quantity,
        }

    discounted_price = _calculate_discounted_price(base_price, offer)
    discount_per_unit = quantize_money(base_price - discounted_price)
    if discount_per_unit <= Decimal("0.00"):
        return {
            "offer": None,
            "promotion_active": False,
            "base_unit_price": base_price,
            "effective_unit_price": base_price,
            "discount_per_unit": Decimal("0.00"),
            "savings_percent": 0,
            "promotion_badge": "",
            "promotion_ends_at": None,
            "urgency_text": "",
            "promotional_stock_remaining": None,
            "promotional_units": 0,
            "regular_units": quantity,
        }

    savings_percent = int(
        (discount_per_unit / base_price * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    ) if base_price > 0 else 0

    stock_remaining = offer.promotional_stock_remaining
    if stock_remaining is None:
        promotional_units = quantity
    else:
        promotional_units = min(quantity, max(stock_remaining, 0))
    regular_units = max(quantity - promotional_units, 0)

    promotion_ends_at = offer.flash_end_at or offer.campaign.ends_at

    return {
        "offer": offer,
        "promotion_active": promotional_units > 0,
        "base_unit_price": base_price,
        "effective_unit_price": discounted_price,
        "discount_per_unit": discount_per_unit,
        "savings_percent": savings_percent,
        "promotion_badge": offer.badge_text or "Black Friday Deal",
        "promotion_ends_at": promotion_ends_at,
        "urgency_text": offer.urgency_text or "",
        "promotional_stock_remaining": stock_remaining,
        "promotional_units": promotional_units,
        "regular_units": regular_units,
    }


@transaction.atomic
def reserve_promotional_units(offer: PromotionOffer, units: int) -> bool:
    units = int(units or 0)
    if units <= 0:
        return True

    locked = PromotionOffer.objects.select_for_update().get(id=offer.id)
    remaining = locked.promotional_stock_remaining
    if remaining is not None and remaining < units:
        return False

    locked.promotional_stock_sold = F("promotional_stock_sold") + units
    locked.save(update_fields=["promotional_stock_sold", "updated_at"])
    offer.promotional_stock_sold = (offer.promotional_stock_sold or 0) + units
    return True


def increment_offer_impressions(offer_ids: list[int]) -> None:
    if not offer_ids:
        return
    PromotionOffer.objects.filter(id__in=list(set(offer_ids))).update(impression_count=F("impression_count") + 1)


def increment_offer_click(offer: PromotionOffer) -> None:
    PromotionOffer.objects.filter(id=offer.id).update(click_count=F("click_count") + 1)


def increment_offer_order_metrics(offer: PromotionOffer, units: int, revenue: Decimal) -> None:
    units = max(int(units or 0), 0)
    revenue = quantize_money(revenue)
    if units <= 0:
        return
    PromotionOffer.objects.filter(id=offer.id).update(
        orders_count=F("orders_count") + 1,
        units_sold=F("units_sold") + units,
        revenue_generated=F("revenue_generated") + revenue,
    )


def build_product_promotion_payload(
    product,
    *,
    unit_price: Decimal | int | float | str | None = None,
    option=None,
) -> dict:
    pricing = get_product_pricing(product, quantity=1, unit_price=unit_price)
    return {
        "promotion_active": pricing["promotion_active"],
        "effective_price": str(pricing["effective_unit_price"]),
        "original_price": str(pricing["base_unit_price"]),
        "savings_amount": str(pricing["discount_per_unit"]),
        "savings_percent": int(pricing["savings_percent"]),
        "promotion_badge": pricing["promotion_badge"],
        "promotion_ends_at": pricing["promotion_ends_at"],
        "urgency_text": pricing["urgency_text"],
        "option_label": getattr(option, "label", ""),
    }
