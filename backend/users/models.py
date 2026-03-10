from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.utils import timezone
import uuid


def generate_customer_id():
    return f"CUS-{uuid.uuid4().hex[:10].upper()}"

class CustomUserManager(BaseUserManager):
    """
    Custom user model manager where email is the unique identifier
    for authentication instead of usernames.
    """
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('The Email must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'admin')
        extra_fields.setdefault('admin_level', 'super_admin')

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(email, password, **extra_fields)


class CustomUser(AbstractBaseUser, PermissionsMixin):
    """
    The central User model for King-Kush Stores.
    Handles Customers, Vendors, and Admins via the 'role' field.
    """
    ROLE_CHOICES = (
        ('customer', 'Customer'),
        ('vendor', 'Vendor'),
        ('admin', 'Admin'),
    )
    ADMIN_LEVEL_CHOICES = (
        ('super_admin', 'Super Admin'),
        ('staff', 'Staff'),
    )

    email = models.EmailField('email address', unique=True)
    customer_id = models.CharField(max_length=20, unique=True, blank=True, null=True, editable=False, db_index=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    phone_number = models.CharField(max_length=15, blank=True, null=True)
    
    # Role-based access control
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='customer')
    admin_level = models.CharField(max_length=20, choices=ADMIN_LEVEL_CHOICES, blank=True, default="")
    
    # Standard Django user fields
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = CustomUserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    def save(self, *args, **kwargs):
        if not self.customer_id:
            candidate = generate_customer_id()
            while CustomUser.objects.filter(customer_id=candidate).exists():
                candidate = generate_customer_id()
            self.customer_id = candidate
        if self.role == "admin" and not self.admin_level:
            self.admin_level = "super_admin"
        if self.role != "admin":
            self.admin_level = ""
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.email} ({self.role})"


class VendorProfile(models.Model):
    """
    Extended profile for users with the 'vendor' role.
    Stores marketplace-specific data like store name and approval status.
    """
    APPROVAL_STATUS_CHOICES = (
        ('pending_review', 'Pending Review'),
        ('needs_info', 'Needs More Information'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('suspended', 'Suspended'),
    )

    user = models.OneToOneField(CustomUser, on_delete=models.CASCADE, related_name='vendor_profile')
    store_name = models.CharField(max_length=255, unique=True)
    store_description = models.TextField(blank=True, null=True)
    business_email = models.EmailField(blank=True, null=True)
    business_phone = models.CharField(max_length=30, blank=True, null=True)
    business_hours = models.CharField(max_length=255, blank=True, null=True)
    business_location = models.CharField(max_length=255, blank=True, null=True)
    business_address_line_1 = models.CharField(max_length=255, blank=True, null=True)
    business_address_line_2 = models.CharField(max_length=255, blank=True, null=True)
    business_city = models.CharField(max_length=120, blank=True, null=True)
    business_postal_code = models.CharField(max_length=40, blank=True, null=True)
    business_country = models.CharField(max_length=120, blank=True, null=True)
    product_category = models.CharField(max_length=120, blank=True, null=True)
    verification_document = models.FileField(upload_to='vendor_verification/', blank=True, null=True)
    store_logo = models.ImageField(upload_to='vendor_branding/logos/', blank=True, null=True)
    store_banner = models.ImageField(upload_to='vendor_branding/banners/', blank=True, null=True)
    approval_status = models.CharField(max_length=30, choices=APPROVAL_STATUS_CHOICES, default='pending_review', db_index=True)
    review_notes = models.TextField(blank=True, null=True)
    reviewed_by = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='reviewed_vendor_profiles',
    )
    reviewed_at = models.DateTimeField(blank=True, null=True)
    
    # Vendors must be approved by an Admin before they can sell
    is_approved = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.is_approved = self.approval_status == 'approved'
        if self.approval_status in {'approved', 'rejected', 'needs_info', 'suspended'} and not self.reviewed_at:
            self.reviewed_at = timezone.now()
        if self.approval_status == 'pending_review':
            self.reviewed_at = None
            self.reviewed_by = None
        super().save(*args, **kwargs)

    def __str__(self):
        return self.store_name


class AccountActivity(models.Model):
    """
    Read-only support timeline for customer account actions.
    Used by admins to debug customer issues quickly.
    """

    ACTIVITY_CHOICES = (
        ('profile_update', 'Profile Update'),
        ('order_create', 'Order Created'),
        ('order_cancel', 'Order Cancelled'),
        ('address_create', 'Address Added'),
        ('address_update', 'Address Updated'),
        ('address_delete', 'Address Deleted'),
        ('payment_create', 'Payment Method Added'),
        ('payment_update', 'Payment Method Updated'),
        ('payment_delete', 'Payment Method Deleted'),
        ('job_application', 'Job Application Submitted'),
    )

    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='account_activities')
    activity_type = models.CharField(max_length=40, choices=ACTIVITY_CHOICES)
    description = models.CharField(max_length=255)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ('-created_at',)

    def __str__(self):
        return f"{self.user.email} - {self.activity_type} @ {self.created_at.isoformat()}"


class StaffRole(models.Model):
    """
    Defines a reusable department role with granular permissions.
    Permission codes are stored in JSON for flexibility and future expansion.
    """

    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True)
    description = models.TextField(blank=True)
    permissions = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name


class StaffAssignment(models.Model):
    """
    Binds an admin user to one department role and active/inactive status.
    """

    user = models.OneToOneField(CustomUser, on_delete=models.CASCADE, related_name="staff_assignment")
    role = models.ForeignKey(
        StaffRole,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assignments",
    )
    is_active = models.BooleanField(default=True, db_index=True)
    assigned_by = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_assignments_created",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)

    def __str__(self):
        role_name = self.role.name if self.role else "No Role"
        return f"{self.user.email} -> {role_name}"


class AdminActivityLog(models.Model):
    """
    Immutable audit log for staff/admin actions.
    """

    actor = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admin_activity_logs",
    )
    action = models.CharField(max_length=160)
    target_type = models.CharField(max_length=120, blank=True)
    target_id = models.CharField(max_length=64, blank=True)
    description = models.CharField(max_length=255)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        actor = self.actor.email if self.actor else "system"
        return f"{actor}: {self.action} ({self.created_at.isoformat()})"
