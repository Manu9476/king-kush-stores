from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model
from django.utils.text import slugify

from .models import AdminActivityLog, StaffAssignment, StaffRole, VendorProfile
from .permissions import get_admin_permissions, is_super_admin
from .vendor_profile_utils import get_user_vendor_profile
from .rbac import (
    ALL_ADMIN_PERMISSION_CODES,
    modules_from_permissions,
    permission_catalog_payload,
    sanitize_permission_codes,
)

User = get_user_model()


class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        token["email"] = user.email
        token["customer_id"] = user.customer_id
        token["first_name"] = user.first_name or ""
        token["last_name"] = user.last_name or ""
        token["role"] = user.role

        vendor_profile = get_user_vendor_profile(user)
        token["vendor_approval_status"] = vendor_profile.approval_status if vendor_profile else None
        token["vendor_is_approved"] = bool(vendor_profile and vendor_profile.is_approved)
        token["admin_level"] = user.admin_level if user.role == "admin" else None
        token["is_super_admin"] = bool(user.role == "admin" and is_super_admin(user))

        if user.role == "admin":
            admin_permissions = sorted(get_admin_permissions(user))
            token["admin_permissions"] = admin_permissions
            token["admin_modules"] = modules_from_permissions(admin_permissions)
        else:
            token["admin_permissions"] = []
            token["admin_modules"] = []

        return token


class VendorProfileSerializer(serializers.ModelSerializer):
    reviewed_by_email = serializers.SerializerMethodField()
    verification_document_url = serializers.SerializerMethodField()
    store_logo_url = serializers.SerializerMethodField()
    store_banner_url = serializers.SerializerMethodField()

    class Meta:
        model = VendorProfile
        fields = (
            "id",
            "store_name",
            "store_description",
            "business_email",
            "business_phone",
            "business_hours",
            "business_location",
            "business_address_line_1",
            "business_address_line_2",
            "business_city",
            "business_postal_code",
            "business_country",
            "product_category",
            "verification_document",
            "verification_document_url",
            "store_logo",
            "store_logo_url",
            "store_banner",
            "store_banner_url",
            "approval_status",
            "is_approved",
            "review_notes",
            "reviewed_by",
            "reviewed_by_email",
            "reviewed_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "approval_status",
            "is_approved",
            "review_notes",
            "reviewed_by",
            "reviewed_by_email",
            "reviewed_at",
            "created_at",
            "updated_at",
        )

    def get_reviewed_by_email(self, obj):
        return obj.reviewed_by.email if obj.reviewed_by else ""

    def get_verification_document_url(self, obj):
        if not obj.verification_document:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.verification_document.url)
        return obj.verification_document.url

    def get_store_logo_url(self, obj):
        if not obj.store_logo:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.store_logo.url)
        return obj.store_logo.url

    def get_store_banner_url(self, obj):
        if not obj.store_banner:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.store_banner.url)
        return obj.store_banner.url


class UserSerializer(serializers.ModelSerializer):
    vendor_profile = VendorProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "customer_id",
            "email",
            "first_name",
            "last_name",
            "phone_number",
            "role",
            "vendor_profile",
        )


class UserProfileSerializer(serializers.ModelSerializer):
    vendor_profile = VendorProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "customer_id",
            "email",
            "first_name",
            "last_name",
            "phone_number",
            "role",
            "vendor_profile",
        )
        read_only_fields = ("id", "customer_id", "role", "vendor_profile")


class VendorProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorProfile
        fields = (
            "store_name",
            "store_description",
            "business_email",
            "business_phone",
            "business_hours",
            "business_location",
            "business_address_line_1",
            "business_address_line_2",
            "business_city",
            "business_postal_code",
            "business_country",
            "product_category",
            "verification_document",
            "store_logo",
            "store_banner",
        )


class VendorApplicationAdminSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    verification_document_url = serializers.SerializerMethodField()
    store_logo_url = serializers.SerializerMethodField()
    store_banner_url = serializers.SerializerMethodField()
    reviewed_by_email = serializers.SerializerMethodField()

    class Meta:
        model = VendorProfile
        fields = (
            "id",
            "user",
            "store_name",
            "store_description",
            "business_email",
            "business_phone",
            "business_hours",
            "business_location",
            "business_address_line_1",
            "business_address_line_2",
            "business_city",
            "business_postal_code",
            "business_country",
            "product_category",
            "verification_document",
            "verification_document_url",
            "store_logo",
            "store_logo_url",
            "store_banner",
            "store_banner_url",
            "approval_status",
            "is_approved",
            "review_notes",
            "reviewed_by",
            "reviewed_by_email",
            "reviewed_at",
            "created_at",
            "updated_at",
        )

    def get_verification_document_url(self, obj):
        if not obj.verification_document:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.verification_document.url)
        return obj.verification_document.url

    def get_reviewed_by_email(self, obj):
        return obj.reviewed_by.email if obj.reviewed_by else ""

    def get_store_logo_url(self, obj):
        if not obj.store_logo:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.store_logo.url)
        return obj.store_logo.url

    def get_store_banner_url(self, obj):
        if not obj.store_banner:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.store_banner.url)
        return obj.store_banner.url


class VendorApplicationReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorProfile
        fields = ("approval_status", "review_notes")

    def validate_approval_status(self, value):
        allowed = {choice[0] for choice in VendorProfile.APPROVAL_STATUS_CHOICES}
        if value not in allowed:
            raise serializers.ValidationError("Invalid approval status.")
        return value


class PublicVendorStoreSerializer(serializers.ModelSerializer):
    store_logo_url = serializers.SerializerMethodField()
    store_banner_url = serializers.SerializerMethodField()
    total_products = serializers.IntegerField(read_only=True)
    store_score = serializers.SerializerMethodField()
    catalog_categories = serializers.SerializerMethodField()

    class Meta:
        model = VendorProfile
        fields = (
            "id",
            "store_name",
            "store_description",
            "business_email",
            "business_phone",
            "business_hours",
            "business_location",
            "business_address_line_1",
            "business_address_line_2",
            "business_city",
            "business_postal_code",
            "business_country",
            "product_category",
            "store_logo_url",
            "store_banner_url",
            "total_products",
            "store_score",
            "catalog_categories",
            "updated_at",
        )

    def get_store_logo_url(self, obj):
        if not obj.store_logo:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.store_logo.url)
        return obj.store_logo.url

    def get_store_banner_url(self, obj):
        if not obj.store_banner:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.store_banner.url)
        return obj.store_banner.url

    def get_store_score(self, obj):
        total_products = max(int(getattr(obj, "total_products", 0) or 0), 0)
        completeness_fields = [
            obj.store_description,
            obj.business_email,
            obj.business_phone,
            obj.business_location,
            obj.business_city,
            obj.business_country,
        ]
        completeness_ratio = sum(1 for value in completeness_fields if str(value or "").strip()) / len(completeness_fields)
        completeness_bonus = completeness_ratio * 1.5
        product_bonus = min(total_products, 20) / 20 * 1.5
        score = min(5.0, 2.0 + completeness_bonus + product_bonus)
        return round(score, 1)

    def get_catalog_categories(self, obj):
        categories = []
        seen = set()
        for product in obj.products.all():
            category_name = product.category.name if product.category else ""
            if category_name and category_name not in seen:
                seen.add(category_name)
                categories.append(category_name)
        return categories


class RegisterSerializer(serializers.ModelSerializer):
    username = serializers.CharField(write_only=True, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(choices=[("customer", "Customer"), ("vendor", "Vendor")], required=False, default="customer")

    business_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    business_description = serializers.CharField(write_only=True, required=False, allow_blank=True)
    business_email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    business_phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    business_hours = serializers.CharField(write_only=True, required=False, allow_blank=True)
    business_location = serializers.CharField(write_only=True, required=False, allow_blank=True)
    product_category = serializers.CharField(write_only=True, required=False, allow_blank=True)
    verification_document = serializers.FileField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = User
        fields = (
            "username",
            "email",
            "first_name",
            "last_name",
            "phone_number",
            "password",
            "password_confirm",
            "role",
            "business_name",
            "business_description",
            "business_email",
            "business_phone",
            "business_hours",
            "business_location",
            "product_category",
            "verification_document",
        )

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password": "Password fields didn't match."})

        role = attrs.get("role", "customer")
        if role == "admin":
            raise serializers.ValidationError({"role": "Admin role cannot be selected during public registration."})

        if role == "vendor":
            required_vendor_fields = {
                "business_name": "Business name is required for vendor registration.",
                "business_description": "Business description is required for vendor registration.",
                "business_email": "Business contact email is required for vendor registration.",
                "business_phone": "Business phone is required for vendor registration.",
                "business_location": "Business location is required for vendor registration.",
                "product_category": "Please specify your intended product category.",
            }
            errors = {}
            for field_name, message in required_vendor_fields.items():
                if not str(attrs.get(field_name, "")).strip():
                    errors[field_name] = message
            if errors:
                raise serializers.ValidationError(errors)

        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        username = validated_data.pop("username", "").strip()
        role = validated_data.pop("role", "customer")

        vendor_payload = {
            "business_name": validated_data.pop("business_name", "").strip(),
            "business_description": validated_data.pop("business_description", "").strip(),
            "business_email": validated_data.pop("business_email", "").strip(),
            "business_phone": validated_data.pop("business_phone", "").strip(),
            "business_hours": validated_data.pop("business_hours", "").strip(),
            "business_location": validated_data.pop("business_location", "").strip(),
            "product_category": validated_data.pop("product_category", "").strip(),
            "verification_document": validated_data.pop("verification_document", None),
        }

        first_name = validated_data.get("first_name", "").strip()
        if not first_name and username:
            first_name = username
        last_name = validated_data.get("last_name", "").strip()

        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=first_name,
            last_name=last_name,
            phone_number=validated_data.get("phone_number"),
            role=role,
        )

        if role == "vendor":
            VendorProfile.objects.create(
                user=user,
                store_name=vendor_payload["business_name"],
                store_description=vendor_payload["business_description"],
                business_email=vendor_payload["business_email"],
                business_phone=vendor_payload["business_phone"],
                business_hours=vendor_payload["business_hours"],
                business_location=vendor_payload["business_location"],
                product_category=vendor_payload["product_category"],
                verification_document=vendor_payload["verification_document"],
                approval_status="pending_review",
            )

        return user


