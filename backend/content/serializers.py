from rest_framework import serializers

from .models import CompanyMedia, CompanyProfile, CreatorProfile, Department, TeamMember


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ("id", "name", "slug", "description", "is_active", "sort_order", "created_at", "updated_at")


class CompanyMediaSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = CompanyMedia
        fields = ("id", "image", "image_url", "caption", "is_featured", "sort_order", "created_at")

    def get_image_url(self, obj):
        if not obj.image:
            return ""
        request = self.context.get("request")
        return request.build_absolute_uri(obj.image.url) if request else obj.image.url


class CompanyProfileSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()
    banner_url = serializers.SerializerMethodField()
    featured_media = CompanyMediaSerializer(many=True, read_only=True)

    class Meta:
        model = CompanyProfile
        fields = (
            "id",
            "company_name",
            "slug",
            "logo",
            "logo_url",
            "banner",
            "banner_url",
            "description",
            "mission",
            "vision",
            "mission_vision",
            "email",
            "phone_number",
            "website_url",
            "address",
            "location",
            "year_founded",
            "category",
            "facebook_url",
            "instagram_url",
            "x_url",
            "linkedin_url",
            "youtube_url",
            "tiktok_url",
            "is_published",
            "is_active",
            "featured_media",
            "created_at",
            "updated_at",
        )

    def get_logo_url(self, obj):
        if not obj.logo:
            return ""
        request = self.context.get("request")
        return request.build_absolute_uri(obj.logo.url) if request else obj.logo.url

    def get_banner_url(self, obj):
        if not obj.banner:
            return ""
        request = self.context.get("request")
        return request.build_absolute_uri(obj.banner.url) if request else obj.banner.url


class BasePersonSerializer(serializers.ModelSerializer):
    profile_photo_url = serializers.SerializerMethodField()
    departments = DepartmentSerializer(many=True, read_only=True)
    department_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Department.objects.all(),
        write_only=True,
        source="departments",
        required=False,
    )

    class Meta:
        fields = (
            "id",
            "full_name",
            "slug",
            "profile_photo",
            "profile_photo_url",
            "role_title",
            "departments",
            "department_ids",
            "bio",
            "email",
            "phone_number",
            "facebook_url",
            "instagram_url",
            "x_url",
            "linkedin_url",
            "portfolio_url",
            "joining_date",
            "is_active",
            "is_featured",
            "is_published",
            "sort_order",
            "created_at",
            "updated_at",
        )

    def get_profile_photo_url(self, obj):
        if not obj.profile_photo:
            return ""
        request = self.context.get("request")
        return request.build_absolute_uri(obj.profile_photo.url) if request else obj.profile_photo.url


class CreatorProfileSerializer(BasePersonSerializer):
    class Meta(BasePersonSerializer.Meta):
        model = CreatorProfile


class TeamMemberSerializer(BasePersonSerializer):
    class Meta(BasePersonSerializer.Meta):
        model = TeamMember
