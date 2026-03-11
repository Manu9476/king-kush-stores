from django.db.models import Case, Q, Sum, Value, When
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from users.permissions import IsMarketplaceAdmin, has_admin_permission
from users.rbac import log_admin_activity

from .models import (
    AdvertisingCampaign,
    AdvertisingCampaignSource,
    AdvertisingCampaignStatus,
    AdvertisingPlacement,
    AdvertisingRequest,
    AdvertisingRequestStatus,
)
from .serializers import (
    AdvertisingCampaignSerializer,
    AdvertisingEventCreateSerializer,
    AdvertisingPlacementSerializer,
    AdvertisingPublicCampaignSerializer,
    AdvertisingRequestAdminSerializer,
    AdvertisingRequestCreateSerializer,
    AdvertisingRequestReviewSerializer,
)


def _live_campaign_queryset():
    now = timezone.now()
    return AdvertisingCampaign.objects.select_related("placement").filter(
        is_visible=True,
        placement__is_active=True,
    ).exclude(
        status__in=[
            AdvertisingCampaignStatus.DRAFT,
            AdvertisingCampaignStatus.REJECTED,
            AdvertisingCampaignStatus.PAUSED,
            AdvertisingCampaignStatus.COMPLETED,
            AdvertisingCampaignStatus.EXPIRED,
        ]
    ).filter(
        Q(start_at__isnull=True) | Q(start_at__lte=now),
        Q(end_at__isnull=True) | Q(end_at__gte=now),
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def public_advertising_data(request):
    placement_key = request.query_params.get("placement", "").strip()
    category = request.query_params.get("category", "").strip()
    limit_raw = request.query_params.get("limit", "").strip()

    queryset = _live_campaign_queryset()
    if placement_key:
        queryset = queryset.filter(placement__key=placement_key)
    if category:
        queryset = queryset.filter(
            Q(category_context__iexact=category)
            | Q(category_context__icontains=category)
            | Q(category_context="")
        )

    queryset = queryset.annotate(
        source_priority=Case(
            When(source_type=AdvertisingCampaignSource.INTERNAL, then=Value(0)),
            When(source_type=AdvertisingCampaignSource.VENDOR, then=Value(1)),
            default=Value(2),
        )
    ).order_by("source_priority", "-priority", "-updated_at")

    if limit_raw.isdigit():
        limit = max(1, min(int(limit_raw), 12))
    elif placement_key:
        placement = AdvertisingPlacement.objects.filter(key=placement_key, is_active=True).first()
        limit = placement.max_ads_per_page if placement else 1
    else:
        limit = 8

    campaigns = list(queryset[:limit])
    serializer = AdvertisingPublicCampaignSerializer(campaigns, many=True, context={"request": request})
    placements = AdvertisingPlacement.objects.filter(is_active=True).order_by("name")
    placement_serializer = AdvertisingPlacementSerializer(placements, many=True)

    return Response(
        {
            "placements": placement_serializer.data,
            "campaigns": serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def submit_advertising_request(request):
    serializer = AdvertisingRequestCreateSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    ad_request = serializer.save()
    return Response(
        {
            "id": ad_request.id,
            "status": ad_request.status,
            "detail": "Advertising request submitted successfully. Our team will review and contact you.",
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def record_advertising_event(request):
    serializer = AdvertisingEventCreateSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    event = serializer.save()
    return Response(
        {
            "id": event.id,
            "detail": "Event recorded.",
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "POST"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([IsMarketplaceAdmin])
def admin_advertising_placements(request):
    if request.method == "GET":
        if not (
            has_admin_permission(request.user, "advertising.view")
            or has_admin_permission(request.user, "content.manage")
        ):
            return Response(
                {"detail": "Missing permission: advertising.view or content.manage"},
                status=status.HTTP_403_FORBIDDEN,
            )
        placements = AdvertisingPlacement.objects.all().order_by("name")
        return Response(AdvertisingPlacementSerializer(placements, many=True).data, status=status.HTTP_200_OK)

    if not (
        has_admin_permission(request.user, "advertising.manage")
        or has_admin_permission(request.user, "content.manage")
    ):
        return Response(
            {"detail": "Missing permission: advertising.manage or content.manage"},
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer = AdvertisingPlacementSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    created = serializer.save()
    log_admin_activity(
        actor=request.user,
        action="advertising.placement.create",
        description=f"Created ad placement '{created.name}'.",
        target_type="AdvertisingPlacement",
        target_id=str(created.id),
        metadata={"key": created.key},
    )
    return Response(AdvertisingPlacementSerializer(created).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsMarketplaceAdmin])
def admin_advertising_placement_detail(request, placement_id: int):
    if not (
        has_admin_permission(request.user, "advertising.manage")
        or has_admin_permission(request.user, "content.manage")
    ):
        return Response(
            {"detail": "Missing permission: advertising.manage or content.manage"},
            status=status.HTTP_403_FORBIDDEN,
        )
    try:
        placement = AdvertisingPlacement.objects.get(id=placement_id)
    except AdvertisingPlacement.DoesNotExist:
        return Response({"detail": "Ad placement not found."}, status=status.HTTP_404_NOT_FOUND)

    serializer = AdvertisingPlacementSerializer(placement, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    updated = serializer.save()
    log_admin_activity(
        actor=request.user,
        action="advertising.placement.update",
        description=f"Updated ad placement '{updated.name}'.",
        target_type="AdvertisingPlacement",
        target_id=str(updated.id),
        metadata={"is_active": updated.is_active, "max_ads_per_page": updated.max_ads_per_page},
    )
    return Response(AdvertisingPlacementSerializer(updated).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsMarketplaceAdmin])
def admin_advertising_requests(request):
    if not has_admin_permission(request.user, "advertising.view"):
        return Response({"detail": "Missing permission: advertising.view"}, status=status.HTTP_403_FORBIDDEN)

    status_filter = request.query_params.get("status", "").strip()
    query = request.query_params.get("q", "").strip()

    queryset = AdvertisingRequest.objects.select_related("preferred_placement", "requester", "reviewed_by")
    if status_filter:
        queryset = queryset.filter(status=status_filter)
    if query:
        queryset = queryset.filter(
            Q(full_name__icontains=query)
            | Q(company_name__icontains=query)
            | Q(email__icontains=query)
            | Q(phone_number__icontains=query)
            | Q(ad_objective__icontains=query)
            | Q(message__icontains=query)
        )

    serializer = AdvertisingRequestAdminSerializer(queryset.order_by("-created_at"), many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["PATCH"])
@permission_classes([IsMarketplaceAdmin])
def admin_advertising_request_detail(request, request_id: int):
    if not has_admin_permission(request.user, "advertising.approve"):
        return Response({"detail": "Missing permission: advertising.approve"}, status=status.HTTP_403_FORBIDDEN)

    try:
        ad_request = AdvertisingRequest.objects.get(id=request_id)
    except AdvertisingRequest.DoesNotExist:
        return Response({"detail": "Ad request not found."}, status=status.HTTP_404_NOT_FOUND)

    serializer = AdvertisingRequestReviewSerializer(ad_request, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    updated = serializer.save(reviewed_by=request.user, reviewed_at=timezone.now())

    log_admin_activity(
        actor=request.user,
        action="advertising.request.review",
        description=f"Reviewed advertising request #{updated.id} -> {updated.status}.",
        target_type="AdvertisingRequest",
        target_id=str(updated.id),
        metadata={"status": updated.status},
    )
    return Response(AdvertisingRequestAdminSerializer(updated).data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([IsMarketplaceAdmin])
def admin_advertising_campaigns(request):
    if request.method == "GET":
        if not has_admin_permission(request.user, "advertising.view"):
            return Response({"detail": "Missing permission: advertising.view"}, status=status.HTTP_403_FORBIDDEN)

        status_filter = request.query_params.get("status", "").strip()
        placement_key = request.query_params.get("placement", "").strip()
        source_type = request.query_params.get("source_type", "").strip()
        purpose = request.query_params.get("purpose", "").strip()
        query = request.query_params.get("q", "").strip()

        queryset = AdvertisingCampaign.objects.select_related("placement", "owner", "approved_by")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if placement_key:
            queryset = queryset.filter(placement__key=placement_key)
        if source_type:
            queryset = queryset.filter(source_type=source_type)
        if purpose:
            queryset = queryset.filter(purpose=purpose)
        if query:
            queryset = queryset.filter(
                Q(title__icontains=query)
                | Q(subtitle__icontains=query)
                | Q(description__icontains=query)
                | Q(category_context__icontains=query)
            )
        serializer = AdvertisingCampaignSerializer(queryset.order_by("-priority", "-updated_at"), many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    if not has_admin_permission(request.user, "advertising.manage"):
        return Response({"detail": "Missing permission: advertising.manage"}, status=status.HTTP_403_FORBIDDEN)

    serializer = AdvertisingCampaignSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    created = serializer.save(created_by=request.user)
    if created.status in {AdvertisingCampaignStatus.ACTIVE, AdvertisingCampaignStatus.SCHEDULED}:
        created.approved_by = request.user
        created.approved_at = timezone.now()
        created.save(update_fields=["approved_by", "approved_at", "updated_at"])

    log_admin_activity(
        actor=request.user,
        action="advertising.campaign.create",
        description=f"Created advertising campaign '{created.title}'.",
        target_type="AdvertisingCampaign",
        target_id=str(created.id),
        metadata={"status": created.status, "placement": created.placement.key},
    )
    return Response(AdvertisingCampaignSerializer(created, context={"request": request}).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([IsMarketplaceAdmin])
def admin_advertising_campaign_detail(request, campaign_id: int):
    if not has_admin_permission(request.user, "advertising.manage"):
        return Response({"detail": "Missing permission: advertising.manage"}, status=status.HTTP_403_FORBIDDEN)

    try:
        campaign = AdvertisingCampaign.objects.get(id=campaign_id)
    except AdvertisingCampaign.DoesNotExist:
        return Response({"detail": "Campaign not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        campaign_title = campaign.title
        campaign.delete()
        log_admin_activity(
            actor=request.user,
            action="advertising.campaign.delete",
            description=f"Deleted advertising campaign '{campaign_title}'.",
            target_type="AdvertisingCampaign",
            target_id=str(campaign_id),
            metadata={},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = AdvertisingCampaignSerializer(campaign, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    updated = serializer.save()

    if updated.status in {AdvertisingCampaignStatus.ACTIVE, AdvertisingCampaignStatus.SCHEDULED}:
        updated.approved_by = request.user
        updated.approved_at = timezone.now()
        updated.save(update_fields=["approved_by", "approved_at", "updated_at"])

    log_admin_activity(
        actor=request.user,
        action="advertising.campaign.update",
        description=f"Updated advertising campaign '{updated.title}'.",
        target_type="AdvertisingCampaign",
        target_id=str(updated.id),
        metadata={"status": updated.status, "priority": updated.priority, "is_visible": updated.is_visible},
    )
    return Response(AdvertisingCampaignSerializer(updated, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsMarketplaceAdmin])
def admin_advertising_analytics(request):
    if not has_admin_permission(request.user, "advertising.view"):
        return Response({"detail": "Missing permission: advertising.view"}, status=status.HTTP_403_FORBIDDEN)

    campaigns = AdvertisingCampaign.objects.select_related("placement")
    totals = campaigns.aggregate(total_impressions=Sum("impression_count"), total_clicks=Sum("click_count"))
    total_impressions = int(totals.get("total_impressions") or 0)
    total_clicks = int(totals.get("total_clicks") or 0)
    ctr = round((total_clicks / total_impressions) * 100, 2) if total_impressions else 0.0

    # Aggregate impression/click totals per placement.
    placement_totals = {}
    for campaign in campaigns:
        key = campaign.placement.key
        if key not in placement_totals:
            placement_totals[key] = {
                "placement_key": key,
                "placement_name": campaign.placement.name,
                "campaigns_count": 0,
                "impressions": 0,
                "clicks": 0,
            }
        placement_totals[key]["campaigns_count"] += 1
        placement_totals[key]["impressions"] += int(campaign.impression_count or 0)
        placement_totals[key]["clicks"] += int(campaign.click_count or 0)

    placement_performance = []
    for row in placement_totals.values():
        local_ctr = round((row["clicks"] / row["impressions"]) * 100, 2) if row["impressions"] else 0.0
        placement_performance.append({**row, "ctr": local_ctr})
    placement_performance.sort(key=lambda item: item["impressions"], reverse=True)

    # Aggregate impression/click totals per campaign purpose.
    purpose_totals = {}
    for campaign in campaigns:
        key = campaign.purpose
        if key not in purpose_totals:
            purpose_totals[key] = {
                "purpose_key": key,
                "campaigns_count": 0,
                "impressions": 0,
                "clicks": 0,
            }
        purpose_totals[key]["campaigns_count"] += 1
        purpose_totals[key]["impressions"] += int(campaign.impression_count or 0)
        purpose_totals[key]["clicks"] += int(campaign.click_count or 0)

    purpose_performance = []
    for row in purpose_totals.values():
        local_ctr = round((row["clicks"] / row["impressions"]) * 100, 2) if row["impressions"] else 0.0
        purpose_performance.append({**row, "ctr": local_ctr})
    purpose_performance.sort(key=lambda item: item["impressions"], reverse=True)

    top_campaigns = campaigns.order_by("-impression_count", "-click_count", "-updated_at")[:10]
    top_serializer = AdvertisingCampaignSerializer(top_campaigns, many=True, context={"request": request})

    active_count = campaigns.filter(
        status__in=[AdvertisingCampaignStatus.ACTIVE, AdvertisingCampaignStatus.SCHEDULED],
        is_visible=True,
    ).count()
    pending_requests = AdvertisingRequest.objects.filter(status=AdvertisingRequestStatus.PENDING_REVIEW).count()

    return Response(
        {
            "totals": {
                "campaigns_total": campaigns.count(),
                "campaigns_active": active_count,
                "pending_requests": pending_requests,
                "impressions": total_impressions,
                "clicks": total_clicks,
                "ctr": ctr,
            },
            "placement_performance": placement_performance,
            "purpose_performance": purpose_performance,
            "top_campaigns": top_serializer.data,
        },
        status=status.HTTP_200_OK,
    )

# Create your views here.
