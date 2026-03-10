from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


def validate_document_upload(file_obj):
    allowed_extensions = {".pdf", ".doc", ".docx"}
    suffix = Path(file_obj.name).suffix.lower()
    if suffix not in allowed_extensions:
        raise ValidationError("Only PDF, DOC, and DOCX files are allowed.")


def validate_supporting_upload(file_obj):
    allowed_extensions = {".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"}
    suffix = Path(file_obj.name).suffix.lower()
    if suffix not in allowed_extensions:
        raise ValidationError("Only PDF, DOC, DOCX, JPG, or PNG files are allowed.")


class JobOpening(models.Model):
    EMPLOYMENT_CHOICES = (
        ("full_time", "Full Time"),
        ("part_time", "Part Time"),
        ("contract", "Contract"),
        ("internship", "Internship"),
        ("remote", "Remote"),
    )

    title = models.CharField(max_length=180)
    department = models.CharField(max_length=100)
    location = models.CharField(max_length=100)
    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_CHOICES, default="full_time")
    summary = models.TextField()
    responsibilities = models.TextField(blank=True)
    requirements = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    posted_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-is_active", "-posted_at")

    def __str__(self):
        return f"{self.title} ({self.location})"


class JobApplicationField(models.Model):
    FIELD_TYPE_CHOICES = (
        ("text", "Text"),
        ("email", "Email"),
        ("phone", "Phone"),
        ("number", "Number"),
        ("textarea", "Textarea"),
        ("url", "URL"),
        ("select", "Select"),
    )

    key = models.SlugField(max_length=60, unique=True)
    label = models.CharField(max_length=120)
    field_type = models.CharField(max_length=20, choices=FIELD_TYPE_CHOICES, default="text")
    is_required = models.BooleanField(default=False)
    placeholder = models.CharField(max_length=180, blank=True)
    help_text = models.CharField(max_length=255, blank=True)
    select_options = models.JSONField(default=list, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ("sort_order", "id")

    def __str__(self):
        return f"{self.label} ({self.key})"


class JobApplication(models.Model):
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("reviewed", "Reviewed"),
        ("shortlisted", "Shortlisted"),
        ("rejected", "Rejected"),
    )

    applicant_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="job_applications",
    )
    job_opening = models.ForeignKey(
        JobOpening,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="applications",
    )

    full_name = models.CharField(max_length=180, blank=True)
    email = models.EmailField(blank=True)
    phone_number = models.CharField(max_length=40, blank=True)
    country_location = models.CharField(max_length=120, blank=True)
    years_of_experience = models.CharField(max_length=80, blank=True)
    education_level = models.CharField(max_length=120, blank=True)
    professional_skills = models.TextField(blank=True)
    linkedin_portfolio = models.URLField(blank=True)
    cover_letter = models.TextField(blank=True)
    additional_answers = models.JSONField(default=dict, blank=True)

    cv_file = models.FileField(upload_to="job_applications/cv/", validators=[validate_document_upload])
    cover_letter_file = models.FileField(
        upload_to="job_applications/cover_letters/",
        blank=True,
        null=True,
        validators=[validate_document_upload],
    )
    certificates_file = models.FileField(
        upload_to="job_applications/certificates/",
        blank=True,
        null=True,
        validators=[validate_supporting_upload],
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True)
    admin_notes = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="reviewed_job_applications",
    )
    reviewed_at = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        title = self.job_opening.title if self.job_opening else "General Application"
        return f"{self.full_name or self.email} - {title}"
