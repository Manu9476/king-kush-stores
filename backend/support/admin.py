from django.contrib import admin

from .models import KnowledgeBaseEntry, NewsletterSubscription, SupportTicket, SupportTicketAttachment, SupportTicketMessage


class SupportTicketMessageInline(admin.TabularInline):
    model = SupportTicketMessage
    extra = 0
    readonly_fields = ("sender_type", "sender_email", "content", "is_internal", "created_by", "created_at")
    can_delete = False


class SupportTicketAttachmentInline(admin.TabularInline):
    model = SupportTicketAttachment
    extra = 0
    readonly_fields = ("original_name", "file", "uploaded_by", "created_at")
    can_delete = False


@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    list_display = ("id", "subject", "email", "status", "created_at", "updated_at", "resolved_at")
    list_filter = ("status", "created_at")
    search_fields = ("subject", "email", "name", "user__email")
    readonly_fields = ("created_at", "updated_at", "resolved_at", "resolved_by")
    inlines = [SupportTicketMessageInline, SupportTicketAttachmentInline]


@admin.register(SupportTicketMessage)
class SupportTicketMessageAdmin(admin.ModelAdmin):
    list_display = ("ticket", "sender_type", "sender_email", "is_internal", "created_at")
    list_filter = ("sender_type", "is_internal", "created_at")
    search_fields = ("ticket__subject", "content", "sender_email")
    readonly_fields = ("created_at",)


@admin.register(SupportTicketAttachment)
class SupportTicketAttachmentAdmin(admin.ModelAdmin):
    list_display = ("ticket", "original_name", "uploaded_by", "created_at")
    search_fields = ("ticket__subject", "original_name", "ticket__email")
    readonly_fields = ("created_at",)


@admin.register(KnowledgeBaseEntry)
class KnowledgeBaseEntryAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "entry_type", "is_published", "sort_order", "updated_at")
    list_filter = ("category", "entry_type", "is_published")
    search_fields = ("title", "content", "short_answer")
    prepopulated_fields = {"slug": ("title",)}


@admin.register(NewsletterSubscription)
class NewsletterSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("email", "is_active", "subscribed_at", "updated_at")
    list_filter = ("is_active", "subscribed_at")
    search_fields = ("email",)
    readonly_fields = ("subscribed_at", "updated_at")
