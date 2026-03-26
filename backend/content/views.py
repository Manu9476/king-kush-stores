from django.db.models import Prefetch, Q
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from users.permissions import IsMarketplaceAdmin, has_admin_permission
from users.rbac import log_admin_activity

from .models import CompanyMedia, CompanyProfile, CreatorProfile, Department, TeamMember
from .serializers import CompanyMediaSerializer, CompanyProfileSerializer, CreatorProfileSerializer, DepartmentSerializer, TeamMemberSerializer


def _public_departments():
    return Department.objects.filter(is_active=True).order_by("sort_order", "name")


def _creators(public_only=False):
    departments = _public_departments() if public_only else Department.objects.all()
    queryset = CreatorProfile.objects.prefetch_related(Prefetch("departments", queryset=departments))
    if public_only:
        queryset = queryset.filter(is_active=True, is_published=True)
    return queryset


def _team_members(public_only=False):
    departments = _public_departments() if public_only else Department.objects.all()
    queryset = TeamMember.objects.prefetch_related(Prefetch("departments", queryset=departments))
    if public_only:
        queryset = queryset.filter(is_active=True, is_published=True)
    return queryset


def _company(public_only=False):
    queryset = CompanyProfile.objects.prefetch_related("featured_media")
    if public_only:
        queryset = queryset.filter(is_active=True, is_published=True)
    return queryset


