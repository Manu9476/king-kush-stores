from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.models import Count, F, Prefetch, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from products.models import Product

from .models import AccountActivity, AdminActivityLog, StaffRole, VendorProfile
from .permissions import (
    IsMarketplaceAdmin,
    IsVendorUser,
    has_admin_permission,
    is_super_admin,
)
from .rbac import ensure_default_staff_roles, log_admin_activity
from .serializers import (
    AdminActivityLogSerializer,
    MyTokenObtainPairSerializer,
    PublicVendorStoreSerializer,
    RegisterSerializer,
    StaffAccountCreateSerializer,
    StaffAccountSerializer,
    StaffAccountUpdateSerializer,
    StaffRoleSerializer,
    UserProfileSerializer,
    UserSerializer,
    VendorApplicationAdminSerializer,
    VendorApplicationReviewSerializer,
    VendorProfileSerializer,
    VendorProfileUpdateSerializer,
    build_admin_capabilities_payload,
)
from .vendor_profile_utils import get_user_vendor_profile

User = get_user_model()


def _ensure_vendor_profile(user):
    """
    Backfills a missing VendorProfile for legacy accounts that were promoted
    to vendor role after signup.
    """
    profile = get_user_vendor_profile(user)
    if profile or user.role != "vendor":
        return profile

    email_prefix = (user.email.split("@")[0] if user.email else "").strip() or "Vendor"
    base_name = (user.first_name or "").strip() or email_prefix
    store_name = f"{base_name} Store {user.customer_id or user.id}"

    profile = VendorProfile.objects.create(
        user=user,
        store_name=store_name[:255],
        store_description="",
        business_email=user.email,
        business_phone=user.phone_number or "",
        approval_status="pending_review",
    )
    AccountActivity.objects.create(
        user=user,
        activity_type="profile_update",
        description="Vendor profile was initialized for this account.",
        metadata={"vendor_profile_id": profile.id},
    )
    return profile


class MyTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer


