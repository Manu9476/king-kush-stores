from django.utils import timezone
from rest_framework import serializers

from .models import (
    KnowledgeBaseEntry,
    NewsletterSubscription,
    SupportCategory,
    SupportTicketAttachment,
    SupportTicket,
    SupportTicketMessage,
    SupportTicketStatus,
)

MAX_ATTACHMENT_SIZE_BYTES = 6 * 1024 * 1024
ALLOWED_ATTACHMENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
}


class KnowledgeBaseEntrySerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    entry_type_label = serializers.CharField(source="get_entry_type_display", read_only=True)

    class Meta:
        model = KnowledgeBaseEntry
        fields = (
            "id",
            "title",
            "slug",
            "category",
            "category_label",
            "entry_type",
            "entry_type_label",
            "short_answer",
            "content",
            "is_published",
            "sort_order",
            "created_at",
            "updated_at",
        )


class NewsletterSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = NewsletterSubscription
        fields = ("id", "email", "is_active", "subscribed_at")
        read_only_fields = ("id", "is_active", "subscribed_at")

    def validate_email(self, value):
        return value.strip().lower()


class SupportTicketMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportTicketMessage
        fields = (
            "id",
            "sender_type",
            "sender_email",
            "content",
            "is_internal",
            "created_at",
        )


class SupportTicketAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = SupportTicketAttachment
        fields = ("id", "original_name", "file_url", "created_at")

    def get_file_url(self, obj):
        if not obj.file:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url


class SupportTicketCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=180)
    email = serializers.EmailField()
    subject = serializers.CharField(max_length=220)
    message = serializers.CharField()
    attachment = serializers.FileField(required=False, allow_null=True)

    def validate_attachment(self, value):
        if not value:
            return value
        content_type = getattr(value, "content_type", "")
        if content_type and content_type not in ALLOWED_ATTACHMENT_TYPES:
            raise serializers.ValidationError("Attachment must be JPG, PNG, WEBP, or PDF.")
        if value.size > MAX_ATTACHMENT_SIZE_BYTES:
            raise serializers.ValidationError("Attachment cannot exceed 6MB.")
        return value

    def create(self, validated_data):
        request = self.context.get("request")
        user = request.user if request and request.user.is_authenticated else None
        attachment = validated_data.get("attachment")

        ticket = SupportTicket.objects.create(
            user=user,
            name=validated_data["name"].strip(),
            email=validated_data["email"].strip(),
            subject=validated_data["subject"].strip(),
        )
        SupportTicketMessage.objects.create(
            ticket=ticket,
            sender_type=SupportTicketMessage.SenderType.USER,
            sender_email=validated_data["email"].strip(),
            content=validated_data["message"].strip(),
            created_by=user,
            is_internal=False,
        )
        if attachment:
            SupportTicketAttachment.objects.create(
                ticket=ticket,
                file=attachment,
                original_name=getattr(attachment, "name", "")[:255],
                uploaded_by=user,
            )
        return ticket


class SupportTicketListSerializer(serializers.ModelSerializer):
    message_count = serializers.IntegerField(read_only=True)
    last_message = serializers.SerializerMethodField()
    user_email = serializers.SerializerMethodField()
    has_attachments = serializers.SerializerMethodField()

    class Meta:
        model = SupportTicket
        fields = (
            "id",
            "name",
            "email",
            "user_email",
            "subject",
            "status",
            "admin_notes",
            "message_count",
            "last_message",
            "has_attachments",
            "created_at",
            "updated_at",
            "resolved_at",
        )

    def get_last_message(self, obj: SupportTicket) -> str:
        latest = obj.messages.order_by("-created_at").first()
        return latest.content if latest else ""

    def get_user_email(self, obj: SupportTicket) -> str:
        return obj.user.email if obj.user else ""

    def get_has_attachments(self, obj: SupportTicket) -> bool:
        attachment_count = getattr(obj, "attachment_count", None)
        if attachment_count is not None:
            return attachment_count > 0
        return obj.attachments.exists()


class SupportTicketDetailSerializer(serializers.ModelSerializer):
    messages = SupportTicketMessageSerializer(many=True, read_only=True)
    user_email = serializers.SerializerMethodField()
    attachments = SupportTicketAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = SupportTicket
        fields = (
            "id",
            "name",
            "email",
            "user_email",
            "subject",
            "status",
            "admin_notes",
            "created_at",
            "updated_at",
            "resolved_at",
            "messages",
            "attachments",
        )

    def get_user_email(self, obj: SupportTicket) -> str:
        return obj.user.email if obj.user else ""


class SupportTicketAdminUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportTicket
        fields = ("status", "admin_notes")

    def validate_status(self, value):
        valid = {choice[0] for choice in SupportTicketStatus.choices}
        if value not in valid:
            raise serializers.ValidationError("Invalid ticket status.")
        return value

    def update(self, instance, validated_data):
        request = self.context.get("request")
        previous_status = instance.status
        instance = super().update(instance, validated_data)

        if "status" in validated_data:
            if validated_data["status"] == SupportTicketStatus.RESOLVED:
                instance.resolved_at = timezone.now()
                instance.resolved_by = request.user if request and request.user.is_authenticated else None
            elif previous_status == SupportTicketStatus.RESOLVED:
                instance.resolved_at = None
                instance.resolved_by = None
            instance.save(update_fields=["resolved_at", "resolved_by", "updated_at"])

        return instance


class SupportTicketReplySerializer(serializers.Serializer):
    message = serializers.CharField()
    status = serializers.ChoiceField(choices=SupportTicketStatus.choices, required=False)
    is_internal = serializers.BooleanField(required=False, default=False)

    def save(self, **kwargs):
        ticket: SupportTicket = self.context["ticket"]
        user = self.context["request"].user
        message = self.validated_data["message"].strip()
        status = self.validated_data.get("status")
        is_internal = bool(self.validated_data.get("is_internal", False))

        created = SupportTicketMessage.objects.create(
            ticket=ticket,
            sender_type=SupportTicketMessage.SenderType.ADMIN,
            sender_email=user.email,
            content=message,
            created_by=user,
            is_internal=is_internal,
        )

        if status:
            ticket.status = status
            if status == SupportTicketStatus.RESOLVED:
                ticket.resolved_at = timezone.now()
                ticket.resolved_by = user
            else:
                ticket.resolved_at = None
                ticket.resolved_by = None
            ticket.save(update_fields=["status", "resolved_at", "resolved_by", "updated_at"])
        else:
            ticket.save(update_fields=["updated_at"])

        return created


def support_category_choices_payload():
    return [{"key": key, "label": label} for key, label in SupportCategory.choices]
