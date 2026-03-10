from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from orders.models import Order
from users.permissions import IsMarketplaceAdmin, has_admin_permission, is_super_admin
from users.rbac import log_admin_activity

from .models import PickupOrderOperation, PickupStation, PickupStationAssignment
from .serializers import (
    PickupOrderOperationSerializer,
    PickupOrderSummarySerializer,
    PickupStationAssignmentSerializer,
    PickupStationSerializer,
)


def _station_scope(user):
    if is_super_admin(user) or has_admin_permission(user, "pickup.manage"):
        return {
            "unrestricted": True,
            "station_ids": list(PickupStation.objects.values_list("id", flat=True)),
        }

    if user and user.is_authenticated and user.role == "vendor":
        vendor_profile = getattr(user, "vendor_profile", None)
        if vendor_profile and vendor_profile.is_approved:
            station_ids = list(
                PickupStation.objects.filter(ownership_type="vendor", vendor_profile=vendor_profile).values_list("id", flat=True)
            )
            return {
                "unrestricted": False,
                "station_ids": station_ids,
            }

    assignments = PickupStationAssignment.objects.filter(user=user, is_active=True, station__is_active=True)
    station_ids = list(assignments.values_list("station_id", flat=True))
    return {
        "unrestricted": False,
        "station_ids": station_ids,
    }


