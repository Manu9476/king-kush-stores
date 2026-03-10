from django.db import models
from django.conf import settings


class ChatConversation(models.Model):
    session_id = models.CharField(max_length=64, unique=True, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_conversations",
    )
    last_user_message = models.TextField(blank=True)
    last_bot_message = models.TextField(blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        user_ref = self.user.email if self.user else "anonymous"
        return f"{self.session_id} ({user_ref})"


class ChatMessage(models.Model):
    ROLE_CHOICES = (
        ("user", "User"),
        ("bot", "Bot"),
    )

    conversation = models.ForeignKey(ChatConversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.role} @ {self.created_at.isoformat()}"
