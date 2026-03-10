from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterView,
    MyTokenObtainPairView,
    admin_activity_logs,
    admin_capabilities,
    admin_production_readiness,
    admin_staff_account_detail,
    admin_staff_accounts,
    admin_staff_role_detail,
    admin_staff_roles,
    admin_vendor_application_detail,
    admin_vendor_applications,
    change_password,
    me,
    public_vendor_stores,
    vendor_profile_me,
)

urlpatterns = [
    # Registration endpoint
    path('register/', RegisterView.as_view(), name='register'),
    
    # Login endpoint (Generates JWT tokens)
    path('login/', MyTokenObtainPairView.as_view(), name='token_obtain_pair'),
    
    # Endpoint to refresh an expired token silently
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('me/', me, name='user-me'),
    path('change-password/', change_password, name='change-password'),
    path('vendor/profile/', vendor_profile_me, name='vendor-profile-me'),
    path('vendors/public/', public_vendor_stores, name='public-vendor-stores'),
    path('admin/capabilities/', admin_capabilities, name='admin-capabilities'),
    path('admin/production-readiness/', admin_production_readiness, name='admin-production-readiness'),
    path('admin/staff-roles/', admin_staff_roles, name='admin-staff-roles'),
    path('admin/staff-roles/<int:role_id>/', admin_staff_role_detail, name='admin-staff-role-detail'),
    path('admin/staff-accounts/', admin_staff_accounts, name='admin-staff-accounts'),
    path('admin/staff-accounts/<int:user_id>/', admin_staff_account_detail, name='admin-staff-account-detail'),
    path('admin/activity-logs/', admin_activity_logs, name='admin-activity-logs'),
    path('admin/vendor-applications/', admin_vendor_applications, name='admin-vendor-applications'),
    path('admin/vendor-applications/<int:vendor_profile_id>/', admin_vendor_application_detail, name='admin-vendor-application-detail'),
]
