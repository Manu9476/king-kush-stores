from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone
from django.utils.text import slugify


class PromotionCampaignType(models.TextChoices):
    BLACK_FRIDAY = "black_friday", "Black Friday"


class PromotionCampaignStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SCHEDULED = "scheduled", "Scheduled"
    ACTIVE = "active", "Active"
    PAUSED = "paused", "Paused"
    ENDED = "ended", "Ended"


class PromotionOfferSource(models.TextChoices):
    ADMIN = "admin", "Admin"
    VENDOR = "vendor", "Vendor"


class PromotionOfferReviewStatus(models.TextChoices):
    PENDING_REVIEW = "pending_review", "Pending Review"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class PromotionDiscountType(models.TextChoices):
    PERCENTAGE = "percentage", "Percentage"
    FIXED = "fixed", "Fixed Amount"


class PromotionEventType(models.TextChoices):
    IMPRESSION = "impression", "Impression"
    CLICK = "click", "Click"


class PromotionCampaign(models.Model):
    campaign_type = models.CharField(
        max_length=40,
        choices=PromotionCampaignType.choices,
        default=PromotionCampaignType.BLACK_FRIDAY,
        db_index=True,
    )
    name = models.CharField(max_length=180)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    description = models.TextField(blank=True)
    hero_title = models.CharField(max_length=220, blank=True)
    hero_subtitle = models.CharField(max_length=280, blank=True)
    hero_cta_label = models.CharField(max_length=60, default="Shop Deals")
    hero_cta_url = models.CharField(max_length=255, blank=True)
    countdown_label = models.CharField(max_length=90, default="Sale ends in")
    announcement_text = models.CharField(max_length=220, blank=True)
    banner_image = models.ImageField(upload_to="promotions/banners/", blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=PromotionCampaignStatus.choices,
        default=PromotionCampaignStatus.DRAFT,
        db_index=True,
    )
    is_visible = models.BooleanField(default=True, db_index=True)
    starts_at = models.DateTimeField(null=True, blank=True, db_index=True)
    ends_at = models.DateTimeField(null=True, blank=True, db_index=True)
    sections_config = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="promotion_campaigns_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="promotion_campaigns_updated",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)
        constraints = [
            models.CheckConstraint(
                condition=Q(ends_at__isnull=True) | Q(starts_at__isnull=True) | Q(ends_at__gte=F("starts_at")),
                name="promotion_campaign_end_after_start",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.campaign_type})"

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name) or slugify(self.campaign_type)
            candidate = base
            index = 2
            while PromotionCampaign.objects.exclude(id=self.id).filter(slug=candidate).exists():
                candidate = f"{base}-{index}"
                index += 1
            self.slug = candidate

        now = timezone.now()
        if self.status in {PromotionCampaignStatus.ACTIVE, PromotionCampaignStatus.SCHEDULED}:
            if self.ends_at and self.ends_at < now:
                self.status = PromotionCampaignStatus.ENDED
            elif self.starts_at and self.starts_at > now and self.status == PromotionCampaignStatus.ACTIVE:
                self.status = PromotionCampaignStatus.SCHEDULED
        super().save(*args, **kwargs)

    def is_live(self, now: timezone.datetime | None = None) -> bool:
        now = now or timezone.now()
        if not self.is_visible:
            return False
        if self.status not in {PromotionCampaignStatus.ACTIVE, PromotionCampaignStatus.SCHEDULED}:
            return False
        if self.starts_at and self.starts_at > now:
            return False
        if self.ends_at and self.ends_at < now:
            return False
        return True


class PromotionOffer(models.Model):
    campaign = models.ForeignKey(PromotionCampaign, on_delete=models.CASCADE, related_name="offers")
    product = models.ForeignKey("products.Product", on_delete=models.CASCADE, related_name="promotion_offers")
    submitted_by_vendor = models.ForeignKey(
        "users.VendorProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="promotion_offers_submitted",
    )
    source_type = models.CharField(max_length=20, choices=PromotionOfferSource.choices, default=PromotionOfferSource.ADMIN)
    review_status = models.CharField(
        max_length=20,
        choices=PromotionOfferReviewStatus.choices,
        default=PromotionOfferReviewStatus.PENDING_REVIEW,
        db_index=True,
    )
    discount_type = models.CharField(max_length=20, choices=PromotionDiscountType.choices, default=PromotionDiscountType.PERCENTAGE)
    discount_value = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    promotional_stock_limit = models.PositiveIntegerField(null=True, blank=True)
    promotional_stock_sold = models.PositiveIntegerField(default=0)
    section_key = models.CharField(max_length=80, default="best_deals", db_index=True)
    badge_text = models.CharField(max_length=90, default="Black Friday Deal")
    urgency_text = models.CharField(max_length=90, blank=True)
    is_flash_deal = models.BooleanField(default=False, db_index=True)
    flash_start_at = models.DateTimeField(null=True, blank=True)
    flash_end_at = models.DateTimeField(null=True, blank=True)
    is_enabled = models.BooleanField(default=True, db_index=True)
    priority = models.PositiveSmallIntegerField(default=50, db_index=True)
    admin_notes = models.TextField(blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="promotion_offers_approved",
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    impression_count = models.PositiveIntegerField(default=0)
    click_count = models.PositiveIntegerField(default=0)
    orders_count = models.PositiveIntegerField(default=0)
    units_sold = models.PositiveIntegerField(default=0)
    revenue_generated = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-priority", "-updated_at")
        unique_together = (("campaign", "product"),)
        constraints = [
            models.CheckConstraint(
                condition=Q(discount_value__gte=0),
                name="promotion_offer_discount_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(promotional_stock_limit__isnull=True) | Q(promotional_stock_limit__gt=0),
                name="promotion_offer_stock_limit_positive",
            ),
            models.CheckConstraint(
                condition=Q(flash_end_at__isnull=True) | Q(flash_start_at__isnull=True) | Q(flash_end_at__gte=F("flash_start_at")),
                name="promotion_offer_flash_end_after_start",
            ),
            models.CheckConstraint(
                condition=Q(promotional_stock_limit__isnull=True)
                | Q(promotional_stock_sold__lte=F("promotional_stock_limit")),
                name="promotion_offer_sold_not_above_limit",
            ),
        ]

    def __str__(self):
        return f"{self.campaign.name} - {self.product.title}"

    @property
    def promotional_stock_remaining(self) -> int | None:
        if self.promotional_stock_limit is None:
            return None
        return max(self.promotional_stock_limit - self.promotional_stock_sold, 0)

    @property
    def ctr(self) -> float:
        if self.impression_count <= 0:
            return 0.0
        return round((self.click_count / self.impression_count) * 100, 2)

    def is_live(self, now: timezone.datetime | None = None) -> bool:
        now = now or timezone.now()
        if not self.is_enabled or self.review_status != PromotionOfferReviewStatus.APPROVED:
            return False
        if not self.campaign.is_live(now=now):
            return False
        if self.is_flash_deal:
            if self.flash_start_at and self.flash_start_at > now:
                return False
            if self.flash_end_at and self.flash_end_at < now:
                return False
        remaining = self.promotional_stock_remaining
        if remaining is not None and remaining <= 0:
            return False
        return True


class PromotionEvent(models.Model):
    offer = models.ForeignKey(PromotionOffer, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=20, choices=PromotionEventType.choices, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="promotion_events",
    )
    page_path = models.CharField(max_length=220, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.event_type} offer#{self.offer_id}"
