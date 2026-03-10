from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from users.models import AccountActivity
from users.permissions import IsMarketplaceAdmin, has_admin_permission
from users.rbac import log_admin_activity

from .models import JobApplication, JobApplicationField, JobOpening
from .serializers import (
    JobApplicationAdminSerializer,
    JobApplicationCreateSerializer,
    JobApplicationFieldSerializer,
    JobOpeningSerializer,
)


@api_view(["GET"])
@permission_classes([AllowAny])
def public_job_openings(request):
    openings = JobOpening.objects.filter(is_active=True).order_by("-posted_at")
    serializer = JobOpeningSerializer(openings, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([AllowAny])
def public_application_form_fields(request):
    fields = JobApplicationField.objects.filter(is_active=True).order_by("sort_order", "id")
    serializer = JobApplicationFieldSerializer(fields, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@permission_classes([AllowAny])
def submit_job_application(request):
    serializer = JobApplicationCreateSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)

    applicant_user = request.user if getattr(request.user, "is_authenticated", False) else None
    application = serializer.save(applicant_user=applicant_user)

    if applicant_user:
        AccountActivity.objects.create(
            user=applicant_user,
            activity_type="job_application",
            description=f"Submitted job application #{application.id}.",
            metadata={
                "job_opening_id": application.job_opening_id,
                "job_opening_title": application.job_opening.title if application.job_opening else "",
                "application_id": application.id,
            },
        )

    return Response(
        {
            "id": application.id,
            "detail": "Application submitted successfully. Our recruitment team will contact you soon.",
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsMarketplaceAdmin])
def admin_job_applications(request):
    if not has_admin_permission(request.user, "careers.view"):
        return Response({"detail": "Missing permission: careers.view"}, status=status.HTTP_403_FORBIDDEN)

    queryset = JobApplication.objects.select_related("job_opening", "applicant_user").all()

    status_filter = request.query_params.get("status", "").strip()
    if status_filter:
        queryset = queryset.filter(status=status_filter)

    query = request.query_params.get("q", "").strip()
    if query:
        queryset = queryset.filter(
            Q(full_name__icontains=query)
            | Q(email__icontains=query)
            | Q(phone_number__icontains=query)
            | Q(job_opening__title__icontains=query)
        )

    serializer = JobApplicationAdminSerializer(queryset.order_by("-created_at"), many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["PATCH"])
@permission_classes([IsMarketplaceAdmin])
def admin_job_application_detail(request, application_id: int):
    if not has_admin_permission(request.user, "careers.manage"):
        return Response({"detail": "Missing permission: careers.manage"}, status=status.HTTP_403_FORBIDDEN)

    try:
        application = JobApplication.objects.get(id=application_id)
    except JobApplication.DoesNotExist:
        return Response({"detail": "Job application not found."}, status=status.HTTP_404_NOT_FOUND)

    serializer = JobApplicationAdminSerializer(application, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    updated = serializer.save()

    if "status" in serializer.validated_data:
        updated.reviewed_by = request.user
        updated.reviewed_at = timezone.now()
        updated.save(update_fields=["reviewed_by", "reviewed_at", "updated_at"])
    log_admin_activity(
        actor=request.user,
        action="careers.application.update",
        description=f"Updated job application #{updated.id}.",
        target_type="JobApplication",
        target_id=str(updated.id),
        metadata={"status": updated.status},
    )

    return Response(JobApplicationAdminSerializer(updated).data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@permission_classes([IsMarketplaceAdmin])
def admin_form_fields(request):
    if request.method == "GET":
        if not has_admin_permission(request.user, "careers.view"):
            return Response({"detail": "Missing permission: careers.view"}, status=status.HTTP_403_FORBIDDEN)
        fields = JobApplicationField.objects.all().order_by("sort_order", "id")
        serializer = JobApplicationFieldSerializer(fields, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    if not has_admin_permission(request.user, "careers.manage"):
        return Response({"detail": "Missing permission: careers.manage"}, status=status.HTTP_403_FORBIDDEN)

    serializer = JobApplicationFieldSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    created = serializer.save()
    log_admin_activity(
        actor=request.user,
        action="careers.form_field.create",
        description=f"Created job application field '{created.label}'.",
        target_type="JobApplicationField",
        target_id=str(created.id),
        metadata={"key": created.key, "field_type": created.field_type},
    )
    return Response(JobApplicationFieldSerializer(created).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsMarketplaceAdmin])
def admin_form_field_detail(request, field_id: int):
    if not has_admin_permission(request.user, "careers.manage"):
        return Response({"detail": "Missing permission: careers.manage"}, status=status.HTTP_403_FORBIDDEN)

    try:
        field = JobApplicationField.objects.get(id=field_id)
    except JobApplicationField.DoesNotExist:
        return Response({"detail": "Form field not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        field_label = field.label
        field.delete()
        log_admin_activity(
            actor=request.user,
            action="careers.form_field.delete",
            description=f"Deleted job application field '{field_label}'.",
            target_type="JobApplicationField",
            target_id=str(field_id),
            metadata={},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = JobApplicationFieldSerializer(field, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    updated = serializer.save()
    log_admin_activity(
        actor=request.user,
        action="careers.form_field.update",
        description=f"Updated job application field '{updated.label}'.",
        target_type="JobApplicationField",
        target_id=str(updated.id),
        metadata={"is_active": updated.is_active, "is_required": updated.is_required},
    )
    return Response(JobApplicationFieldSerializer(updated).data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@permission_classes([IsMarketplaceAdmin])
def admin_job_openings(request):
    if request.method == "GET":
        if not has_admin_permission(request.user, "careers.view"):
            return Response({"detail": "Missing permission: careers.view"}, status=status.HTTP_403_FORBIDDEN)
        openings = JobOpening.objects.all().order_by("-posted_at")
        serializer = JobOpeningSerializer(openings, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    if not has_admin_permission(request.user, "careers.manage"):
        return Response({"detail": "Missing permission: careers.manage"}, status=status.HTTP_403_FORBIDDEN)

    serializer = JobOpeningSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    created = serializer.save()
    log_admin_activity(
        actor=request.user,
        action="careers.opening.create",
        description=f"Created job opening '{created.title}'.",
        target_type="JobOpening",
        target_id=str(created.id),
        metadata={"department": created.department, "location": created.location},
    )
    return Response(JobOpeningSerializer(created).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsMarketplaceAdmin])
def admin_job_opening_detail(request, opening_id: int):
    if not has_admin_permission(request.user, "careers.manage"):
        return Response({"detail": "Missing permission: careers.manage"}, status=status.HTTP_403_FORBIDDEN)

    try:
        opening = JobOpening.objects.get(id=opening_id)
    except JobOpening.DoesNotExist:
        return Response({"detail": "Job opening not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        opening_title = opening.title
        opening.delete()
        log_admin_activity(
            actor=request.user,
            action="careers.opening.delete",
            description=f"Deleted job opening '{opening_title}'.",
            target_type="JobOpening",
            target_id=str(opening_id),
            metadata={},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = JobOpeningSerializer(opening, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    updated = serializer.save()
    log_admin_activity(
        actor=request.user,
        action="careers.opening.update",
        description=f"Updated job opening '{updated.title}'.",
        target_type="JobOpening",
        target_id=str(updated.id),
        metadata={"is_active": updated.is_active},
    )
    return Response(JobOpeningSerializer(updated).data, status=status.HTTP_200_OK)
