from typing import Optional

from .models import VendorProfile


def get_user_vendor_profile(user) -> Optional[VendorProfile]:
    """
    Safely resolve reverse OneToOne vendor_profile without raising DoesNotExist.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return None
    try:
        return user.vendor_profile
    except VendorProfile.DoesNotExist:
        return None