class RegisterView(generics.CreateAPIView):
    queryset = RegisterSerializer.Meta.model.objects.all()
    permission_classes = (AllowAny,)
    serializer_class = RegisterSerializer
    parser_classes = (JSONParser, FormParser, MultiPartParser)

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        response_message = "User created successfully. You can now log in."
        vendor_profile = get_user_vendor_profile(user)
        if vendor_profile:
            response_message = (
                "Vendor application submitted successfully. "
                "Your account is pending admin review before seller tools are activated."
            )

        return Response(
            {
                "user": UserSerializer(user, context=self.get_serializer_context()).data,
                "message": response_message,
            },
            status=status.HTTP_201_CREATED,
        )


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user

    if request.method == "GET":
        serializer = UserProfileSerializer(user, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = UserProfileSerializer(user, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    previous_values = {
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "phone_number": user.phone_number,
    }
    serializer.save()

    changed_fields = {}
    for field, previous in previous_values.items():
        current = getattr(user, field)
        if previous != current:
            changed_fields[field] = {"from": previous, "to": current}

    if changed_fields:
        AccountActivity.objects.create(
            user=user,
            activity_type="profile_update",
            description="Customer updated profile details.",
            metadata={"changed_fields": changed_fields},
        )

    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    user = request.user
    current_password = request.data.get("current_password", "")
    new_password = request.data.get("new_password", "")
    confirm_password = request.data.get("confirm_password", "")

    if not user.check_password(current_password):
        return Response({"detail": "Current password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)
    if len(new_password) < 8:
        return Response({"detail": "New password must be at least 8 characters."}, status=status.HTTP_400_BAD_REQUEST)
    if new_password != confirm_password:
        return Response({"detail": "New password and confirmation do not match."}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password)
    user.save(update_fields=["password"])
    AccountActivity.objects.create(
        user=user,
        activity_type="profile_update",
        description="User changed account password.",
        metadata={},
    )

    return Response({"detail": "Password updated successfully."}, status=status.HTTP_200_OK)


@api_view(["GET", "PATCH"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([IsAuthenticated, IsVendorUser])
def vendor_profile_me(request):
    vendor_profile = _ensure_vendor_profile(request.user)
    if not vendor_profile:
        return Response({"detail": "Vendor profile not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        serializer = VendorProfileSerializer(vendor_profile, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = VendorProfileUpdateSerializer(vendor_profile, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    try:
        from pickup.services import sync_vendor_owned_stations

        sync_vendor_owned_stations(vendor_profile, actor=request.user)
    except Exception:
        # Pickup app can fail independently; vendor profile updates should still persist.
        pass
    AccountActivity.objects.create(
        user=request.user,
        activity_type="profile_update",
        description="Vendor updated store profile details.",
        metadata={"vendor_profile_id": vendor_profile.id},
    )
    return Response(VendorProfileSerializer(vendor_profile, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([AllowAny])
def public_vendor_stores(request):
    query = request.query_params.get("q", "").strip()
    city = request.query_params.get("city", "").strip()
    country = request.query_params.get("country", "").strip()
    category = request.query_params.get("category", "").strip()
    min_score_raw = request.query_params.get("min_score", "").strip()

    queryset = (
        VendorProfile.objects.filter(is_approved=True, approval_status="approved")
        .annotate(total_products=Count("products", filter=Q(products__is_active=True), distinct=True))
        .prefetch_related(Prefetch("products", queryset=Product.objects.filter(is_active=True).select_related("category")))
    )

    if query:
        queryset = queryset.filter(
            Q(store_name__icontains=query)
            | Q(store_description__icontains=query)
            | Q(business_location__icontains=query)
            | Q(business_city__icontains=query)
            | Q(business_country__icontains=query)
            | Q(product_category__icontains=query)
            | Q(products__category__name__icontains=query)
        )
    if city:
        queryset = queryset.filter(Q(business_city__icontains=city) | Q(business_location__icontains=city))
    if country:
        queryset = queryset.filter(business_country__icontains=country)
    if category:
        queryset = queryset.filter(Q(product_category__icontains=category) | Q(products__category__name__icontains=category))

    queryset = queryset.distinct().order_by("store_name")
    stores = list(PublicVendorStoreSerializer(queryset, many=True, context={"request": request}).data)

    min_score = None
    if min_score_raw:
        try:
            min_score = float(min_score_raw)
        except ValueError:
            min_score = None

    if min_score is not None:
        stores = [store for store in stores if float(store.get("store_score", 0) or 0) >= min_score]

    city_options = sorted(
        {
            str(store.get("business_city") or "").strip()
            for store in stores
            if str(store.get("business_city") or "").strip()
        }
    )
    category_options = sorted(
        {
            str(category_name).strip()
            for store in stores
            for category_name in [str(store.get("product_category") or "").strip(), *store.get("catalog_categories", [])]
            if str(category_name).strip()
        }
    )

    return Response(
        {
            "stores": stores,
            "meta": {
                "count": len(stores),
                "city_options": city_options,
                "category_options": category_options,
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_vendor_applications(request):
    if not has_admin_permission(request.user, "vendors.view"):
        return Response({"detail": "Missing permission: vendors.view"}, status=status.HTTP_403_FORBIDDEN)

    query = request.query_params.get("q", "").strip()
    status_filter = request.query_params.get("status", "").strip()

    queryset = VendorProfile.objects.select_related("user", "reviewed_by").all().order_by("-created_at")
    if status_filter:
        queryset = queryset.filter(approval_status=status_filter)
    if query:
        queryset = queryset.filter(
            Q(user__email__icontains=query)
            | Q(store_name__icontains=query)
            | Q(business_email__icontains=query)
            | Q(business_phone__icontains=query)
        )

    serializer = VendorApplicationAdminSerializer(queryset, many=True, context={"request": request})
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_vendor_application_detail(request, vendor_profile_id: int):
    if not has_admin_permission(request.user, "vendors.approve"):
        return Response({"detail": "Missing permission: vendors.approve"}, status=status.HTTP_403_FORBIDDEN)

    try:
        profile = VendorProfile.objects.select_related("user").get(id=vendor_profile_id)
    except VendorProfile.DoesNotExist:
        return Response({"detail": "Vendor application not found."}, status=status.HTTP_404_NOT_FOUND)

    serializer = VendorApplicationReviewSerializer(profile, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save(reviewed_by=request.user, reviewed_at=timezone.now())
    try:
        from pickup.services import sync_vendor_owned_stations

        sync_vendor_owned_stations(profile, actor=request.user)
    except Exception:
        pass

    AccountActivity.objects.create(
        user=profile.user,
        activity_type="profile_update",
        description=f"Vendor application status updated to {profile.approval_status}.",
        metadata={
            "approval_status": profile.approval_status,
            "review_notes": profile.review_notes,
            "reviewed_by": request.user.email,
        },
    )
    log_admin_activity(
        actor=request.user,
        action="vendor.application.review",
        description=f"Reviewed vendor application for {profile.store_name}: {profile.approval_status}.",
        target_type="VendorProfile",
        target_id=str(profile.id),
        metadata={
            "approval_status": profile.approval_status,
            "vendor_email": profile.user.email,
        },
    )
    try:
        from receipts.services import issue_receipt_safe

        issue_receipt_safe(
            category="admin",
            receipt_type="admin_approval",
            owner_type="admin",
            owner_user=request.user,
            actor=request.user,
            vendor=profile,
            related_entity_type="vendor_application",
            related_entity_id=str(profile.id),
            related_reference=profile.store_name,
            summary={
                "action": "vendor_application_review",
                "approval_status": profile.approval_status,
                "review_notes": profile.review_notes or "",
                "vendor_email": profile.user.email,
            },
            event_key=f"vendor_application_review:{profile.id}:{profile.updated_at.isoformat()}",
        )
    except Exception:
        pass

    return Response(
        VendorApplicationAdminSerializer(profile, context={"request": request}).data,
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_capabilities(request):
    ensure_default_staff_roles()
    payload = build_admin_capabilities_payload(request.user)
    return Response(payload, status=status.HTTP_200_OK)


def _readiness_check(
    *,
    key: str,
    label: str,
    status_value: str,
    detail: str,
    metric: str = "",
    action: str = "",
    fix_path: str = "",
):
    return {
        "key": key,
        "label": label,
        "status": status_value,
        "detail": detail,
        "metric": metric,
        "action": action,
        "fix_path": fix_path,
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_production_readiness(request):
    if not has_admin_permission(request.user, "dashboard.view"):
        return Response({"detail": "Missing permission: dashboard.view"}, status=status.HTTP_403_FORBIDDEN)

    # Local imports keep cross-app coupling minimal at module import time.
    from chatbot.models import ChatConversation
    from orders.models import MarketplacePayment, Order, VendorPayoutRequest, VendorWallet, VendorOrder
    from products.models import Product
    from receipts.models import Receipt
    from support.models import KnowledgeBaseEntry, SupportTicket, SupportTicketStatus
    from users.models import StaffAssignment

    now = timezone.now()
    stale_payment_cutoff = now - timedelta(minutes=15)
    stale_support_cutoff = now - timedelta(hours=48)
    stale_payout_cutoff = now - timedelta(hours=72)
    recent_day_cutoff = now - timedelta(hours=24)

    # Security and environment snapshot.
    environment_name = str(getattr(settings, "ENVIRONMENT", "development")).lower()
    is_production = bool(getattr(settings, "IS_PRODUCTION", environment_name in {"production", "prod", "live"}))
    debug_enabled = bool(getattr(settings, "DEBUG", False))

    secret_key = str(getattr(settings, "SECRET_KEY", ""))
    secret_key_from_env = bool(getattr(settings, "SECRET_KEY_FROM_ENV", False))
    weak_secret_key = (
        not secret_key
        or len(secret_key) < 32
        or "replace-this-with-a-strong-key" in secret_key.lower()
        or "django-insecure" in secret_key.lower()
    )

    allowed_hosts = [str(host).strip() for host in getattr(settings, "ALLOWED_HOSTS", []) if str(host).strip()]
    allowed_hosts_empty = len(allowed_hosts) == 0
    wildcard_hosts = "*" in allowed_hosts

    cors_open = bool(getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False))
    cors_allowed_origins = [
        str(origin).strip() for origin in getattr(settings, "CORS_ALLOWED_ORIGINS", []) if str(origin).strip()
    ]
    localhost_cors_origins = [
        origin
        for origin in cors_allowed_origins
        if "localhost" in origin.lower() or "127.0.0.1" in origin.lower()
    ]

    secure_ssl_redirect = bool(getattr(settings, "SECURE_SSL_REDIRECT", False))
    session_cookie_secure = bool(getattr(settings, "SESSION_COOKIE_SECURE", False))
    csrf_cookie_secure = bool(getattr(settings, "CSRF_COOKIE_SECURE", False))

    static_root = str(getattr(settings, "STATIC_ROOT", "") or "").strip()
    static_url = str(getattr(settings, "STATIC_URL", "") or "").strip()
    static_files_configured = bool(static_root and static_url)

    db_connection_ok = True
    db_connection_error = ""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception as exc:
        db_connection_ok = False
        db_connection_error = str(exc)

    marketplace_commission_rate = float(getattr(settings, "MARKETPLACE_COMMISSION_RATE", 0.0) or 0.0)
    commission_rate_valid = 0.0 <= marketplace_commission_rate <= 1.0

    mpesa_environment = str(getattr(settings, "MPESA_ENVIRONMENT", getattr(settings, "MPESA_ENV", "sandbox"))).lower()
    mpesa_environment_valid = mpesa_environment in {"sandbox", "production", "live"}
    mpesa_live_mode = mpesa_environment in {"production", "live"}
    mpesa_live_enabled = bool(getattr(settings, "MPESA_ENABLE_LIVE", False))
    mpesa_credentials_required = is_production or mpesa_live_mode or mpesa_live_enabled
    mpesa_core_fields = {
        "consumer_key": str(getattr(settings, "MPESA_CONSUMER_KEY", "")).strip(),
        "consumer_secret": str(getattr(settings, "MPESA_CONSUMER_SECRET", "")).strip(),
        "shortcode": str(getattr(settings, "MPESA_SHORTCODE", "")).strip(),
        "passkey": str(getattr(settings, "MPESA_PASSKEY", "")).strip(),
        "callback_url": str(getattr(settings, "MPESA_STK_CALLBACK_URL", "")).strip(),
    }
    mpesa_missing_fields = [name for name, value in mpesa_core_fields.items() if not value]

    super_admin_exists = User.objects.filter(
        role="admin",
        admin_level="super_admin",
        is_active=True,
    ).exists()
    active_staff_admins = User.objects.filter(role="admin", admin_level="staff", is_active=True).count()
    misconfigured_staff_assignments = (
        StaffAssignment.objects.filter(
            user__role="admin",
            user__admin_level="staff",
            user__is_active=True,
        )
        .filter(Q(role__isnull=True) | Q(is_active=False) | Q(role__is_active=False))
        .count()
    )
    unassigned_staff_admins = max(
        active_staff_admins - StaffAssignment.objects.filter(user__role="admin", user__admin_level="staff").count(),
        0,
    )
    total_staff_assignment_issues = misconfigured_staff_assignments + unassigned_staff_admins

    stale_pending_payments = MarketplacePayment.objects.filter(
        status="pending_confirmation",
        initiated_at__lt=stale_payment_cutoff,
    ).count()
    failed_payments_24h = MarketplacePayment.objects.filter(
        status="failed",
        initiated_at__gte=recent_day_cutoff,
    ).count()
    confirmed_payment_order_mismatch = MarketplacePayment.objects.filter(
        status="confirmed",
        order__is_paid=False,
    ).count()

    negative_stock_products = Product.objects.filter(stock__lt=0).count()
    orders_without_items = Order.objects.annotate(item_count=Count("items")).filter(item_count=0).count()
    paid_orders_missing_vendor_splits = (
        Order.objects.filter(is_paid=True)
        .annotate(
            vendor_count=Count("items__product__vendor", distinct=True),
            split_count=Count("vendor_orders", distinct=True),
        )
        .filter(vendor_count__gt=0, split_count__lt=F("vendor_count"))
        .count()
    )
    invalid_vendor_order_amounts = VendorOrder.objects.filter(
        Q(gross_amount__lt=0)
        | Q(platform_commission_amount__lt=0)
        | Q(vendor_earning_amount__lt=0)
        | Q(vendor_earning_amount__gt=F("gross_amount"))
        | Q(platform_commission_amount__gt=F("gross_amount"))
    ).count()

    stale_support_tickets = SupportTicket.objects.filter(
        status__in=[SupportTicketStatus.PENDING, SupportTicketStatus.IN_PROGRESS],
        updated_at__lt=stale_support_cutoff,
    ).count()
    knowledge_entries_count = KnowledgeBaseEntry.objects.filter(is_published=True).count()
    stale_payout_requests = VendorPayoutRequest.objects.filter(
        status__in=["requested", "under_review", "approved"],
        requested_at__lt=stale_payout_cutoff,
    ).count()
    vendor_wallets_count = VendorWallet.objects.count()
    active_vendors_count = User.objects.filter(role="vendor", vendor_profile__is_approved=True).count()
    wallets_missing_count = max(active_vendors_count - vendor_wallets_count, 0)

    paid_orders_count = Order.objects.filter(is_paid=True).count()
    receipts_for_paid_orders = (
        Receipt.objects.filter(order__is_paid=True, status="issued").values("order_id").distinct().count()
    )
    paid_orders_without_receipts = max(paid_orders_count - receipts_for_paid_orders, 0)
    chat_conversations_7d = ChatConversation.objects.filter(updated_at__gte=now - timedelta(days=7)).count()

    security_checks = [
        _readiness_check(
            key="security.debug_off",
            label="DEBUG must be disabled for live launch",
            status_value="fail" if debug_enabled else "pass",
            detail="DEBUG=True exposes detailed errors and stack traces to end users."
            if debug_enabled
            else "DEBUG is disabled.",
            metric=f"DEBUG={debug_enabled}",
            action="Set DEBUG=False in production environment settings.",
            fix_path="backend/core/settings.py",
        ),
        _readiness_check(
            key="security.secret_key_env",
            label="SECRET_KEY is loaded from environment",
            status_value="fail" if (is_production and not secret_key_from_env) else ("warning" if not secret_key_from_env else "pass"),
            detail="SECRET_KEY is not sourced from environment variables."
            if not secret_key_from_env
            else "SECRET_KEY is sourced from environment variables.",
            metric=f"SECRET_KEY_FROM_ENV={secret_key_from_env}",
            action="Set SECRET_KEY in environment variables and avoid hardcoded/default keys.",
            fix_path="backend/core/settings.py",
        ),
        _readiness_check(
            key="security.secret_key_strength",
            label="Strong production SECRET_KEY configured",
            status_value="fail" if weak_secret_key else "pass",
            detail="SECRET_KEY appears weak or development-style and should be rotated."
            if weak_secret_key
            else "SECRET_KEY strength check passed.",
            metric=f"Length: {len(secret_key)}",
            action="Use django.core.management.utils.get_random_secret_key() output as the SECRET_KEY value.",
            fix_path="backend/core/settings.py",
        ),
        _readiness_check(
            key="security.cors",
            label="CORS is restricted",
            status_value="fail" if cors_open else "pass",
            detail="CORS_ALLOW_ALL_ORIGINS=True should not be used in production."
            if cors_open
            else "CORS allow-list is enforced.",
            metric=f"CORS_ALLOW_ALL_ORIGINS={cors_open}",
            action="Use explicit frontend origins only.",
            fix_path="backend/core/settings.py",
        ),
        _readiness_check(
            key="security.cors_allowlist",
            label="CORS allowed origins are explicitly configured",
            status_value="fail" if (not cors_open and len(cors_allowed_origins) == 0) else ("warning" if (is_production and localhost_cors_origins) else "pass"),
            detail="No explicit origins are configured while CORS allow-all is disabled."
            if (not cors_open and len(cors_allowed_origins) == 0)
            else (
                "Localhost origins are still present in production CORS allow-list."
                if (is_production and localhost_cors_origins)
                else "CORS allowed origins are configured."
            ),
            metric=f"Origins: {len(cors_allowed_origins)}",
            action="Set CORS_ALLOWED_ORIGINS to deployed frontend domains only.",
            fix_path="backend/core/settings.py",
        ),
        _readiness_check(
            key="security.allowed_hosts_present",
            label="ALLOWED_HOSTS is not empty",
            status_value="fail" if allowed_hosts_empty else "pass",
            detail="ALLOWED_HOSTS is empty, so production host validation is unsafe."
            if allowed_hosts_empty
            else "ALLOWED_HOSTS contains explicit hostnames.",
            metric=f"Hosts: {len(allowed_hosts)}",
            action="Set ALLOWED_HOSTS to your API and site domains.",
            fix_path="backend/core/settings.py",
        ),
        _readiness_check(
            key="security.allowed_hosts_wildcard",
            label="ALLOWED_HOSTS has no wildcard",
            status_value="fail" if (is_production and wildcard_hosts) else ("warning" if wildcard_hosts else "pass"),
            detail="Wildcard host is enabled; lock this to your deployed domains."
            if wildcard_hosts
            else "ALLOWED_HOSTS appears restricted.",
            metric=f"Hosts: {', '.join(allowed_hosts)[:140]}",
            action="Replace '*' with explicit production domains.",
            fix_path="backend/core/settings.py",
        ),
        _readiness_check(
            key="security.ssl_redirect",
            label="HTTPS redirect is enforced in production",
            status_value="fail" if (is_production and not secure_ssl_redirect) else "pass",
            detail="SECURE_SSL_REDIRECT must be True in production."
            if (is_production and not secure_ssl_redirect)
            else "HTTPS redirect setting is aligned.",
            metric=f"SECURE_SSL_REDIRECT={secure_ssl_redirect}",
            action="Enable SECURE_SSL_REDIRECT=True for production.",
            fix_path="backend/core/settings.py",
        ),
        _readiness_check(
            key="security.session_cookie_secure",
            label="Session cookies are secure in production",
            status_value="fail" if (is_production and not session_cookie_secure) else "pass",
            detail="SESSION_COOKIE_SECURE must be True in production."
            if (is_production and not session_cookie_secure)
            else "Session cookie security setting is aligned.",
            metric=f"SESSION_COOKIE_SECURE={session_cookie_secure}",
            action="Enable SESSION_COOKIE_SECURE=True for production.",
            fix_path="backend/core/settings.py",
        ),
        _readiness_check(
            key="security.csrf_cookie_secure",
            label="CSRF cookies are secure in production",
            status_value="fail" if (is_production and not csrf_cookie_secure) else "pass",
            detail="CSRF_COOKIE_SECURE must be True in production."
            if (is_production and not csrf_cookie_secure)
            else "CSRF cookie security setting is aligned.",
            metric=f"CSRF_COOKIE_SECURE={csrf_cookie_secure}",
            action="Enable CSRF_COOKIE_SECURE=True for production.",
            fix_path="backend/core/settings.py",
        ),
    ]

    infrastructure_checks = [
        _readiness_check(
            key="infra.database_connection",
            label="Database connection is healthy",
            status_value="pass" if db_connection_ok else "fail",
            detail="Database responded successfully to a health query."
            if db_connection_ok
            else f"Database health query failed: {db_connection_error}",
            metric=f"Connected: {db_connection_ok}",
            action="Check database credentials/network and run migrations.",
            fix_path="backend/core/settings.py",
        ),
        _readiness_check(
            key="infra.static_files",
            label="Static files are configured for production",
            status_value="pass" if static_files_configured else "fail",
            detail="STATIC_URL and STATIC_ROOT are configured."
            if static_files_configured
            else "STATIC_URL or STATIC_ROOT is missing; collectstatic will fail.",
            metric=f"STATIC_ROOT set: {bool(static_root)}",
            action="Configure STATIC_ROOT and run collectstatic in deployment pipeline.",
            fix_path="backend/core/settings.py",
        ),
    ]

    access_checks = [
        _readiness_check(
            key="access.super_admin_exists",
            label="At least one active super admin exists",
            status_value="pass" if super_admin_exists else "fail",
            detail="No active super admin account found." if not super_admin_exists else "Super admin account is present.",
            action="Create or reactivate at least one super admin account.",
            fix_path="/admin/staff",
        ),
        _readiness_check(
            key="access.staff_assignment_hygiene",
            label="Staff RBAC assignments are healthy",
            status_value="pass" if total_staff_assignment_issues == 0 else "warning",
            detail=f"{total_staff_assignment_issues} staff accounts are unassigned or inactive in RBAC."
            if total_staff_assignment_issues
            else "All active staff accounts have active role assignments.",
            metric=f"Issues: {total_staff_assignment_issues}",
            action="Assign/repair staff roles and activate assignments.",
            fix_path="/admin/staff",
        ),
    ]

    payments_checks = [
        _readiness_check(
            key="payments.commission_rate",
            label="Marketplace commission rate is valid",
            status_value="pass" if commission_rate_valid else "fail",
            detail="Marketplace commission rate must be between 0.0 and 1.0."
            if not commission_rate_valid
            else "Marketplace commission rate is valid.",
            metric=f"Rate: {marketplace_commission_rate}",
            action="Set MARKETPLACE_COMMISSION_RATE to a value between 0 and 1.",
            fix_path="backend/core/settings.py",
        ),
        _readiness_check(
            key="payments.mpesa_environment",
            label="M-Pesa environment mode is valid",
            status_value="fail" if not mpesa_environment_valid else ("fail" if (is_production and not mpesa_live_mode) else "pass"),
            detail="MPESA_ENVIRONMENT must be sandbox, production, or live."
            if not mpesa_environment_valid
            else (
                "Production environment requires MPESA_ENVIRONMENT=production (or live)."
                if (is_production and not mpesa_live_mode)
                else "M-Pesa environment mode is valid."
            ),
            metric=f"MPESA_ENVIRONMENT={mpesa_environment}",
            action="Set MPESA_ENVIRONMENT=sandbox for testing or production/live for go-live.",
            fix_path="backend/core/settings.py",
        ),
        _readiness_check(
            key="payments.mpesa_live_flag",
            label="M-Pesa live flag matches environment mode",
            status_value="fail" if (mpesa_live_mode and not mpesa_live_enabled) else ("warning" if (not mpesa_live_mode and mpesa_live_enabled) else "pass"),
            detail="MPESA_ENABLE_LIVE is false while MPESA_ENVIRONMENT is production/live."
            if (mpesa_live_mode and not mpesa_live_enabled)
            else (
                "MPESA_ENABLE_LIVE is true while environment is sandbox."
                if (not mpesa_live_mode and mpesa_live_enabled)
                else "M-Pesa live toggle and environment mode are aligned."
            ),
            metric=f"MPESA_ENABLE_LIVE={mpesa_live_enabled}",
            action="Keep MPESA_ENABLE_LIVE consistent with MPESA_ENVIRONMENT.",
            fix_path="backend/core/settings.py",
        ),
        _readiness_check(
            key="payments.mpesa_credentials",
            label="M-Pesa credentials are configured for active mode",
            status_value="fail" if (mpesa_credentials_required and mpesa_missing_fields) else "pass",
            detail=(
                f"Missing M-Pesa fields: {', '.join(mpesa_missing_fields)}."
                if (mpesa_credentials_required and mpesa_missing_fields)
                else (
                    "M-Pesa credentials are optional in local sandbox mode and will be required for production/live mode."
                    if (not mpesa_credentials_required and mpesa_missing_fields)
                    else "Required M-Pesa fields are configured."
                )
            ),
            metric=f"Missing fields: {len(mpesa_missing_fields)}",
            action="Set missing MPESA_* credentials and callback URL in environment variables.",
            fix_path="backend/core/settings.py",
        ),
        _readiness_check(
            key="payments.stale_pending",
            label="No stale pending M-Pesa confirmations",
            status_value="warning" if stale_pending_payments else "pass",
            detail=f"{stale_pending_payments} payment(s) pending for over 15 minutes."
            if stale_pending_payments
            else "No stale pending payment confirmations detected.",
            metric=f"Stale pending: {stale_pending_payments}",
            action="Reconcile callbacks and investigate payment webhook reliability.",
            fix_path="/admin/finance",
        ),
        _readiness_check(
            key="payments.confirmed_order_sync",
            label="Confirmed payments are synced to paid orders",
            status_value="fail" if confirmed_payment_order_mismatch else "pass",
            detail=f"{confirmed_payment_order_mismatch} confirmed payment(s) have orders still marked unpaid."
            if confirmed_payment_order_mismatch
            else "Payment-to-order paid status sync is consistent.",
            metric=f"Mismatches: {confirmed_payment_order_mismatch}",
            action="Run reconciliation and backfill paid status for affected orders.",
            fix_path="/admin/finance",
        ),
        _readiness_check(
            key="payments.fail_rate_24h",
            label="Payment failures are within acceptable range",
            status_value="warning" if failed_payments_24h >= 10 else "pass",
            detail=f"{failed_payments_24h} failed payment attempts in the last 24 hours."
            if failed_payments_24h
            else "No failed payments in the last 24 hours.",
            metric=f"Failed 24h: {failed_payments_24h}",
            action="Review callback errors and customer payment flow retries.",
            fix_path="/admin/finance",
        ),
    ]

    commerce_checks = [
        _readiness_check(
            key="commerce.stock_non_negative",
            label="No products with negative stock",
            status_value="fail" if negative_stock_products else "pass",
            detail=f"{negative_stock_products} product(s) have negative stock values."
            if negative_stock_products
            else "Stock values are non-negative.",
            metric=f"Negative stock products: {negative_stock_products}",
            action="Correct stock values and add stock validation guardrails.",
            fix_path="/admin/products",
        ),
        _readiness_check(
            key="commerce.orders_have_items",
            label="Orders contain at least one item",
            status_value="fail" if orders_without_items else "pass",
            detail=f"{orders_without_items} order(s) have no order items."
            if orders_without_items
            else "All orders include at least one item.",
            metric=f"Orders without items: {orders_without_items}",
            action="Investigate checkout transaction boundaries and orphan order creation.",
            fix_path="/admin",
        ),
        _readiness_check(
            key="commerce.vendor_split_integrity",
            label="Paid orders have complete vendor splits",
            status_value="fail" if paid_orders_missing_vendor_splits else "pass",
            detail=f"{paid_orders_missing_vendor_splits} paid order(s) are missing vendor split records."
            if paid_orders_missing_vendor_splits
            else "Vendor split records are complete for paid orders.",
            metric=f"Missing splits: {paid_orders_missing_vendor_splits}",
            action="Rebuild vendor split records for affected paid orders.",
            fix_path="/admin/finance",
        ),
        _readiness_check(
            key="commerce.vendor_amount_integrity",
            label="Vendor split amounts are internally valid",
            status_value="fail" if invalid_vendor_order_amounts else "pass",
            detail=f"{invalid_vendor_order_amounts} vendor order split(s) have invalid amount relationships."
            if invalid_vendor_order_amounts
            else "Vendor split amount relationships are valid.",
            metric=f"Invalid splits: {invalid_vendor_order_amounts}",
            action="Correct commission/net/gross calculations for invalid vendor splits.",
            fix_path="/admin/finance",
        ),
    ]

    operations_checks = [
        _readiness_check(
            key="ops.support_backlog",
            label="Support backlog is under control",
            status_value="warning" if stale_support_tickets else "pass",
            detail=f"{stale_support_tickets} support ticket(s) are pending/in-progress for over 48 hours."
            if stale_support_tickets
            else "No stale support tickets older than 48 hours.",
            metric=f"Stale tickets: {stale_support_tickets}",
            action="Prioritize old tickets and enforce response SLAs.",
            fix_path="/admin/support",
        ),
        _readiness_check(
            key="ops.knowledge_base",
            label="Help Center has published content",
            status_value="pass" if knowledge_entries_count >= 8 else "warning",
            detail=f"Published knowledge entries: {knowledge_entries_count}.",
            metric=f"Entries: {knowledge_entries_count}",
            action="Publish more FAQ/guides before launch to reduce ticket volume.",
            fix_path="/admin/support",
        ),
        _readiness_check(
            key="ops.payout_backlog",
            label="Vendor payout queue is healthy",
            status_value="warning" if stale_payout_requests else "pass",
            detail=f"{stale_payout_requests} payout request(s) are older than 72 hours."
            if stale_payout_requests
            else "No stale vendor payout requests older than 72 hours.",
            metric=f"Stale payouts: {stale_payout_requests}",
            action="Resolve pending payouts and monitor payout automation logs.",
            fix_path="/admin/finance",
        ),
        _readiness_check(
            key="ops.wallet_coverage",
            label="Approved vendors have wallet records",
            status_value="warning" if wallets_missing_count else "pass",
            detail=f"{wallets_missing_count} approved vendor(s) have no wallet record."
            if wallets_missing_count
            else "Wallet coverage is complete for approved vendors.",
            metric=f"Wallet gaps: {wallets_missing_count}",
            action="Backfill vendor wallets and verify finance onboarding hooks.",
            fix_path="/admin/finance",
        ),
        _readiness_check(
            key="ops.receipts_coverage",
            label="Paid orders have receipt records",
            status_value="warning" if paid_orders_without_receipts else "pass",
            detail=f"{paid_orders_without_receipts} paid order(s) have no linked receipt record."
            if paid_orders_without_receipts
            else "All paid orders have at least one receipt record.",
            metric=f"Paid orders without receipts: {paid_orders_without_receipts}",
            action="Generate missing receipts for historical paid orders.",
            fix_path="/admin/receipts",
        ),
        _readiness_check(
            key="ops.chatbot_activity",
            label="Chatbot interaction activity in last 7 days",
            status_value="pass" if chat_conversations_7d > 0 else "warning",
            detail=f"{chat_conversations_7d} conversation(s) recorded in the last 7 days.",
            metric=f"Conversations (7d): {chat_conversations_7d}",
            action="Run chatbot smoke tests and verify conversation logging.",
            fix_path="/admin",
        ),
    ]

    sections = [
        {
            "key": "security",
            "title": "Security & Environment",
            "description": "Runtime hardening checks for production launch safety.",
            "checks": security_checks,
        },
        {
            "key": "infrastructure",
            "title": "Infrastructure Readiness",
            "description": "Database and static asset runtime checks.",
            "checks": infrastructure_checks,
        },
        {
            "key": "access",
            "title": "Access Control & Governance",
            "description": "Admin hierarchy and role assignment health.",
            "checks": access_checks,
        },
        {
            "key": "payments",
            "title": "Payments & Reconciliation",
            "description": "Payment callback integrity and confirmation reliability.",
            "checks": payments_checks,
        },
        {
            "key": "commerce",
            "title": "Commerce Integrity",
            "description": "Catalog, order, and vendor split correctness checks.",
            "checks": commerce_checks,
        },
        {
            "key": "operations",
            "title": "Operations Readiness",
            "description": "Support, payouts, receipts, and assistant activity health.",
            "checks": operations_checks,
        },
    ]

    all_checks = [check for section in sections for check in section["checks"]]
    pass_count = sum(1 for check in all_checks if check["status"] == "pass")
    warning_count = sum(1 for check in all_checks if check["status"] == "warning")
    fail_count = sum(1 for check in all_checks if check["status"] == "fail")
    total_checks = len(all_checks)
    readiness_score = round((pass_count / total_checks) * 100, 1) if total_checks else 0.0

    blockers = [check for check in all_checks if check["status"] == "fail"]
    top_blockers = blockers[:5]

    return Response(
        {
            "generated_at": now.isoformat(),
            "summary": {
                "total_checks": total_checks,
                "pass_count": pass_count,
                "warning_count": warning_count,
                "fail_count": fail_count,
                "readiness_score": readiness_score,
                "is_launch_blocked": fail_count > 0,
            },
            "environment": {
                "environment": environment_name,
                "is_production": is_production,
                "debug": debug_enabled,
                "payout_mode": str(getattr(settings, "MARKETPLACE_PAYOUT_MODE", "automatic")).lower(),
                "mpesa_live_enabled": mpesa_live_enabled,
                "mpesa_environment": mpesa_environment,
            },
            "sections": sections,
            "top_blockers": top_blockers,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_staff_roles(request):
    ensure_default_staff_roles()

    if request.method == "GET":
        if not has_admin_permission(request.user, "staff.view"):
            return Response({"detail": "Missing permission: staff.view"}, status=status.HTTP_403_FORBIDDEN)

        queryset = StaffRole.objects.all().order_by("name")
        serializer = StaffRoleSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    if not is_super_admin(request.user):
        return Response({"detail": "Only the super admin can create staff roles."}, status=status.HTTP_403_FORBIDDEN)

    serializer = StaffRoleSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    role = serializer.save()
    log_admin_activity(
        actor=request.user,
        action="staff_role.create",
        description=f"Created staff role {role.name}.",
        target_type="StaffRole",
        target_id=str(role.id),
        metadata={"slug": role.slug, "permissions": role.permissions},
    )
    return Response(StaffRoleSerializer(role).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_staff_role_detail(request, role_id: int):
    if not is_super_admin(request.user):
        return Response({"detail": "Only the super admin can modify staff roles."}, status=status.HTTP_403_FORBIDDEN)

    try:
        role = StaffRole.objects.get(id=role_id)
    except StaffRole.DoesNotExist:
        return Response({"detail": "Staff role not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        role_name = role.name
        role.delete()
        log_admin_activity(
            actor=request.user,
            action="staff_role.delete",
            description=f"Deleted staff role {role_name}.",
            target_type="StaffRole",
            target_id=str(role_id),
            metadata={},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = StaffRoleSerializer(role, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    updated = serializer.save()
    log_admin_activity(
        actor=request.user,
        action="staff_role.update",
        description=f"Updated staff role {updated.name}.",
        target_type="StaffRole",
        target_id=str(updated.id),
        metadata={"permissions": updated.permissions, "is_active": updated.is_active},
    )
    return Response(StaffRoleSerializer(updated).data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_staff_accounts(request):
    if request.method == "GET":
        if not has_admin_permission(request.user, "staff.view"):
            return Response({"detail": "Missing permission: staff.view"}, status=status.HTTP_403_FORBIDDEN)

        query = request.query_params.get("q", "").strip()
        admin_level = request.query_params.get("admin_level", "").strip()
        role_id = request.query_params.get("role_id", "").strip()
        active = request.query_params.get("active", "").strip().lower()

        queryset = User.objects.filter(role="admin").select_related("staff_assignment", "staff_assignment__role")
        if admin_level in {"super_admin", "staff"}:
            queryset = queryset.filter(admin_level=admin_level)
        if active in {"true", "false"}:
            queryset = queryset.filter(is_active=(active == "true"))
        if role_id.isdigit():
            queryset = queryset.filter(staff_assignment__role_id=int(role_id))
        if query:
            queryset = queryset.filter(
                Q(email__icontains=query)
                | Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
                | Q(phone_number__icontains=query)
                | Q(customer_id__icontains=query)
            )

        serializer = StaffAccountSerializer(queryset.order_by("-date_joined"), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    if not is_super_admin(request.user):
        return Response({"detail": "Only the super admin can create staff accounts."}, status=status.HTTP_403_FORBIDDEN)

    serializer = StaffAccountCreateSerializer(data=request.data, context={"acting_user": request.user})
    serializer.is_valid(raise_exception=True)
    created_user = serializer.save()
    log_admin_activity(
        actor=request.user,
        action="staff_account.create",
        description=f"Created staff account for {created_user.email}.",
        target_type="CustomUser",
        target_id=str(created_user.id),
        metadata={"admin_level": created_user.admin_level},
    )
    return Response(StaffAccountSerializer(created_user).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_staff_account_detail(request, user_id: int):
    if not is_super_admin(request.user):
        return Response({"detail": "Only the super admin can update staff accounts."}, status=status.HTTP_403_FORBIDDEN)

    try:
        target_user = User.objects.select_related("staff_assignment", "staff_assignment__role").get(id=user_id, role="admin")
    except User.DoesNotExist:
        return Response({"detail": "Staff account not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.user.id == target_user.id:
        requested_active = request.data.get("is_active")
        requested_level = request.data.get("admin_level")
        if requested_active is False or requested_active == "false":
            return Response({"detail": "You cannot deactivate your own account."}, status=status.HTTP_400_BAD_REQUEST)
        if requested_level == "staff":
            return Response(
                {"detail": "You cannot demote your own super admin account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    serializer = StaffAccountUpdateSerializer(
        target_user,
        data=request.data,
        partial=True,
        context={"acting_user": request.user, "user_obj": target_user},
    )
    serializer.is_valid(raise_exception=True)
    updated_user = serializer.save()
    log_admin_activity(
        actor=request.user,
        action="staff_account.update",
        description=f"Updated staff account {updated_user.email}.",
        target_type="CustomUser",
        target_id=str(updated_user.id),
        metadata={
            "admin_level": updated_user.admin_level,
            "is_active": updated_user.is_active,
        },
    )
    return Response(StaffAccountSerializer(updated_user).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_activity_logs(request):
    if not has_admin_permission(request.user, "staff.view"):
        return Response({"detail": "Missing permission: staff.view"}, status=status.HTTP_403_FORBIDDEN)

    queryset = AdminActivityLog.objects.select_related("actor").all()
    query = request.query_params.get("q", "").strip()
    action = request.query_params.get("action", "").strip()
    actor_id = request.query_params.get("actor_id", "").strip()
    target_type = request.query_params.get("target_type", "").strip()
    limit_raw = request.query_params.get("limit", "200").strip()

    if query:
        queryset = queryset.filter(
            Q(description__icontains=query)
            | Q(action__icontains=query)
            | Q(actor__email__icontains=query)
            | Q(target_type__icontains=query)
            | Q(target_id__icontains=query)
        )
    if action:
        queryset = queryset.filter(action__icontains=action)
    if actor_id.isdigit():
        queryset = queryset.filter(actor_id=int(actor_id))
    if target_type:
        queryset = queryset.filter(target_type__icontains=target_type)

    limit = 200
    if limit_raw.isdigit():
        limit = min(int(limit_raw), 500)

    serializer = AdminActivityLogSerializer(queryset.order_by("-created_at")[:limit], many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)