@api_view(["GET"])
@permission_classes([AllowAny])
def public_creators_page(request):
    query = str(request.query_params.get("q", "")).strip()
    department = str(request.query_params.get("department", "")).strip()

    creators = _creators(public_only=True)
    if query:
        creators = creators.filter(Q(full_name__icontains=query) | Q(role_title__icontains=query) | Q(bio__icontains=query))
    if department:
        creators = creators.filter(departments__slug=department).distinct()

    featured = creators.filter(is_featured=True).order_by("sort_order", "full_name")
    items = creators.order_by("sort_order", "full_name")
    company = _company(public_only=True).first()

    return Response(
        {
            "company": CompanyProfileSerializer(company, context={"request": request}).data if company else None,
            "featured_creators": CreatorProfileSerializer(featured, many=True, context={"request": request}).data,
            "creators": CreatorProfileSerializer(items, many=True, context={"request": request}).data,
            "departments": DepartmentSerializer(_public_departments(), many=True).data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def public_creator_detail(request, slug):
    creator = _creators(public_only=True).filter(slug=slug).first()
    if not creator:
        return Response({"detail": "Creator not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(CreatorProfileSerializer(creator, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([AllowAny])
def public_team_page(request):
    query = str(request.query_params.get("q", "")).strip()
    department = str(request.query_params.get("department", "")).strip()

    members = _team_members(public_only=True)
    if query:
        members = members.filter(Q(full_name__icontains=query) | Q(role_title__icontains=query) | Q(bio__icontains=query))
    if department:
        members = members.filter(departments__slug=department).distinct()

    featured = members.filter(is_featured=True).order_by("sort_order", "full_name")
    items = members.order_by("sort_order", "full_name")
    return Response(
        {
            "featured_members": TeamMemberSerializer(featured, many=True, context={"request": request}).data,
            "members": TeamMemberSerializer(items, many=True, context={"request": request}).data,
            "departments": DepartmentSerializer(_public_departments(), many=True).data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def public_team_member_detail(request, slug):
    member = _team_members(public_only=True).filter(slug=slug).first()
    if not member:
        return Response({"detail": "Team member not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(TeamMemberSerializer(member, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["GET", "POST", "PATCH"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([IsMarketplaceAdmin])
def admin_company_profile(request):
    if not has_admin_permission(request.user, "content.manage"):
        return Response({"detail": "Missing permission: content.manage"}, status=status.HTTP_403_FORBIDDEN)
    existing = _company(public_only=False).first()

    if request.method == "GET":
        return Response({"company": CompanyProfileSerializer(existing, context={"request": request}).data if existing else None}, status=status.HTTP_200_OK)

    serializer = CompanyProfileSerializer(
        existing,
        data=request.data,
        partial=bool(existing) or request.method == "PATCH",
        context={"request": request},
    )
    serializer.is_valid(raise_exception=True)
    saved = serializer.save(
        created_by=request.user if not existing else existing.created_by,
        updated_by=request.user,
    )
    media_files = request.FILES.getlist("featured_media_files")
    existing_count = saved.featured_media.count()
    for index, media_file in enumerate(media_files):
        CompanyMedia.objects.create(company=saved, image=media_file, sort_order=existing_count + index)
    log_admin_activity(
        actor=request.user,
        action="content.company.update" if existing else "content.company.create",
        description=f"{'Updated' if existing else 'Created'} company profile '{saved.company_name}'.",
        target_type="CompanyProfile",
        target_id=str(saved.id),
        metadata={"is_published": saved.is_published, "is_active": saved.is_active},
    )
    return Response({"company": CompanyProfileSerializer(saved, context={"request": request}).data}, status=status.HTTP_200_OK if existing else status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsMarketplaceAdmin])
def admin_company_media_detail(request, media_id):
    if not has_admin_permission(request.user, "content.manage"):
        return Response({"detail": "Missing permission: content.manage"}, status=status.HTTP_403_FORBIDDEN)
    try:
        media = CompanyMedia.objects.get(id=media_id)
    except CompanyMedia.DoesNotExist:
        return Response({"detail": "Media not found."}, status=status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        media.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = CompanyMediaSerializer(media, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    saved = serializer.save()
    return Response(CompanyMediaSerializer(saved, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@permission_classes([IsMarketplaceAdmin])
def admin_departments(request):
    if not has_admin_permission(request.user, "content.manage"):
        return Response({"detail": "Missing permission: content.manage"}, status=status.HTTP_403_FORBIDDEN)
    if request.method == "GET":
        return Response(DepartmentSerializer(Department.objects.all().order_by("sort_order", "name"), many=True).data, status=status.HTTP_200_OK)
    serializer = DepartmentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    created = serializer.save()
    return Response(DepartmentSerializer(created).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsMarketplaceAdmin])
def admin_department_detail(request, department_id):
    if not has_admin_permission(request.user, "content.manage"):
        return Response({"detail": "Missing permission: content.manage"}, status=status.HTTP_403_FORBIDDEN)
    try:
        department = Department.objects.get(id=department_id)
    except Department.DoesNotExist:
        return Response({"detail": "Department not found."}, status=status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        department.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = DepartmentSerializer(department, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    saved = serializer.save()
    return Response(DepartmentSerializer(saved).data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([IsMarketplaceAdmin])
def admin_creators(request):
    if not has_admin_permission(request.user, "content.manage"):
        return Response({"detail": "Missing permission: content.manage"}, status=status.HTTP_403_FORBIDDEN)
    if request.method == "GET":
        query = str(request.query_params.get("q", "")).strip()
        items = _creators(public_only=False)
        if query:
            items = items.filter(Q(full_name__icontains=query) | Q(role_title__icontains=query) | Q(bio__icontains=query))
        return Response(CreatorProfileSerializer(items.order_by("sort_order", "full_name"), many=True, context={"request": request}).data, status=status.HTTP_200_OK)
    serializer = CreatorProfileSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    created = serializer.save()
    return Response(CreatorProfileSerializer(created, context={"request": request}).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([IsMarketplaceAdmin])
def admin_creator_detail(request, creator_id):
    if not has_admin_permission(request.user, "content.manage"):
        return Response({"detail": "Missing permission: content.manage"}, status=status.HTTP_403_FORBIDDEN)
    try:
        creator = CreatorProfile.objects.get(id=creator_id)
    except CreatorProfile.DoesNotExist:
        return Response({"detail": "Creator not found."}, status=status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        creator.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = CreatorProfileSerializer(creator, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    saved = serializer.save()
    return Response(CreatorProfileSerializer(saved, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([IsMarketplaceAdmin])
def admin_team_members(request):
    if not has_admin_permission(request.user, "content.manage"):
        return Response({"detail": "Missing permission: content.manage"}, status=status.HTTP_403_FORBIDDEN)
    if request.method == "GET":
        query = str(request.query_params.get("q", "")).strip()
        items = _team_members(public_only=False)
        if query:
            items = items.filter(Q(full_name__icontains=query) | Q(role_title__icontains=query) | Q(bio__icontains=query))
        return Response(TeamMemberSerializer(items.order_by("sort_order", "full_name"), many=True, context={"request": request}).data, status=status.HTTP_200_OK)
    serializer = TeamMemberSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    created = serializer.save()
    return Response(TeamMemberSerializer(created, context={"request": request}).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([IsMarketplaceAdmin])
def admin_team_member_detail(request, member_id):
    if not has_admin_permission(request.user, "content.manage"):
        return Response({"detail": "Missing permission: content.manage"}, status=status.HTTP_403_FORBIDDEN)
    try:
        member = TeamMember.objects.get(id=member_id)
    except TeamMember.DoesNotExist:
        return Response({"detail": "Team member not found."}, status=status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = TeamMemberSerializer(member, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    saved = serializer.save()
    return Response(TeamMemberSerializer(saved, context={"request": request}).data, status=status.HTTP_200_OK)
