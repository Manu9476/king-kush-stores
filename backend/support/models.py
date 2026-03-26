import os

from django.conf import settings
from django.db import models
from django.utils.text import slugify


class SupportCategory(models.TextChoices):
    ORDERS = "orders", "Orders"
    SHIPPING = "shipping", "Shipping"
    PAYMENTS = "payments", "Payments"
    RETURNS = "returns", "Returns"
    ACCOUNT = "account", "Account Issues"
    VENDOR = "vendor", "Vendor Support"
    GENERAL = "general", "General"


class KnowledgeEntryType(models.TextChoices):
    FAQ = "faq", "FAQ"
    GUIDE = "guide", "Guide"


class SupportTicketStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    IN_PROGRESS = "in_progress", "In Progress"
    RESOLVED = "resolved", "Resolved"


class KnowledgeBaseEntry(models.Model):
    title = models.CharField(max_length=255)
    slug = models.SlugField(max_length=280, unique=True, blank=True)
    category = models.CharField(
        max_length=20,
        choices=SupportCategory.choices,
        default=SupportCategory.GENERAL,
        db_index=True,
    )
    entry_type = models.CharField(
        max_length=10,
        choices=KnowledgeEntryType.choices,
        default=KnowledgeEntryType.FAQ,
        db_index=True,
    )
    short_answer = models.CharField(max_length=280, blank=True)
    content = models.TextField()
    is_published = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("category", "entry_type", "sort_order", "title")

    def __str__(self):
        return f"{self.get_entry_type_display()}: {self.title}"

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title)[:250] or "knowledge-entry"
            candidate = base
            counter = 2
            while KnowledgeBaseEntry.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                candidate = f"{base}-{counter}"[:280]
                counter += 1
            self.slug = candidate
        super().save(*args, **kwargs)


class SupportTicket(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_tickets",
    )
    name = models.CharField(max_length=180)
    email = models.EmailField()
    subject = models.CharField(max_length=220)
    status = models.CharField(
        max_length=20,
        choices=SupportTicketStatus.choices,
        default=SupportTicketStatus.PENDING,
        db_index=True,
    )
    admin_notes = models.TextField(blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_support_tickets",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)

    def __str__(self):
        return f"#{self.id} {self.subject} ({self.status})"


class SupportTicketMessage(models.Model):
    class SenderType(models.TextChoices):
        USER = "user", "User"
        ADMIN = "admin", "Admin"
        SYSTEM = "system", "System"

    ticket = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, related_name="messages")
    sender_type = models.CharField(max_length=10, choices=SenderType.choices)
    sender_email = models.EmailField(blank=True)
    content = models.TextField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_messages",
    )
    is_internal = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("created_at",)

    def __str__(self):
        return f"{self.ticket_id}:{self.sender_type}@{self.created_at.isoformat()}"


class SupportTicketAttachment(models.Model):
    ticket = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to="support_ticket_attachments/")
    original_name = models.CharField(max_length=255, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_ticket_attachments",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("created_at",)

    def save(self, *args, **kwargs):
        if not self.original_name and self.file:
            self.original_name = os.path.basename(self.file.name)[:255]
        super().save(*args, **kwargs)

    def __str__(self):
        return f"ticket:{self.ticket_id} file:{self.original_name or self.file.name}"


class NewsletterSubscription(models.Model):
    email = models.EmailField(unique=True)
    is_active = models.BooleanField(default=True, db_index=True)
    subscribed_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-subscribed_at",)

    def __str__(self):
        return self.email
