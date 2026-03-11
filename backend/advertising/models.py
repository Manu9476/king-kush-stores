from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class AdvertisingBusinessType(models.TextChoices):
    VENDOR = "vendor", "Vendor"
    BRAND = "brand", "Brand"
    AGENCY = "agency", "Agency"
    PLATFORM = "platform", "Platform"
    OTHER = "other", "Other"


class AdvertisingRequestStatus(models.TextChoices):
    PENDING_REVIEW = "pending_review", "Pending Review"
    NEEDS_INFO = "needs_info", "Needs Information"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class AdvertisingCampaignSource(models.TextChoices):
    INTERNAL = "internal", "King-Kush Promotion"
    EXTERNAL = "external", "External Advertiser"
    VENDOR = "vendor", "Vendor Sponsored Campaign"


class AdvertisingCampaignStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SCHEDULED = "scheduled", "Scheduled"
    ACTIVE = "active", "Active"
    PAUSED = "paused", "Paused"
    REJECTED = "rejected", "Rejected"
    EXPIRED = "expired", "Expired"
    COMPLETED = "completed", "Completed"


class AdvertisingCampaignPurpose(models.TextChoices):
    SALES = "sales", "Sales"
    AWARENESS = "awareness", "Awareness"
    NEW_ARRIVAL = "new_arrival", "New Arrival"
    FLASH_SALE = "flash_sale", "Flash Sale"
    VENDOR_SPOTLIGHT = "vendor_spotlight", "Vendor Spotlight"
    BRAND_PROMOTION = "brand_promotion", "Brand Promotion"
    OTHER = "other", "Other"


class AdvertisingEventType(models.TextChoices):
    IMPRESSION = "impression", "Impression"
    CLICK = "click", "Click"


class AdvertisingPlacement(models.Model):
    key = models.SlugField(max_length=120, unique=True)
    name = models.CharField(max_length=140)
    description = models.TextField(blank=True)
    max_ads_per_page = models.PositiveSmallIntegerField(default=1)
    default_image_width = models.PositiveIntegerField(default=1200)
    default_image_height = models.PositiveIntegerField(default=300)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return f"{self.name} ({self.key})"


class AdvertisingRequest(models.Model):
    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="advertising_requests",
    )
    vendor_profile = models.ForeignKey(
        "users.VendorProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="advertising_requests",
    )
    full_name = models.CharField(max_length=180)
    company_name = models.CharField(max_length=220, blank=True)
    email = models.EmailField()
    phone_number = models.CharField(max_length=40, blank=True)
    business_type = models.CharField(
        max_length=30,
        choices=AdvertisingBusinessType.choices,
        default=AdvertisingBusinessType.OTHER,
        db_index=True,
    )
    ad_objective = models.CharField(max_length=220)
    preferred_placement = models.ForeignKey(
        AdvertisingPlacement,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requests",
    )
    campaign_duration = models.CharField(max_length=120)
    budget_range = models.CharField(max_length=120)
    message = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=AdvertisingRequestStatus.choices,
        default=AdvertisingRequestStatus.PENDING_REVIEW,
        db_index=True,
    )
    admin_notes = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_advertising_requests",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"Ad Request #{self.id} - {self.company_name or self.email}"

    def save(self, *args, **kwargs):
        if self.status == AdvertisingRequestStatus.PENDING_REVIEW:
            self.reviewed_by = None
            self.reviewed_at = None
        elif not self.reviewed_at:
            self.reviewed_at = timezone.now()
        super().save(*args, **kwargs)


class AdvertisingCampaign(models.Model):
    source_type = models.CharField(
        max_length=20,
        choices=AdvertisingCampaignSource.choices,
        default=AdvertisingCampaignSource.EXTERNAL,
        db_index=True,
    )
    linked_request = models.ForeignKey(
        AdvertisingRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="campaigns",
    )
    placement = models.ForeignKey(AdvertisingPlacement, on_delete=models.PROTECT, related_name="campaigns")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="advertising_campaigns",
    )
    vendor_context = models.ForeignKey(
        "users.VendorProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="advertising_campaigns",
    )
    title = models.CharField(max_length=180)
    purpose = models.CharField(
        max_length=30,
        choices=AdvertisingCampaignPurpose.choices,
        default=AdvertisingCampaignPurpose.AWARENESS,
        db_index=True,
    )
    subtitle = models.CharField(max_length=220, blank=True)
    description = models.TextField(blank=True)
    target_url = models.URLField(blank=True)
    cta_label = models.CharField(max_length=60, blank=True)
    creative_image = models.ImageField(upload_to="advertising/creatives/", blank=True, null=True)
    category_context = models.CharField(max_length=120, blank=True)
    status = models.CharField(
        max_length=20,
        choices=AdvertisingCampaignStatus.choices,
        default=AdvertisingCampaignStatus.DRAFT,
        db_index=True,
    )
    is_visible = models.BooleanField(default=True, db_index=True)
    is_sponsored = models.BooleanField(default=True)
    priority = models.PositiveSmallIntegerField(default=50, db_index=True)
    start_at = models.DateTimeField(null=True, blank=True, db_index=True)
    end_at = models.DateTimeField(null=True, blank=True, db_index=True)
    budget_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    pricing_notes = models.CharField(max_length=160, blank=True)
    impression_count = models.PositiveIntegerField(default=0)
    click_count = models.PositiveIntegerField(default=0)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_advertising_campaigns",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_advertising_campaigns",
    )
    last_served_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-priority", "-updated_at")
        constraints = [
            models.CheckConstraint(
                condition=Q(end_at__isnull=True) | Q(start_at__isnull=True) | Q(end_at__gte=models.F("start_at")),
                name="advertising_campaign_end_after_start",
            ),
        ]

    def __str__(self):
        return f"{self.title} ({self.placement.key})"

    @property
    def ctr(self) -> float:
        if self.impression_count <= 0:
            return 0.0
        return round((self.click_count / self.impression_count) * 100, 2)

    def is_live(self, now: timezone.datetime | None = None) -> bool:
        now = now or timezone.now()
        if not self.is_visible:
            return False
        if self.status not in {AdvertisingCampaignStatus.ACTIVE, AdvertisingCampaignStatus.SCHEDULED}:
            return False
        if self.start_at and self.start_at > now:
            return False
        if self.end_at and self.end_at < now:
            return False
        return True

    def save(self, *args, **kwargs):
        now = timezone.now()
        if self.end_at and self.end_at < now and self.status in {
            AdvertisingCampaignStatus.ACTIVE,
            AdvertisingCampaignStatus.SCHEDULED,
        }:
            self.status = AdvertisingCampaignStatus.EXPIRED
        if self.start_at and self.start_at > now and self.status == AdvertisingCampaignStatus.ACTIVE:
            self.status = AdvertisingCampaignStatus.SCHEDULED
        super().save(*args, **kwargs)


class AdvertisingEvent(models.Model):
    campaign = models.ForeignKey(AdvertisingCampaign, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=20, choices=AdvertisingEventType.choices, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="advertising_events",
    )
    page_path = models.CharField(max_length=255, blank=True)
    context_key = models.CharField(max_length=120, blank=True)
    session_id = models.CharField(max_length=120, blank=True, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.event_type} campaign#{self.campaign_id}"

# Create your models here.
