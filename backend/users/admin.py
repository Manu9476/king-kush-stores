from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from careers.models import JobApplication
from chatbot.models import ChatConversation
from orders.models import Order, PaymentMethod, ShippingAddress
from .models import (
    AccountActivity,
    AdminActivityLog,
    CustomUser,
    StaffAssignment,
    StaffRole,
    VendorProfile,
)


class OrderInline(admin.TabularInline):
    model = Order
    extra = 0
    can_delete = False
    show_change_link = True
    fields = ("order_number", "status", "total_amount", "is_paid", "created_at")
    readonly_fields = fields


class ShippingAddressInline(admin.TabularInline):
    model = ShippingAddress
    extra = 0
    can_delete = False
    show_change_link = True
    fields = ("full_name", "phone_number", "city", "country", "is_default")
    readonly_fields = fields


class PaymentMethodInline(admin.TabularInline):
    model = PaymentMethod
    extra = 0
    can_delete = False
    show_change_link = True
    fields = ("method_type", "provider", "card_last4", "mpesa_phone_masked", "billing_email", "is_default", "updated_at")
    readonly_fields = fields


class ChatConversationInline(admin.TabularInline):
    model = ChatConversation
    extra = 0
    can_delete = False
    show_change_link = True
    fields = ("session_id", "last_user_message", "last_bot_message", "updated_at")
    readonly_fields = fields


class AccountActivityInline(admin.TabularInline):
    model = AccountActivity
    extra = 0
    can_delete = False
    fields = ("created_at", "activity_type", "description", "metadata")
    readonly_fields = fields


class JobApplicationInline(admin.TabularInline):
    model = JobApplication
    fk_name = "applicant_user"
    extra = 0
    can_delete = False
    show_change_link = True
    fields = ("job_opening", "status", "created_at", "reviewed_at")
    readonly_fields = fields


class CustomUserAdmin(UserAdmin):
    """
    Configures how the CustomUser model is displayed in the Django Admin dashboard.
    """
    model = CustomUser
    ordering = ['email']
    list_display = ['email', 'customer_id', 'first_name', 'last_name', 'phone_number', 'role', 'admin_level', 'is_active', 'date_joined', 'last_login']
    search_fields = ['email', 'customer_id', 'first_name', 'last_name']
    list_filter = ['role', 'admin_level', 'is_active', 'is_staff']
    readonly_fields = ('customer_id', 'last_login', 'date_joined')
    inlines = [OrderInline, ShippingAddressInline, PaymentMethodInline, ChatConversationInline, AccountActivityInline, JobApplicationInline]
    actions = ["mark_customers_active", "mark_customers_inactive"]
    
    # Define which fields appear on the user edit page
    fieldsets = (
        ('Login Credentials', {'fields': ('email', 'customer_id', 'password')}),
        ('Personal Info', {'fields': ('first_name', 'last_name', 'phone_number')}),
        ('Role & Permissions', {'fields': ('role', 'admin_level', 'is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    
    # Remove the username field from the creation form since we use email
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'first_name', 'last_name', 'role', 'password1', 'password2')}
        ),
    )

    @admin.action(description="Mark selected customers active")
    def mark_customers_active(self, request, queryset):
        queryset.update(is_active=True)

    @admin.action(description="Mark selected customers inactive")
    def mark_customers_inactive(self, request, queryset):
        queryset.update(is_active=False)

class VendorProfileAdmin(admin.ModelAdmin):
    """
    Configures how the VendorProfile model is displayed in the Django Admin dashboard.
    """
    list_display = ['store_name', 'user', 'approval_status', 'is_approved', 'business_phone', 'product_category', 'created_at']
    search_fields = ['store_name', 'user__email', 'business_email', 'business_phone']
    list_filter = ['approval_status', 'is_approved', 'created_at']
    readonly_fields = ['reviewed_at', 'updated_at', 'created_at']
    actions = ['approve_selected_vendors', 'reject_selected_vendors', 'suspend_selected_vendors']

    @admin.action(description="Approve selected vendors")
    def approve_selected_vendors(self, request, queryset):
        for profile in queryset:
            profile.approval_status = 'approved'
            profile.reviewed_by = request.user
            profile.save()

    @admin.action(description="Reject selected vendors")
    def reject_selected_vendors(self, request, queryset):
        for profile in queryset:
            profile.approval_status = 'rejected'
            profile.reviewed_by = request.user
            profile.save()

    @admin.action(description="Suspend selected vendors")
    def suspend_selected_vendors(self, request, queryset):
        for profile in queryset:
            profile.approval_status = 'suspended'
            profile.reviewed_by = request.user
            profile.save()


@admin.register(AccountActivity)
class AccountActivityAdmin(admin.ModelAdmin):
    list_display = ("user", "activity_type", "description", "created_at")
    search_fields = ("user__email", "description")
    list_filter = ("activity_type", "created_at")
    readonly_fields = ("user", "activity_type", "description", "metadata", "created_at")


@admin.register(StaffRole)
class StaffRoleAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_active", "updated_at")
    search_fields = ("name", "slug", "description")
    list_filter = ("is_active", "created_at")


@admin.register(StaffAssignment)
class StaffAssignmentAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "is_active", "assigned_by", "updated_at")
    search_fields = ("user__email", "role__name", "assigned_by__email")
    list_filter = ("is_active", "role")


@admin.register(AdminActivityLog)
class AdminActivityLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "actor", "action", "target_type", "target_id")
    search_fields = ("actor__email", "action", "description", "target_type", "target_id")
    list_filter = ("action", "target_type", "created_at")
    readonly_fields = ("actor", "action", "target_type", "target_id", "description", "metadata", "created_at")

# Register the models with the admin site
admin.site.register(CustomUser, CustomUserAdmin)
admin.site.register(VendorProfile, VendorProfileAdmin)
