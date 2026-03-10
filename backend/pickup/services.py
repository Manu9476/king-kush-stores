from __future__ import annotations

from django.utils import timezone

from users.models import VendorProfile

from .models import PickupStation


def _vendor_station_address(vendor_profile: VendorProfile) -> str:
    if vendor_profile.business_address_line_1:
        address_parts = [vendor_profile.business_address_line_1]
        if vendor_profile.business_address_line_2:
            address_parts.append(vendor_profile.business_address_line_2)
        if vendor_profile.business_city:
            address_parts.append(vendor_profile.business_city)
        return ", ".join(part for part in address_parts if str(part).strip())
    return (
        str(vendor_profile.business_location or "").strip()
        or str(vendor_profile.business_city or "").strip()
        or "Vendor address pending update"
    )


def vendor_station_sync_payload(vendor_profile: VendorProfile) -> dict:
    return {
        "name": str(vendor_profile.store_name or "").strip() or "Vendor Pickup Station",
        "city": str(vendor_profile.business_city or "").strip()
        or str(vendor_profile.business_location or "").strip()
        or "Nairobi",
        "address": _vendor_station_address(vendor_profile),
        "operating_hours": str(vendor_profile.business_hours or "").strip() or "Mon-Sat: 8:00 AM - 6:00 PM",
        "contact_phone": str(vendor_profile.business_phone or "").strip()
        or str(vendor_profile.user.phone_number or "").strip()
        or "N/A",
        "contact_email": str(vendor_profile.business_email or "").strip() or vendor_profile.user.email,
        "is_active": bool(vendor_profile.is_approved and vendor_profile.approval_status == "approved"),
    }


def sync_vendor_owned_stations(vendor_profile: VendorProfile, actor=None) -> int:
    """
    Propagates vendor profile updates to all linked vendor-owned pickup stations
    according to each station's sync flags.
    Returns number of synced stations.
    """

    stations = PickupStation.objects.filter(
        ownership_type="vendor",
        vendor_profile=vendor_profile,
    )
    if not stations.exists():
        return 0

    snapshot = vendor_station_sync_payload(vendor_profile)
    synced = 0
    for station in stations:
        changed_fields = []

        if station.sync_name and station.name != snapshot["name"]:
            station.name = snapshot["name"]
            changed_fields.append("name")

        if station.sync_address:
            if station.city != snapshot["city"]:
                station.city = snapshot["city"]
                changed_fields.append("city")
            if station.address != snapshot["address"]:
                station.address = snapshot["address"]
                changed_fields.append("address")

        if station.sync_contact:
            if station.contact_phone != snapshot["contact_phone"]:
                station.contact_phone = snapshot["contact_phone"]
                changed_fields.append("contact_phone")
            if station.contact_email != snapshot["contact_email"]:
                station.contact_email = snapshot["contact_email"]
                changed_fields.append("contact_email")

        if station.sync_operating_hours and station.operating_hours != snapshot["operating_hours"]:
            station.operating_hours = snapshot["operating_hours"]
            changed_fields.append("operating_hours")

        if station.sync_active_status:
            if station.is_active != snapshot["is_active"]:
                station.is_active = snapshot["is_active"]
                changed_fields.append("is_active")
            # Mirror platform approval status with vendor approval unless admin has suspended/rejected station.
            if station.approval_status not in {"suspended", "rejected"}:
                target_status = "approved" if snapshot["is_active"] else "pending"
                if station.approval_status != target_status:
                    station.approval_status = target_status
                    changed_fields.append("approval_status")

        if changed_fields:
            station.last_vendor_sync_at = timezone.now()
            if actor and getattr(actor, "is_authenticated", False):
                station.updated_by = actor
                changed_fields.append("updated_by")
            changed_fields.extend(["last_vendor_sync_at", "updated_at"])
            station.save(update_fields=sorted(set(changed_fields)))
            synced += 1

    return synced

