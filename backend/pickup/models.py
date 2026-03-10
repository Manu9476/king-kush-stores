from django.db import models

from users.models import CustomUser, VendorProfile


class PickupStation(models.Model):
    """
    Central pickup-station catalog managed by platform admins.
    """

    OWNERSHIP_CHOICES = (
        ("platform", "Platform Managed"),
        ("vendor", "Vendor Managed"),
    )
    APPROVAL_STATUS_CHOICES = (
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("suspended", "Suspended"),
        ("rejected", "Rejected"),
    )

    ownership_type = models.CharField(max_length=20, choices=OWNERSHIP_CHOICES, default="platform", db_index=True)
    vendor_profile = models.ForeignKey(
        VendorProfile,
        on_delete=models.SET_NULL,
        related_name="pickup_stations",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=120)
    city = models.CharField(max_length=120, db_index=True)
    address = models.CharField(max_length=255)
    operating_hours = models.CharField(max_length=255)
    contact_phone = models.CharField(max_length=30)
    contact_email = models.EmailField(blank=True, null=True)
    services = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    supports_pickup = models.BooleanField(default=True)
    supports_returns = models.BooleanField(default=True)
    approval_status = models.CharField(max_length=20, choices=APPROVAL_STATUS_CHOICES, default="approved", db_index=True)
    is_visible_to_customers = models.BooleanField(default=True, db_index=True)

    # Vendor-sync controls (applies when ownership_type=vendor)
    sync_name = models.BooleanField(default=True)
    sync_address = models.BooleanField(default=True)
    sync_contact = models.BooleanField(default=True)
    sync_operating_hours = models.BooleanField(default=True)
    sync_active_status = models.BooleanField(default=True)
    last_vendor_sync_at = models.DateTimeField(blank=True, null=True)

    temporary_notice = models.TextField(blank=True)
    notice_updated_at = models.DateTimeField(blank=True, null=True)
    created_by = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        related_name="pickup_stations_created",
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        related_name="pickup_stations_updated",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("city", "name")
        unique_together = (("name", "city"),)

    def save(self, *args, **kwargs):
        if self.ownership_type == "platform":
            self.vendor_profile = None
            if self.approval_status == "pending":
                self.approval_status = "approved"
        elif self.ownership_type == "vendor" and not self.approval_status:
            self.approval_status = "pending"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.city})"


class PickupStationAssignment(models.Model):
    """
    Maps station-level admins/staff to stations with restricted scope.
    """

    ROLE_CHOICES = (
        ("manager", "Manager"),
        ("staff", "Staff"),
    )

    station = models.ForeignKey(PickupStation, on_delete=models.CASCADE, related_name="assignments")
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name="pickup_station_assignments")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="staff")
    can_manage_local_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True, db_index=True)
    notes = models.TextField(blank=True)
    assigned_by = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        related_name="pickup_assignments_created",
        null=True,
        blank=True,
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = (("station", "user"),)
        ordering = ("station__city", "station__name", "user__email")

    def __str__(self):
        return f"{self.user.email} -> {self.station.name} ({self.role})"


class PickupOrderOperation(models.Model):
    """
    Audit trail for station operations performed on pickup orders.
    """

    EVENT_CHOICES = (
        ("ready_for_pickup", "Ready For Pickup"),
        ("collected", "Collected"),
        ("return_dropoff", "Return Drop-off"),
        ("notice_update", "Station Notice Update"),
    )

    station = models.ForeignKey(PickupStation, on_delete=models.CASCADE, related_name="operations")
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pickup_operations",
    )
    actor = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        related_name="pickup_operations",
        null=True,
        blank=True,
    )
    event_type = models.CharField(max_length=40, choices=EVENT_CHOICES, db_index=True)
    notes = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.station.name} - {self.event_type} @ {self.created_at.isoformat()}"
