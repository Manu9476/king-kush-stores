from django.contrib import admin

from .models import CompanyMedia, CompanyProfile, CreatorProfile, Department, TeamMember


class CompanyMediaInline(admin.TabularInline):
    model = CompanyMedia
    extra = 1
    fields = ("image", "caption", "is_featured", "sort_order")


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "sort_order", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "description")
    ordering = ("sort_order", "name")


@admin.register(CompanyProfile)
class CompanyProfileAdmin(admin.ModelAdmin):
    list_display = ("company_name", "is_active", "is_published", "updated_at")
    list_filter = ("is_active", "is_published")
    search_fields = ("company_name", "description", "category", "location")
    inlines = [CompanyMediaInline]


@admin.register(CreatorProfile)
class CreatorProfileAdmin(admin.ModelAdmin):
    list_display = ("full_name", "role_title", "is_active", "is_featured", "is_published", "sort_order")
    list_filter = ("is_active", "is_featured", "is_published", "departments")
    search_fields = ("full_name", "role_title", "bio", "email")
    filter_horizontal = ("departments",)
    ordering = ("sort_order", "full_name")


@admin.register(TeamMember)
class TeamMemberAdmin(admin.ModelAdmin):
    list_display = ("full_name", "role_title", "is_active", "is_featured", "is_published", "sort_order")
    list_filter = ("is_active", "is_featured", "is_published", "departments")
    search_fields = ("full_name", "role_title", "bio", "email")
    filter_horizontal = ("departments",)
    ordering = ("sort_order", "full_name")
