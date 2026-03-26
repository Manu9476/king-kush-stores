from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.text import slugify


class Department(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=150, unique=True, blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("sort_order", "name")

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)[:140] or "department"
            candidate = base
            counter = 2
            while Department.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                candidate = f"{base}-{counter}"[:150]
                counter += 1
            self.slug = candidate
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class CompanyProfile(models.Model):
    company_name = models.CharField(max_length=180)
    slug = models.SlugField(max_length=200, unique=True, blank=True)
    logo = models.ImageField(upload_to="company/", blank=True, null=True)
    banner = models.ImageField(upload_to="company/", blank=True, null=True)
    description = models.TextField(blank=True)
    mission = models.TextField(blank=True)
    vision = models.TextField(blank=True)
    mission_vision = models.TextField(blank=True)
    email = models.EmailField(blank=True)
    phone_number = models.CharField(max_length=50, blank=True)
    website_url = models.URLField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    location = models.CharField(max_length=120, blank=True)
    year_founded = models.PositiveIntegerField(blank=True, null=True)
    category = models.CharField(max_length=120, blank=True)
    facebook_url = models.URLField(blank=True)
    instagram_url = models.URLField(blank=True)
    x_url = models.URLField(blank=True)
    linkedin_url = models.URLField(blank=True)
    youtube_url = models.URLField(blank=True)
    tiktok_url = models.URLField(blank=True)
    is_published = models.BooleanField(default=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_company_profiles",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_company_profiles",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.company_name)[:190] or "company-profile"
            candidate = base
            counter = 2
            while CompanyProfile.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                candidate = f"{base}-{counter}"[:200]
                counter += 1
            self.slug = candidate
        super().save(*args, **kwargs)

    def __str__(self):
        return self.company_name


class CompanyMedia(models.Model):
    company = models.ForeignKey(CompanyProfile, on_delete=models.CASCADE, related_name="featured_media")
    image = models.ImageField(upload_to="company/media/")
    caption = models.CharField(max_length=180, blank=True)
    is_featured = models.BooleanField(default=False, db_index=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("sort_order", "id")

    def __str__(self):
        return f"{self.company.company_name} media #{self.id}"


class BasePersonProfile(models.Model):
    full_name = models.CharField(max_length=180)
    slug = models.SlugField(max_length=200, unique=True, blank=True)
    profile_photo = models.ImageField(upload_to="people/", blank=True, null=True)
    role_title = models.CharField(max_length=160)
    departments = models.ManyToManyField(Department, blank=True, related_name="%(class)ss")
    bio = models.TextField(blank=True)
    email = models.EmailField(blank=True)
    phone_number = models.CharField(max_length=50, blank=True)
    facebook_url = models.URLField(blank=True)
    instagram_url = models.URLField(blank=True)
    x_url = models.URLField(blank=True)
    linkedin_url = models.URLField(blank=True)
    portfolio_url = models.URLField(blank=True)
    joining_date = models.DateField(blank=True, null=True)
    is_active = models.BooleanField(default=True, db_index=True)
    is_featured = models.BooleanField(default=False, db_index=True)
    is_published = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    def clean(self):
        if not str(self.full_name or "").strip():
            raise ValidationError({"full_name": "Full name is required."})
        if not str(self.role_title or "").strip():
            raise ValidationError({"role_title": "Role/title is required."})

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.full_name)[:190] or self.__class__.__name__.lower()
            candidate = base
            counter = 2
            while self.__class__.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                candidate = f"{base}-{counter}"[:200]
                counter += 1
            self.slug = candidate
        super().save(*args, **kwargs)


class CreatorProfile(BasePersonProfile):
    class Meta:
        ordering = ("sort_order", "full_name")

    def __str__(self):
        return self.full_name


class TeamMember(BasePersonProfile):
    class Meta:
        ordering = ("sort_order", "full_name")

    def __str__(self):
        return self.full_name