def _can_operate_stations(user) -> bool:
    vendor_profile = getattr(user, "vendor_profile", None) if user and user.is_authenticated else None
    return bool(
        is_super_admin(user)
        or has_admin_permission(user, "pickup.manage")
        or has_admin_permission(user, "pickup.operations")
        or (user and user.is_authenticated and user.role == "vendor" and vendor_profile and vendor_profile.is_approved)
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def public_pickup_stations(request):
    query = str(request.query_params.get("q", "")).strip()
    city = str(request.query_params.get("city", "")).strip()

    queryset = PickupStation.objects.filter(
        is_active=True,
        supports_pickup=True,
        is_visible_to_customers=True,
        approval_status="approved",
    )
    if city:
        queryset = queryset.filter(city__icontains=city)
    if query:
        queryset = queryset.filter(
            Q(name__icontains=query)
            | Q(city__icontains=query)
            | Q(address__icontains=query)
            | Q(services__icontains=query)
        )

    serializer = PickupStationSerializer(queryset.order_by("city", "name"), many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_pickup_stations(request):
    can_view = has_admin_permission(request.user, "pickup.view") or has_admin_permission(request.user, "pickup.manage")
    if request.method == "GET":
        if not can_view:
            return Response({"detail": "Missing permission: pickup.view"}, status=status.HTTP_403_FORBIDDEN)

        query = str(request.query_params.get("q", "")).strip()
        city = str(request.query_params.get("city", "")).strip()
        active = str(request.query_params.get("active", "")).strip().lower()
        ownership_type = str(request.query_params.get("ownership_type", "")).strip().lower()
        vendor_profile_id = str(request.query_params.get("vendor_profile_id", "")).strip()
        queryset = PickupStation.objects.all()
        if city:
            queryset = queryset.filter(city__icontains=city)
        if active in {"true", "false"}:
            queryset = queryset.filter(is_active=(active == "true"))
        if ownership_type in {"platform", "vendor"}:
            queryset = queryset.filter(ownership_type=ownership_type)
        if vendor_profile_id.isdigit():
            queryset = queryset.filter(vendor_profile_id=int(vendor_profile_id))
        if query:
            queryset = queryset.filter(
                Q(name__icontains=query)
                | Q(city__icontains=query)
                | Q(address__icontains=query)
                | Q(services__icontains=query)
                | Q(vendor_profile__store_name__icontains=query)
                | Q(vendor_profile__user__email__icontains=query)
            )
        return Response(PickupStationSerializer(queryset.order_by("city", "name"), many=True).data, status=status.HTTP_200_OK)

    if not has_admin_permission(request.user, "pickup.manage"):
        return Response({"detail": "Missing permission: pickup.manage"}, status=status.HTTP_403_FORBIDDEN)

    serializer = PickupStationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    station = serializer.save(created_by=request.user, updated_by=request.user)
    log_admin_activity(
        actor=request.user,
        action="pickup.station.create",
        description=f"Created pickup station {station.name} ({station.city}).",
        target_type="PickupStation",
        target_id=str(station.id),
        metadata={"city": station.city, "is_active": station.is_active},
    )
    from receipts.services import issue_receipt_safe

    issue_receipt_safe(
        category="admin",
        receipt_type="admin_adjustment",
        owner_type="admin",
        owner_user=request.user,
        actor=request.user,
        station=station,
        related_entity_type="pickup_station",
        related_entity_id=str(station.id),
        related_reference=f"{station.name}-{station.city}",
        summary={
            "action": "create_station",
            "ownership_type": station.ownership_type,
            "approval_status": station.approval_status,
            "is_active": station.is_active,
            "is_visible_to_customers": station.is_visible_to_customers,
        },
        event_key=f"pickup_station_create:{station.id}",
    )
    return Response(PickupStationSerializer(station).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_pickup_station_detail(request, station_id: int):
    if not has_admin_permission(request.user, "pickup.manage"):
        return Response({"detail": "Missing permission: pickup.manage"}, status=status.HTTP_403_FORBIDDEN)

    try:
        station = PickupStation.objects.get(id=station_id)
    except PickupStation.DoesNotExist:
        return Response({"detail": "Pickup station not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        station_name = station.name
        station_id_value = station.id
        station_city = station.city
        station.delete()
        log_admin_activity(
            actor=request.user,
            action="pickup.station.delete",
            description=f"Deleted pickup station {station_name}.",
            target_type="PickupStation",
            target_id=str(station_id),
            metadata={},
        )
        from receipts.services import issue_receipt_safe

        issue_receipt_safe(
            category="admin",
            receipt_type="admin_adjustment",
            owner_type="admin",
            owner_user=request.user,
            actor=request.user,
            related_entity_type="pickup_station",
            related_entity_id=str(station_id_value),
            related_reference=f"{station_name}-{station_city}",
            summary={"action": "delete_station"},
            event_key=f"pickup_station_delete:{station_id_value}",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    payload = request.data.copy()
    if "temporary_notice" in payload:
        payload["notice_updated_at"] = timezone.now()

    serializer = PickupStationSerializer(station, data=payload, partial=True)
    serializer.is_valid(raise_exception=True)
    updated_station = serializer.save(updated_by=request.user, notice_updated_at=timezone.now() if "temporary_notice" in payload else station.notice_updated_at)
    log_admin_activity(
        actor=request.user,
        action="pickup.station.update",
        description=f"Updated pickup station {updated_station.name}.",
        target_type="PickupStation",
        target_id=str(updated_station.id),
        metadata={"is_active": updated_station.is_active},
    )
    from receipts.services import issue_receipt_safe

    issue_receipt_safe(
        category="admin",
        receipt_type="admin_override",
        owner_type="admin",
        owner_user=request.user,
        actor=request.user,
        station=updated_station,
        related_entity_type="pickup_station_update",
        related_entity_id=str(updated_station.id),
        related_reference=f"{updated_station.name}-{updated_station.city}",
        summary={
            "action": "update_station",
            "is_active": updated_station.is_active,
            "supports_pickup": updated_station.supports_pickup,
            "supports_returns": updated_station.supports_returns,
            "temporary_notice": updated_station.temporary_notice or "",
        },
        event_key=f"pickup_station_update:{updated_station.id}:{updated_station.updated_at.isoformat()}",
    )
    return Response(PickupStationSerializer(updated_station).data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_pickup_assignments(request):
    if request.method == "GET":
        if not (
            has_admin_permission(request.user, "pickup.view")
            or has_admin_permission(request.user, "pickup.assign")
            or has_admin_permission(request.user, "pickup.manage")
        ):
            return Response({"detail": "Missing permission: pickup.view"}, status=status.HTTP_403_FORBIDDEN)

        queryset = PickupStationAssignment.objects.select_related("station", "user", "assigned_by").all()
        station_id = str(request.query_params.get("station_id", "")).strip()
        active = str(request.query_params.get("active", "")).strip().lower()
        if station_id.isdigit():
            queryset = queryset.filter(station_id=int(station_id))
        if active in {"true", "false"}:
            queryset = queryset.filter(is_active=(active == "true"))
        return Response(PickupStationAssignmentSerializer(queryset, many=True).data, status=status.HTTP_200_OK)

    if not (
        has_admin_permission(request.user, "pickup.assign")
        or has_admin_permission(request.user, "pickup.manage")
    ):
        return Response({"detail": "Missing permission: pickup.assign"}, status=status.HTTP_403_FORBIDDEN)

    serializer = PickupStationAssignmentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    assignment = serializer.save(assigned_by=request.user)
    log_admin_activity(
        actor=request.user,
        action="pickup.assignment.create",
        description=f"Assigned {assignment.user.email} to {assignment.station.name}.",
        target_type="PickupStationAssignment",
        target_id=str(assignment.id),
        metadata={"role": assignment.role, "is_active": assignment.is_active},
    )
    from receipts.services import issue_receipt_safe

    issue_receipt_safe(
        category="admin",
        receipt_type="admin_assignment",
        owner_type="admin",
        owner_user=request.user,
        actor=request.user,
        station=assignment.station,
        related_entity_type="station_assignment",
        related_entity_id=str(assignment.id),
        related_reference=f"{assignment.station.name}:{assignment.user.email}",
        summary={
            "action": "create_assignment",
            "assigned_user": assignment.user.email,
            "role": assignment.role,
            "is_active": assignment.is_active,
        },
        event_key=f"pickup_assignment_create:{assignment.id}",
    )
    return Response(PickupStationAssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_pickup_assignment_detail(request, assignment_id: int):
    if not (
        has_admin_permission(request.user, "pickup.assign")
        or has_admin_permission(request.user, "pickup.manage")
    ):
        return Response({"detail": "Missing permission: pickup.assign"}, status=status.HTTP_403_FORBIDDEN)

    try:
        assignment = PickupStationAssignment.objects.select_related("station", "user").get(id=assignment_id)
    except PickupStationAssignment.DoesNotExist:
        return Response({"detail": "Assignment not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        assignment_id_value = assignment.id
        station_ref = assignment.station.name if assignment.station_id else ""
        user_ref = assignment.user.email if assignment.user_id else ""
        assignment.delete()
        log_admin_activity(
            actor=request.user,
            action="pickup.assignment.delete",
            description=f"Removed station assignment #{assignment_id}.",
            target_type="PickupStationAssignment",
            target_id=str(assignment_id),
            metadata={},
        )
        from receipts.services import issue_receipt_safe

        issue_receipt_safe(
            category="admin",
            receipt_type="admin_assignment",
            owner_type="admin",
            owner_user=request.user,
            actor=request.user,
            related_entity_type="station_assignment",
            related_entity_id=str(assignment_id_value),
            related_reference=f"{station_ref}:{user_ref}",
            summary={"action": "delete_assignment"},
            event_key=f"pickup_assignment_delete:{assignment_id_value}",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = PickupStationAssignmentSerializer(assignment, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    updated = serializer.save(assigned_by=request.user)
    log_admin_activity(
        actor=request.user,
        action="pickup.assignment.update",
        description=f"Updated station assignment for {updated.user.email}.",
        target_type="PickupStationAssignment",
        target_id=str(updated.id),
        metadata={"role": updated.role, "is_active": updated.is_active},
    )
    from receipts.services import issue_receipt_safe

    issue_receipt_safe(
        category="admin",
        receipt_type="admin_assignment",
        owner_type="admin",
        owner_user=request.user,
        actor=request.user,
        station=updated.station,
        related_entity_type="station_assignment_update",
        related_entity_id=str(updated.id),
        related_reference=f"{updated.station.name}:{updated.user.email}",
        summary={
            "action": "update_assignment",
            "role": updated.role,
            "is_active": updated.is_active,
            "can_manage_local_staff": updated.can_manage_local_staff,
        },
        event_key=f"pickup_assignment_update:{updated.id}:{updated.updated_at.isoformat()}",
    )
    return Response(PickupStationAssignmentSerializer(updated).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def admin_pickup_operations(request):
    if not has_admin_permission(request.user, "pickup.view"):
        return Response({"detail": "Missing permission: pickup.view"}, status=status.HTTP_403_FORBIDDEN)

    queryset = PickupOrderOperation.objects.select_related("station", "order", "actor").all()
    station_id = str(request.query_params.get("station_id", "")).strip()
    event_type = str(request.query_params.get("event_type", "")).strip()
    if station_id.isdigit():
        queryset = queryset.filter(station_id=int(station_id))
    if event_type:
        queryset = queryset.filter(event_type=event_type)
    return Response(PickupOrderOperationSerializer(queryset[:500], many=True).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def station_me_stations(request):
    if not _can_operate_stations(request.user):
        return Response({"detail": "Missing permission: pickup.operations"}, status=status.HTTP_403_FORBIDDEN)

    scope = _station_scope(request.user)
    queryset = PickupStation.objects.filter(is_active=True)
    if not scope["unrestricted"]:
        queryset = queryset.filter(id__in=scope["station_ids"])
    return Response(PickupStationSerializer(queryset.order_by("city", "name"), many=True).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def station_me_orders(request):
    if not _can_operate_stations(request.user):
        return Response({"detail": "Missing permission: pickup.operations"}, status=status.HTTP_403_FORBIDDEN)

    scope = _station_scope(request.user)
    queryset = Order.objects.select_related("user", "shipping_address", "pickup_station").filter(
        fulfillment_method="pickup",
        pickup_station__isnull=False,
    )
    if not scope["unrestricted"]:
        queryset = queryset.filter(pickup_station_id__in=scope["station_ids"])

    station_id = str(request.query_params.get("station_id", "")).strip()
    status_filter = str(request.query_params.get("status", "")).strip()
    if station_id:
        if not station_id.isdigit():
            return Response({"detail": "station_id must be numeric."}, status=status.HTTP_400_BAD_REQUEST)
        station_id_value = int(station_id)
        if not scope["unrestricted"] and station_id_value not in scope["station_ids"]:
            return Response({"detail": "You are not assigned to this station."}, status=status.HTTP_403_FORBIDDEN)
        queryset = queryset.filter(pickup_station_id=station_id_value)
    if status_filter:
        queryset = queryset.filter(status=status_filter)

    return Response(PickupOrderSummarySerializer(queryset.order_by("-created_at")[:500], many=True).data, status=status.HTTP_200_OK)


def _get_station_order_for_actor(user, order_id: int):
    scope = _station_scope(user)
    queryset = Order.objects.select_related("pickup_station", "user", "shipping_address").filter(
        id=order_id,
        fulfillment_method="pickup",
        pickup_station__isnull=False,
    )
    if not scope["unrestricted"]:
        queryset = queryset.filter(pickup_station_id__in=scope["station_ids"])
    try:
        return queryset.get()
    except Order.DoesNotExist:
        return None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def station_order_ready(request, order_id: int):
    if not _can_operate_stations(request.user):
        return Response({"detail": "Missing permission: pickup.operations"}, status=status.HTTP_403_FORBIDDEN)

    order = _get_station_order_for_actor(request.user, order_id)
    if not order:
        return Response({"detail": "Pickup order not found for your station scope."}, status=status.HTTP_404_NOT_FOUND)
    if order.status in {"Cancelled", "Delivered"}:
        return Response({"detail": f"Cannot mark ready while order is {order.status}."}, status=status.HTTP_400_BAD_REQUEST)

    order.pickup_ready_at = timezone.now()
    if order.status == "Pending":
        order.status = "Processing"
    order.save(update_fields=["pickup_ready_at", "status", "updated_at"])

    notes = str(request.data.get("notes", "")).strip()
    PickupOrderOperation.objects.create(
        station=order.pickup_station,
        order=order,
        actor=request.user,
        event_type="ready_for_pickup",
        notes=notes,
        metadata={"order_status": order.status},
    )
    log_admin_activity(
        actor=request.user,
        action="pickup.order.ready",
        description=f"Marked order {order.order_number} ready for pickup.",
        target_type="Order",
        target_id=str(order.id),
        metadata={"station_id": order.pickup_station_id},
    )
    return Response(PickupOrderSummarySerializer(order).data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def station_order_collect(request, order_id: int):
    if not _can_operate_stations(request.user):
        return Response({"detail": "Missing permission: pickup.operations"}, status=status.HTTP_403_FORBIDDEN)

    order = _get_station_order_for_actor(request.user, order_id)
    if not order:
        return Response({"detail": "Pickup order not found for your station scope."}, status=status.HTTP_404_NOT_FOUND)
    if order.status == "Cancelled":
        return Response({"detail": "Cancelled orders cannot be marked as collected."}, status=status.HTTP_400_BAD_REQUEST)

    previously_delivered = order.status == "Delivered"
    if not order.pickup_ready_at:
        order.pickup_ready_at = timezone.now()
    order.status = "Delivered"
    order.picked_up_at = timezone.now()
    order.save(update_fields=["pickup_ready_at", "picked_up_at", "status", "updated_at"])

    notes = str(request.data.get("notes", "")).strip()
    PickupOrderOperation.objects.create(
        station=order.pickup_station,
        order=order,
        actor=request.user,
        event_type="collected",
        notes=notes,
        metadata={"picked_up_at": order.picked_up_at.isoformat()},
    )
    if not previously_delivered:
        from orders.services import release_vendor_earnings_for_order

        release_vendor_earnings_for_order(order)
    from receipts.services import issue_receipt_safe

    issue_receipt_safe(
        category="customer",
        receipt_type="customer_pickup",
        owner_type="customer",
        owner_user=order.user,
        actor=request.user,
        customer=order.user,
        station=order.pickup_station,
        order=order,
        related_entity_type="pickup_collection",
        related_entity_id=str(order.id),
        related_reference=order.order_number,
        gross_amount=order.total_amount,
        net_amount=order.total_amount,
        payment_method="pickup_collection",
        summary={
            "order_number": order.order_number,
            "pickup_station": order.pickup_station.name if order.pickup_station_id else "",
            "pickup_status": "collected",
            "picked_up_at": order.picked_up_at.isoformat() if order.picked_up_at else "",
            "operator": request.user.email,
        },
        event_key=f"pickup_collected:{order.id}",
    )

    log_admin_activity(
        actor=request.user,
        action="pickup.order.collected",
        description=f"Marked order {order.order_number} as collected.",
        target_type="Order",
        target_id=str(order.id),
        metadata={"station_id": order.pickup_station_id},
    )
    return Response(PickupOrderSummarySerializer(order).data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def station_order_return_dropoff(request, order_id: int):
    if not _can_operate_stations(request.user):
        return Response({"detail": "Missing permission: pickup.operations"}, status=status.HTTP_403_FORBIDDEN)

    order = _get_station_order_for_actor(request.user, order_id)
    if not order:
        return Response({"detail": "Pickup order not found for your station scope."}, status=status.HTTP_404_NOT_FOUND)

    notes = str(request.data.get("notes", "")).strip()
    operation = PickupOrderOperation.objects.create(
        station=order.pickup_station,
        order=order,
        actor=request.user,
        event_type="return_dropoff",
        notes=notes,
        metadata={"order_status": order.status},
    )
    from receipts.services import issue_receipt_safe

    issue_receipt_safe(
        category="customer",
        receipt_type="customer_return",
        owner_type="customer",
        owner_user=order.user,
        actor=request.user,
        customer=order.user,
        station=order.pickup_station,
        order=order,
        related_entity_type="return_dropoff",
        related_entity_id=str(operation.id),
        related_reference=order.order_number,
        gross_amount="0",
        net_amount="0",
        payment_method="return_dropoff",
        summary={
            "order_number": order.order_number,
            "dropoff_station": order.pickup_station.name if order.pickup_station_id else "",
            "status": order.status,
            "notes": notes,
            "operator": request.user.email,
        },
        event_key=f"return_dropoff:{operation.id}",
    )
    log_admin_activity(
        actor=request.user,
        action="pickup.order.return_dropoff",
        description=f"Recorded return drop-off for order {order.order_number}.",
        target_type="Order",
        target_id=str(order.id),
        metadata={"station_id": order.pickup_station_id},
    )
    return Response({"detail": "Return drop-off recorded."}, status=status.HTTP_200_OK)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def station_notice_update(request, station_id: int):
    if not _can_operate_stations(request.user):
        return Response({"detail": "Missing permission: pickup.operations"}, status=status.HTTP_403_FORBIDDEN)

    scope = _station_scope(request.user)
    if not scope["unrestricted"] and station_id not in scope["station_ids"]:
        return Response({"detail": "You are not assigned to this station."}, status=status.HTTP_403_FORBIDDEN)

    try:
        station = PickupStation.objects.get(id=station_id)
    except PickupStation.DoesNotExist:
        return Response({"detail": "Pickup station not found."}, status=status.HTTP_404_NOT_FOUND)

    temporary_notice = str(request.data.get("temporary_notice", "")).strip()
    station.temporary_notice = temporary_notice
    station.notice_updated_at = timezone.now()
    station.updated_by = request.user
    station.save(update_fields=["temporary_notice", "notice_updated_at", "updated_by", "updated_at"])

    PickupOrderOperation.objects.create(
        station=station,
        order=None,
        actor=request.user,
        event_type="notice_update",
        notes=temporary_notice,
        metadata={},
    )
    log_admin_activity(
        actor=request.user,
        action="pickup.station.notice_update",
        description=f"Updated temporary notice for station {station.name}.",
        target_type="PickupStation",
        target_id=str(station.id),
        metadata={},
    )
    return Response(PickupStationSerializer(station).data, status=status.HTTP_200_OK)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def station_operational_settings_update(request, station_id: int):
    if not _can_operate_stations(request.user):
        return Response({"detail": "Missing station operation permissions."}, status=status.HTTP_403_FORBIDDEN)

    scope = _station_scope(request.user)
    if not scope["unrestricted"] and station_id not in scope["station_ids"]:
        return Response({"detail": "You are not assigned to this station."}, status=status.HTTP_403_FORBIDDEN)

    try:
        station = PickupStation.objects.get(id=station_id)
    except PickupStation.DoesNotExist:
        return Response({"detail": "Pickup station not found."}, status=status.HTTP_404_NOT_FOUND)

    payload = request.data if isinstance(request.data, dict) else {}
    allowed_fields = {
        "services",
        "supports_pickup",
        "supports_returns",
        "temporary_notice",
    }
    update_payload = {key: payload[key] for key in allowed_fields if key in payload}

    if "temporary_notice" in update_payload:
        station.notice_updated_at = timezone.now()
        update_payload["notice_updated_at"] = station.notice_updated_at

    serializer = PickupStationSerializer(station, data=update_payload, partial=True)
    serializer.is_valid(raise_exception=True)
    updated_station = serializer.save(updated_by=request.user)

    PickupOrderOperation.objects.create(
        station=updated_station,
        order=None,
        actor=request.user,
        event_type="notice_update",
        notes=str(payload.get("temporary_notice", "")).strip(),
        metadata={
            "supports_pickup": updated_station.supports_pickup,
            "supports_returns": updated_station.supports_returns,
            "services": updated_station.services,
        },
    )
    log_admin_activity(
        actor=request.user,
        action="pickup.station.operations_update",
        description=f"Updated operational settings for {updated_station.name}.",
        target_type="PickupStation",
        target_id=str(updated_station.id),
        metadata={
            "supports_pickup": updated_station.supports_pickup,
            "supports_returns": updated_station.supports_returns,
        },
    )
    from receipts.services import issue_receipt_safe

    issue_receipt_safe(
        category="admin",
        receipt_type="admin_override",
        owner_type="station_staff" if request.user.role == "admin" and not has_admin_permission(request.user, "pickup.manage") else "admin",
        owner_user=request.user,
        actor=request.user,
        station=updated_station,
        related_entity_type="station_operational_update",
        related_entity_id=str(updated_station.id),
        related_reference=f"{updated_station.name}-{updated_station.city}",
        summary={
            "action": "station_operational_update",
            "supports_pickup": updated_station.supports_pickup,
            "supports_returns": updated_station.supports_returns,
            "services": updated_station.services,
            "temporary_notice": updated_station.temporary_notice or "",
        },
        event_key=f"station_ops_update:{updated_station.id}:{updated_station.updated_at.isoformat()}",
    )
    return Response(PickupStationSerializer(updated_station).data, status=status.HTTP_200_OK)
