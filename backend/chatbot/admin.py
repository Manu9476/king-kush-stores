from django.contrib import admin

from .models import ChatConversation, ChatMessage


class ChatMessageInline(admin.TabularInline):
    model = ChatMessage
    extra = 0
    readonly_fields = ("role", "content", "created_at")
    can_delete = False


@admin.register(ChatConversation)
class ChatConversationAdmin(admin.ModelAdmin):
    list_display = ("session_id", "user", "updated_at", "started_at")
    search_fields = ("session_id", "user__email", "last_user_message", "last_bot_message")
    readonly_fields = ("session_id", "user", "last_user_message", "last_bot_message", "started_at", "updated_at")
    inlines = [ChatMessageInline]


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("conversation", "role", "created_at")
    search_fields = ("conversation__session_id", "content")
    readonly_fields = ("conversation", "role", "content", "created_at")