class StaffRoleSerializer(serializers.ModelSerializer):
    slug = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = StaffRole
        fields = ("id", "name", "slug", "description", "permissions", "is_active", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_permissions(self, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("Permissions must be a list.")
        unknown = [code for code in value if code not in ALL_ADMIN_PERMISSION_CODES]
        if unknown:
            raise serializers.ValidationError(f"Unknown permission codes: {', '.join(sorted(set(unknown)))}")
        return sanitize_permission_codes(value)

    def validate(self, attrs):
        name = attrs.get("name", getattr(self.instance, "name", "")).strip()
        slug = attrs.get("slug", getattr(self.instance, "slug", "")).strip()
        if not name:
            raise serializers.ValidationError({"name": "Role name is required."})

        if not slug:
            slug = slugify(name)
        if not slug:
            raise serializers.ValidationError({"slug": "Unable to generate role slug from role name."})
        attrs["slug"] = slug
        return attrs


class StaffAssignmentSerializer(serializers.ModelSerializer):
    role = StaffRoleSerializer(read_only=True)
    role_id = serializers.PrimaryKeyRelatedField(
        queryset=StaffRole.objects.filter(is_active=True),
        source="role",
        write_only=True,
        required=False,
        allow_null=True,
    )
    assigned_by_email = serializers.SerializerMethodField()

    class Meta:
        model = StaffAssignment
        fields = (
            "id",
            "role",
            "role_id",
            "is_active",
            "assigned_by",
            "assigned_by_email",
            "assigned_at",
            "notes",
            "updated_at",
        )
        read_only_fields = ("id", "assigned_by", "assigned_by_email", "assigned_at", "updated_at")

    def get_assigned_by_email(self, obj):
        return obj.assigned_by.email if obj.assigned_by else ""


class StaffAccountSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    staff_assignment = StaffAssignmentSerializer(read_only=True)
    effective_permissions = serializers.SerializerMethodField()
    allowed_modules = serializers.SerializerMethodField()
    is_super_admin = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "customer_id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "phone_number",
            "is_active",
            "date_joined",
            "last_login",
            "role",
            "admin_level",
            "is_super_admin",
            "staff_assignment",
            "effective_permissions",
            "allowed_modules",
        )

    def get_full_name(self, obj):
        full_name = f"{obj.first_name} {obj.last_name}".strip()
        return full_name or obj.email

    def get_effective_permissions(self, obj):
        return sorted(get_admin_permissions(obj))

    def get_allowed_modules(self, obj):
        return modules_from_permissions(list(get_admin_permissions(obj)))

    def get_is_super_admin(self, obj):
        return is_super_admin(obj)


class StaffAccountCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    phone_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    password = serializers.CharField(write_only=True, min_length=8)
    is_active = serializers.BooleanField(required=False, default=True)
    role_id = serializers.PrimaryKeyRelatedField(
        queryset=StaffRole.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    assignment_active = serializers.BooleanField(required=False, default=True)
    assignment_notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def create(self, validated_data):
        role = validated_data.pop("role_id", None)
        assignment_active = validated_data.pop("assignment_active", True)
        assignment_notes = validated_data.pop("assignment_notes", "")
        acting_user = self.context.get("acting_user")

        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=validated_data.get("first_name", "").strip(),
            last_name=validated_data.get("last_name", "").strip(),
            phone_number=(validated_data.get("phone_number") or "").strip(),
            role="admin",
            admin_level="staff",
            is_staff=True,
            is_active=validated_data.get("is_active", True),
        )

        if role:
            StaffAssignment.objects.update_or_create(
                user=user,
                defaults={
                    "role": role,
                    "is_active": assignment_active,
                    "assigned_by": acting_user,
                    "notes": assignment_notes,
                },
            )

        return user


class StaffAccountUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    phone_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    email = serializers.EmailField(required=False)
    is_active = serializers.BooleanField(required=False)
    admin_level = serializers.ChoiceField(choices=[("super_admin", "Super Admin"), ("staff", "Staff")], required=False)
    role_id = serializers.PrimaryKeyRelatedField(
        queryset=StaffRole.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    assignment_active = serializers.BooleanField(required=False)
    assignment_notes = serializers.CharField(required=False, allow_blank=True)
    clear_assignment = serializers.BooleanField(required=False, default=False)
    new_password = serializers.CharField(required=False, min_length=8, allow_blank=False, write_only=True)

    def validate_email(self, value):
        user = self.context.get("user_obj")
        if user and User.objects.filter(email=value).exclude(id=user.id).exists():
            raise serializers.ValidationError("Another user with this email already exists.")
        return value

    def update(self, instance, validated_data):
        role = validated_data.pop("role_id", None) if "role_id" in validated_data else None
        assignment_active = validated_data.pop("assignment_active", None)
        assignment_notes = validated_data.pop("assignment_notes", None)
        clear_assignment = validated_data.pop("clear_assignment", False)
        new_password = validated_data.pop("new_password", None)
        acting_user = self.context.get("acting_user")

        for field in ("first_name", "last_name", "phone_number", "email", "is_active", "admin_level"):
            if field in validated_data:
                value = validated_data[field]
                if isinstance(value, str):
                    value = value.strip()
                setattr(instance, field, value)

        instance.role = "admin"
        instance.is_staff = True

        update_fields = [
            "first_name",
            "last_name",
            "phone_number",
            "email",
            "is_active",
            "admin_level",
            "role",
            "is_staff",
        ]
        instance.save(update_fields=update_fields)

        if new_password:
            instance.set_password(new_password)
            instance.save(update_fields=["password"])

        assignment = getattr(instance, "staff_assignment", None)
        if clear_assignment:
            if assignment:
                assignment.delete()
        elif role is not None or assignment_active is not None or assignment_notes is not None:
            assignment, _ = StaffAssignment.objects.get_or_create(
                user=instance,
                defaults={"assigned_by": acting_user, "is_active": True},
            )
            if role is not None:
                assignment.role = role
            if assignment_active is not None:
                assignment.is_active = assignment_active
            if assignment_notes is not None:
                assignment.notes = assignment_notes
            if acting_user:
                assignment.assigned_by = acting_user
            assignment.save()

        return instance


class AdminActivityLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.SerializerMethodField()

    class Meta:
        model = AdminActivityLog
        fields = (
            "id",
            "actor",
            "actor_email",
            "action",
            "target_type",
            "target_id",
            "description",
            "metadata",
            "created_at",
        )

    def get_actor_email(self, obj):
        return obj.actor.email if obj.actor else ""


class AdminCapabilitiesSerializer(serializers.Serializer):
    is_super_admin = serializers.BooleanField()
    admin_level = serializers.CharField(allow_blank=True)
    permissions = serializers.ListField(child=serializers.CharField())
    modules = serializers.ListField(child=serializers.CharField())
    permission_catalog = serializers.ListField()
    staff_assignment = serializers.DictField(allow_empty=True)


def build_admin_capabilities_payload(user):
    permissions = sorted(get_admin_permissions(user))
    assignment = getattr(user, "staff_assignment", None)

    staff_assignment_payload = {}
    if assignment:
        staff_assignment_payload = {
            "id": assignment.id,
            "is_active": assignment.is_active,
            "notes": assignment.notes,
            "assigned_at": assignment.assigned_at,
            "role": StaffRoleSerializer(assignment.role).data if assignment.role else None,
        }

    payload = {
        "is_super_admin": is_super_admin(user),
        "admin_level": user.admin_level or "",
        "permissions": permissions,
        "modules": modules_from_permissions(permissions),
        "permission_catalog": permission_catalog_payload(),
        "staff_assignment": staff_assignment_payload,
    }
    serializer = AdminCapabilitiesSerializer(data=payload)
    serializer.is_valid(raise_exception=True)
    return serializer.data
