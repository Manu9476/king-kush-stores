from rest_framework.permissions import BasePermission

from .rbac import ALL_ADMIN_PERMISSION_CODES


def is_super_admin(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and user.role == "admin"
        and (user.admin_level == "super_admin" or user.is_superuser)
    )


def get_admin_permissions(user) -> set[str]:
    if not user or not user.is_authenticated or user.role != "admin":
        return set()

    if is_super_admin(user):
        return set(ALL_ADMIN_PERMISSION_CODES)

    assignment = getattr(user, "staff_assignment", None)
    if not assignment or not assignment.is_active or not assignment.role or not assignment.role.is_active:
        return set()

    raw_permissions = assignment.role.permissions if isinstance(assignment.role.permissions, list) else []
    valid_codes = set(ALL_ADMIN_PERMISSION_CODES)
    return {code for code in raw_permissions if isinstance(code, str) and code in valid_codes}


def has_admin_permission(user, permission_code: str) -> bool:
    if is_super_admin(user):
        return True
    return permission_code in get_admin_permissions(user)


def has_admin_access(user) -> bool:
    if is_super_admin(user):
        return True
    return bool(user and user.is_authenticated and user.role == "admin" and get_admin_permissions(user))


class IsMarketplaceAdmin(BasePermission):
    """
    Allows access only to marketplace admins.
    """

    def has_permission(self, request, view):
        user = request.user
        return has_admin_access(user)


class IsSuperAdmin(BasePermission):
    """
    Allows access only to super admin users.
    """

    def has_permission(self, request, view):
        return is_super_admin(request.user)


class IsVendorUser(BasePermission):
    """
    Allows access only to vendor accounts.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == "vendor")


class IsApprovedVendor(BasePermission):
    """
    Allows access only to approved vendor accounts.
    """

    message = "Vendor account is pending approval."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.role == "vendor"):
            return False

        profile = getattr(user, "vendor_profile", None)
        return bool(profile and profile.approval_status == "approved" and profile.is_approved)


def admin_permission_class(permission_code: str):
    class _HasPermission(BasePermission):
        message = f"Missing permission: {permission_code}"

        def has_permission(self, request, view):
            return has_admin_permission(request.user, permission_code)

    return _HasPermission
