import json
from typing import Any

from rest_framework import serializers

from .models import JobApplication, JobApplicationField, JobOpening


FIELD_KEY_MAPPING = {
    "full_name": "full_name",
    "email": "email",
    "phone_number": "phone_number",
    "country_location": "country_location",
    "years_of_experience": "years_of_experience",
    "education_level": "education_level",
    "professional_skills": "professional_skills",
    "linkedin_portfolio": "linkedin_portfolio",
    "cover_letter": "cover_letter",
}


class JobOpeningSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobOpening
        fields = (
            "id",
            "title",
            "department",
            "location",
            "employment_type",
            "summary",
            "responsibilities",
            "requirements",
            "is_active",
            "posted_at",
            "updated_at",
        )


class JobApplicationFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobApplicationField
        fields = (
            "id",
            "key",
            "label",
            "field_type",
            "is_required",
            "placeholder",
            "help_text",
            "select_options",
            "sort_order",
            "is_active",
        )

    def validate(self, attrs):
        field_type = attrs.get("field_type", getattr(self.instance, "field_type", "text"))
        options = attrs.get("select_options", getattr(self.instance, "select_options", []))

        if field_type == "select":
            if not isinstance(options, list) or len(options) == 0:
                raise serializers.ValidationError({"select_options": "Select fields must include at least one option."})
            if not all(isinstance(item, str) and item.strip() for item in options):
                raise serializers.ValidationError({"select_options": "Each select option must be a non-empty string."})
        elif options:
            attrs["select_options"] = []

        return attrs


class JobApplicationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobApplication
        fields = (
            "id",
            "job_opening",
            "full_name",
            "email",
            "phone_number",
            "country_location",
            "years_of_experience",
            "education_level",
            "professional_skills",
            "linkedin_portfolio",
            "cover_letter",
            "additional_answers",
            "cv_file",
            "cover_letter_file",
            "certificates_file",
            "created_at",
        )
        read_only_fields = ("id", "created_at")

    def _coerce_additional_answers(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            return data
        if isinstance(data, str) and data.strip():
            try:
                parsed = json.loads(data)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass
        return {}

    def validate(self, attrs):
        request = self.context.get("request")
        request_data = request.data if request else {}

        active_fields = JobApplicationField.objects.filter(is_active=True).order_by("sort_order", "id")
        additional_answers = self._coerce_additional_answers(attrs.get("additional_answers") or request_data.get("additional_answers"))
        errors = {}

        for field in active_fields:
            raw_value = request_data.get(field.key, attrs.get(FIELD_KEY_MAPPING.get(field.key, field.key)))
            value = raw_value.strip() if isinstance(raw_value, str) else raw_value
            if field.is_required and not value:
                errors[field.key] = f"{field.label} is required."
                continue
            if not value:
                continue

            mapped_model_field = FIELD_KEY_MAPPING.get(field.key)
            if mapped_model_field:
                attrs[mapped_model_field] = value
            else:
                additional_answers[field.key] = value

        if not attrs.get("cv_file") and not request_data.get("cv_file"):
            errors["cv_file"] = "CV upload is required."

        if errors:
            raise serializers.ValidationError(errors)

        attrs["additional_answers"] = additional_answers
        return attrs


class JobApplicationAdminSerializer(serializers.ModelSerializer):
    job_opening = JobOpeningSerializer(read_only=True)
    job_opening_id = serializers.PrimaryKeyRelatedField(
        source="job_opening",
        queryset=JobOpening.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )
    applicant_email = serializers.SerializerMethodField()

    class Meta:
        model = JobApplication
        fields = (
            "id",
            "job_opening",
            "job_opening_id",
            "full_name",
            "email",
            "phone_number",
            "country_location",
            "years_of_experience",
            "education_level",
            "professional_skills",
            "linkedin_portfolio",
            "cover_letter",
            "additional_answers",
            "cv_file",
            "cover_letter_file",
            "certificates_file",
            "status",
            "admin_notes",
            "reviewed_at",
            "created_at",
            "updated_at",
            "applicant_email",
        )
        read_only_fields = ("reviewed_at", "created_at", "updated_at", "applicant_email")

    def get_applicant_email(self, obj: JobApplication) -> str:
        return obj.applicant_user.email if obj.applicant_user else ""
