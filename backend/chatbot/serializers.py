from rest_framework import serializers

from .models import ChatConversation, ChatMessage


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ("id", "role", "content", "created_at")


class ChatConversationListSerializer(serializers.ModelSerializer):
    user_email = serializers.SerializerMethodField()
    user_customer_id = serializers.SerializerMethodField()
    message_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = ChatConversation
        fields = (
            "id",
            "session_id",
            "user_email",
            "user_customer_id",
            "last_user_message",
            "last_bot_message",
            "message_count",
            "started_at",
            "updated_at",
        )

    def get_user_email(self, obj):
        return obj.user.email if obj.user else "Anonymous visitor"

    def get_user_customer_id(self, obj):
        return obj.user.customer_id if obj.user and getattr(obj.user, "customer_id", None) else None


class ChatConversationDetailSerializer(serializers.ModelSerializer):
    user_email = serializers.SerializerMethodField()
    user_customer_id = serializers.SerializerMethodField()
    messages = ChatMessageSerializer(many=True, read_only=True)

    class Meta:
        model = ChatConversation
        fields = (
            "id",
            "session_id",
            "user_email",
            "user_customer_id",
            "started_at",
            "updated_at",
            "messages",
        )

    def get_user_email(self, obj):
        return obj.user.email if obj.user else "Anonymous visitor"

    def get_user_customer_id(self, obj):
        return obj.user.customer_id if obj.user and getattr(obj.user, "customer_id", None) else None
