from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html

from .models import JobApplication, JobApplicationField, JobOpening


@admin.register(JobOpening)
class JobOpeningAdmin(admin.ModelAdmin):
    list_display = ("title", "department", "location", "employment_type", "is_active", "posted_at")
    search_fields = ("title", "department", "location")
    list_filter = ("is_active", "employment_type", "department")


@admin.register(JobApplicationField)
class JobApplicationFieldAdmin(admin.ModelAdmin):
    list_display = ("label", "key", "field_type", "is_required", "is_active", "sort_order")
    search_fields = ("label", "key")
    list_filter = ("field_type", "is_required", "is_active")
    ordering = ("sort_order", "id")


@admin.register(JobApplication)
class JobApplicationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "full_name",
        "email",
        "job_opening",
        "status",
        "cv_link",
        "cover_letter_file_link",
        "certificates_file_link",
        "created_at",
        "reviewed_at",
    )
    list_display_links = ("id", "full_name", "email")
    list_editable = ("status",)
    search_fields = ("full_name", "email", "phone_number", "job_opening__title")
    list_filter = ("status", "created_at", "job_opening")
    readonly_fields = (
        "created_at",
        "updated_at",
        "reviewed_at",
        "applicant_user",
        "cv_link",
        "cover_letter_file_link",
        "certificates_file_link",
    )
    fields = (
        "applicant_user",
        "job_opening",
        "full_name",
        "email",
        "phone_number",
        "country_location",
        "years_of_experience",
        "education_level",
        "professional_skills",
        "linkedin_portfolio",
        "cover_letter",
        "additional_answers",
        "cv_file",
        "cv_link",
        "cover_letter_file",
        "cover_letter_file_link",
        "certificates_file",
        "certificates_file_link",
        "status",
        "admin_notes",
        "reviewed_by",
        "reviewed_at",
        "created_at",
        "updated_at",
    )
    actions = ("mark_reviewed", "mark_shortlisted", "mark_rejected")

    @admin.action(description="Mark selected applications as reviewed")
    def mark_reviewed(self, request, queryset):
        queryset.update(status="reviewed", reviewed_by=request.user, reviewed_at=timezone.now())

    @admin.action(description="Mark selected applications as shortlisted")
    def mark_shortlisted(self, request, queryset):
        queryset.update(status="shortlisted", reviewed_by=request.user, reviewed_at=timezone.now())

    @admin.action(description="Mark selected applications as rejected")
    def mark_rejected(self, request, queryset):
        queryset.update(status="rejected", reviewed_by=request.user, reviewed_at=timezone.now())

    @admin.display(description="CV")
    def cv_link(self, obj):
        if not obj.cv_file:
            return "-"
        return format_html('<a href="{}" target="_blank">Open CV</a>', obj.cv_file.url)

    @admin.display(description="Cover Letter File")
    def cover_letter_file_link(self, obj):
        if not obj.cover_letter_file:
            return "-"
        return format_html('<a href="{}" target="_blank">Open Cover Letter</a>', obj.cover_letter_file.url)

    @admin.display(description="Certificates")
    def certificates_file_link(self, obj):
        if not obj.certificates_file:
            return "-"
        return format_html('<a href="{}" target="_blank">Open Certificates</a>', obj.certificates_file.url)
