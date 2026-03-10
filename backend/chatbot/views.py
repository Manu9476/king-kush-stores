# backend/chatbot/views.py
import re
import uuid

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from users.permissions import IsMarketplaceAdmin, has_admin_permission

from .assistant import generate_support_response
from .models import ChatConversation, ChatMessage
from .serializers import ChatConversationListSerializer, ChatConversationDetailSerializer


def _normalize_session_id(raw_session_id: str | None) -> str:
    if not raw_session_id:
        return uuid.uuid4().hex

    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", raw_session_id.strip())
    if not cleaned:
        return uuid.uuid4().hex
    return cleaned[:64]


@api_view(["POST"])
@permission_classes([AllowAny])
def handle_chat_message(request):
    message = str(request.data.get("message", "")).strip()
    history = request.data.get("history", [])
    session_id = _normalize_session_id(request.data.get("session_id"))

    if not isinstance(history, list):
        history = []

    if not message:
        return Response({"reply": "Please enter a message so I can assist you."}, status=status.HTTP_200_OK)

    authenticated_user = request.user if request.user and request.user.is_authenticated else None
    conversation, _ = ChatConversation.objects.get_or_create(
        session_id=session_id,
        defaults={"user": authenticated_user},
    )
    if authenticated_user and conversation.user_id is None:
        conversation.user = authenticated_user

    ChatMessage.objects.create(conversation=conversation, role="user", content=message)
    user_profile = {
        "is_authenticated": bool(authenticated_user),
        "email": authenticated_user.email if authenticated_user else None,
        "customer_id": getattr(authenticated_user, "customer_id", None) if authenticated_user else None,
        "first_name": authenticated_user.first_name if authenticated_user else None,
    }
    reply = generate_support_response(message, history, user_profile=user_profile)
    ChatMessage.objects.create(conversation=conversation, role="bot", content=reply)

    conversation.last_user_message = message
    conversation.last_bot_message = reply
    conversation.save(update_fields=["user", "last_user_message", "last_bot_message", "updated_at"])

    return Response(
        {
            "reply": reply,
            "session_id": conversation.session_id,
            "conversation_id": conversation.id,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def get_conversations(request):
    if not has_admin_permission(request.user, "chatbot.view"):
        return Response({"detail": "Missing permission: chatbot.view"}, status=status.HTTP_403_FORBIDDEN)

    queryset = ChatConversation.objects.select_related("user").annotate(message_count=Count("messages"))
    query = request.query_params.get("q", "").strip()
    if query:
        queryset = queryset.filter(
            Q(session_id__icontains=query)
            | Q(user__email__icontains=query)
            | Q(user__customer_id__icontains=query)
            | Q(last_user_message__icontains=query)
            | Q(last_bot_message__icontains=query)
        )

    serializer = ChatConversationListSerializer(queryset.order_by("-updated_at")[:100], many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsMarketplaceAdmin])
def get_conversation_detail(request, conversation_id: int):
    if not has_admin_permission(request.user, "chatbot.view"):
        return Response({"detail": "Missing permission: chatbot.view"}, status=status.HTTP_403_FORBIDDEN)

    conversation = get_object_or_404(
        ChatConversation.objects.select_related("user").prefetch_related("messages"),
        id=conversation_id,
    )
    serializer = ChatConversationDetailSerializer(conversation)
    return Response(serializer.data, status=status.HTTP_200_OK)
