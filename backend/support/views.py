import re
from urllib.parse import unquote, urlparse

from django.db import DatabaseError
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from products.models import Product
from users.models import VendorProfile
from users.permissions import IsMarketplaceAdmin, has_admin_permission
from users.rbac import log_admin_activity

from .models import KnowledgeBaseEntry, NewsletterSubscription, SupportTicket
from .serializers import (
    KnowledgeBaseEntrySerializer,
    NewsletterSubscriptionSerializer,
    SupportTicketAdminUpdateSerializer,
    SupportTicketCreateSerializer,
    SupportTicketDetailSerializer,
    SupportTicketListSerializer,
    SupportTicketReplySerializer,
    support_category_choices_payload,
)


SUPPORT_EMAIL = "emmanuelmacharia408@gmail.com"
SUPPORT_PHONE = "0701137747"
PRODUCT_REPORT_SUBJECT_TAG = "[PRODUCT REPORT]"
FALLBACK_HELP_ENTRIES = [
    {
        "id": -1,
        "title": "How do I track my order?",
        "slug": "how-do-i-track-my-order",
        "category": "orders",
        "category_label": "Orders",
        "entry_type": "faq",
        "entry_type_label": "FAQ",
        "short_answer": "Use Track Your Order and enter your order number.",
        "content": "Go to Track Your Order from the footer and submit your order number to check the latest status.",
        "is_published": True,
        "sort_order": 1,
        "created_at": None,
        "updated_at": None,
    },
    {
        "id": -2,
        "title": "How to request a return or refund",
        "slug": "how-to-request-a-return-or-refund",
        "category": "returns",
        "category_label": "Returns",
        "entry_type": "faq",
        "entry_type_label": "FAQ",
        "short_answer": "Request a return from your account order details.",
        "content": "Open My Account > Orders, select an eligible order, and submit a return request.",
        "is_published": True,
        "sort_order": 2,
        "created_at": None,
        "updated_at": None,
    },
    {
        "id": -3,
        "title": "How to place an order",
        "slug": "how-to-place-an-order",
        "category": "orders",
        "category_label": "Orders",
        "entry_type": "guide",
        "entry_type_label": "Guide",
        "short_answer": "Search products, add to cart, checkout, and confirm payment.",
        "content": "Browse products, add items to your cart, fill in delivery details, and complete payment to place your order.",
        "is_published": True,
        "sort_order": 1,
        "created_at": None,
        "updated_at": None,
    },
]


def _parse_product_report_payload(ticket: SupportTicket):
    reporter_name = ticket.name
    reporter_email = ticket.email
    product_reference = ""
    reason = ""
    issue_details = ""

    first_user_message = ticket.messages.filter(sender_type="user").order_by("created_at").first()
    raw_content = (first_user_message.content if first_user_message else "").strip()
    if raw_content:
        lines = [line.strip() for line in raw_content.splitlines()]
        details_collect = False
        collected_detail_lines = []

        for line in lines:
            lower = line.lower()
            if lower.startswith("reporter name:"):
                reporter_name = line.split(":", 1)[1].strip() or reporter_name
            elif lower.startswith("reporter email:"):
                reporter_email = line.split(":", 1)[1].strip() or reporter_email
            elif lower.startswith("product reference:"):
                product_reference = line.split(":", 1)[1].strip()
            elif lower.startswith("reason:"):
                reason = line.split(":", 1)[1].strip()
            elif lower.startswith("issue details:"):
                details_collect = True
                remainder = line.split(":", 1)[1].strip()
                if remainder:
                    collected_detail_lines.append(remainder)
            elif details_collect and line:
                collected_detail_lines.append(line)

        issue_details = "\n".join(collected_detail_lines).strip()

    if not product_reference:
        subject_lower = ticket.subject.lower()
        if PRODUCT_REPORT_SUBJECT_TAG.lower() in subject_lower:
            subject_clean = ticket.subject.replace(PRODUCT_REPORT_SUBJECT_TAG, "").strip(" -:")
            if " - " in subject_clean:
                product_reference = subject_clean.split(" - ", 1)[-1].strip()

    return {
        "reporter_name": reporter_name,
        "reporter_email": reporter_email,
        "product_reference": product_reference,
        "reason": reason,
        "issue_details": issue_details,
    }


def _extract_slug_from_reference(reference: str) -> str:
    if not reference:
        return ""
    ref = reference.strip()
    if "://" in ref:
        try:
            parsed = urlparse(ref)
            path_part = parsed.path or ""
            segments = [seg for seg in path_part.split("/") if seg]
            if segments:
                return unquote(segments[-1]).strip().lower()
        except Exception:
            return ""
    segments = [seg for seg in re.split(r"[/?#&\s]+", ref) if seg]
    if segments:
        return unquote(segments[-1]).strip().lower()
    return ""


def _serialize_product_candidate(product: Product):
    return {
        "id": product.id,
        "title": product.title,
        "slug": product.slug,
        "is_active": product.is_active,
        "vendor_profile_id": product.vendor_id,
        "vendor_name": product.vendor.store_name if product.vendor else "",
        "vendor_approval_status": product.vendor.approval_status if product.vendor else "",
        "price": str(product.price),
        "stock": product.stock,
        "category_name": product.category.name if product.category else "",
    }


def _get_product_candidates_from_reference(reference: str):
    if not reference:
        return []

    queryset = Product.objects.select_related("vendor", "category").all()
    candidates = []
    seen_ids = set()

    cleaned = reference.strip()
    if cleaned.isdigit():
        product = queryset.filter(id=int(cleaned)).first()
        if product and product.id not in seen_ids:
            seen_ids.add(product.id)
            candidates.append(product)

    slug_candidate = _extract_slug_from_reference(cleaned)
    if slug_candidate:
        product = queryset.filter(slug__iexact=slug_candidate).first()
        if product and product.id not in seen_ids:
            seen_ids.add(product.id)
            candidates.append(product)

    search_tokens = [token for token in re.split(r"[\s,;|:/?#&]+", cleaned) if token and len(token) >= 3]
    if search_tokens:
        search_q = Q()
        for token in search_tokens[:5]:
            search_q |= Q(title__icontains=token) | Q(slug__icontains=token)
        for product in queryset.filter(search_q).order_by("-created_at")[:8]:
            if product.id not in seen_ids:
                seen_ids.add(product.id)
                candidates.append(product)

    return candidates[:5]


def _find_report_product(ticket: SupportTicket, product_id=None):
    if product_id:
        return Product.objects.select_related("vendor").filter(id=product_id).first()

    payload = _parse_product_report_payload(ticket)
    reference = payload.get("product_reference", "")
    candidates = _get_product_candidates_from_reference(reference)
    return candidates[0] if candidates else None


def _execute_product_report_action(
    *,
    actor,
    ticket: SupportTicket,
    action: str,
    notes: str = "",
    product_id=None,
    vendor_profile_id=None,
):
    if PRODUCT_REPORT_SUBJECT_TAG.lower() not in ticket.subject.lower():
        raise ValueError("This ticket is not a product report.")

    normalized_action = str(action or "").strip().lower()
    if normalized_action not in {"deactivate_product", "suspend_vendor", "resolve", "resolve_and_deactivate"}:
        raise ValueError("Unsupported moderation action.")

    action_result = {}

    if normalized_action in {"deactivate_product", "resolve_and_deactivate"}:
        target_product = _find_report_product(ticket, product_id=product_id)
        if not target_product:
            raise ValueError("Unable to identify a product to deactivate.")
        if target_product.is_active:
            target_product.is_active = False
            target_product.save(update_fields=["is_active", "updated_at"])
        action_result["product"] = _serialize_product_candidate(target_product)
        log_admin_activity(
            actor=actor,
            action="moderation.product.deactivate",
            description=f"Deactivated product #{target_product.id} from report ticket #{ticket.id}.",
            target_type="Product",
            target_id=str(target_product.id),
            metadata={"report_ticket_id": ticket.id},
        )

    if normalized_action == "suspend_vendor":
        target_vendor = None
        if vendor_profile_id:
            target_vendor = VendorProfile.objects.filter(id=vendor_profile_id).first()
        if not target_vendor:
            derived_product = _find_report_product(ticket, product_id=product_id)
            target_vendor = derived_product.vendor if derived_product else None
        if not target_vendor:
            raise ValueError("Unable to identify a vendor to suspend.")

        target_vendor.approval_status = "suspended"
        target_vendor.reviewed_by = actor
        target_vendor.reviewed_at = timezone.now()
        if notes:
            existing_note = (target_vendor.review_notes or "").strip()
            target_vendor.review_notes = f"{existing_note}\n[Moderation] {notes}".strip() if existing_note else f"[Moderation] {notes}"
        target_vendor.save(update_fields=["approval_status", "reviewed_by", "reviewed_at", "review_notes", "updated_at"])
        action_result["vendor"] = {
            "id": target_vendor.id,
            "store_name": target_vendor.store_name,
            "approval_status": target_vendor.approval_status,
        }
        log_admin_activity(
            actor=actor,
            action="moderation.vendor.suspend",
            description=f"Suspended vendor #{target_vendor.id} from report ticket #{ticket.id}.",
            target_type="VendorProfile",
            target_id=str(target_vendor.id),
            metadata={"report_ticket_id": ticket.id},
        )

    if normalized_action in {"resolve", "resolve_and_deactivate"}:
        ticket.status = "resolved"
        ticket.resolved_by = actor
        ticket.resolved_at = timezone.now()
        if notes:
            existing_notes = (ticket.admin_notes or "").strip()
            ticket.admin_notes = f"{existing_notes}\n{notes}".strip() if existing_notes else notes
        ticket.save(update_fields=["status", "resolved_by", "resolved_at", "admin_notes", "updated_at"])
        log_admin_activity(
            actor=actor,
            action="moderation.report.resolve",
            description=f"Resolved product report ticket #{ticket.id}.",
            target_type="SupportTicket",
            target_id=str(ticket.id),
            metadata={},
        )

    refreshed_payload = _parse_product_report_payload(ticket)
    candidates = [_serialize_product_candidate(product) for product in _get_product_candidates_from_reference(refreshed_payload["product_reference"])]

    return {
        "ticket": {
            "id": ticket.id,
            "status": ticket.status,
            "admin_notes": ticket.admin_notes or "",
            "resolved_at": ticket.resolved_at,
            "product_reference": refreshed_payload["product_reference"],
            "reason": refreshed_payload["reason"],
            "issue_details": refreshed_payload["issue_details"],
            "candidates": candidates,
            "primary_candidate": candidates[0] if candidates else None,
        },
        "result": action_result,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def help_center_content(request):
    query = request.query_params.get("q", "").strip()
    category = request.query_params.get("category", "").strip()
    entry_type = request.query_params.get("entry_type", "").strip()

    try:
        queryset = KnowledgeBaseEntry.objects.filter(is_published=True)

        if category:
            queryset = queryset.filter(category=category)
        if entry_type:
            queryset = queryset.filter(entry_type=entry_type)
        if query:
            queryset = queryset.filter(
                Q(title__icontains=query)
                | Q(short_answer__icontains=query)
                | Q(content__icontains=query)
            )

        serializer = KnowledgeBaseEntrySerializer(queryset.order_by("category", "entry_type", "sort_order", "title"), many=True)
        entries = serializer.data
        source = "database"
    except DatabaseError:
        entries = FALLBACK_HELP_ENTRIES
        source = "fallback"

    return Response(
        {
            "categories": support_category_choices_payload(),
            "entries": entries,
            "content_source": source,
            "support_contact": {
                "email": SUPPORT_EMAIL,
                "phone": SUPPORT_PHONE,
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@parser_classes([JSONParser, FormParser, MultiPartParser])
@permission_classes([AllowAny])
def submit_support_ticket(request):
    serializer = SupportTicketCreateSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    ticket = serializer.save()
    return Response(
        {
            "id": ticket.id,
            "status": ticket.status,
            "detail": "Support request submitted successfully. Our team will get back to you soon.",
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def newsletter_subscribe(request):
    serializer = NewsletterSubscriptionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    email = serializer.validated_data["email"]
    subscription, created = NewsletterSubscription.objects.get_or_create(
        email=email,
        defaults={"is_active": True},
    )

    was_reactivated = False
    if not created and not subscription.is_active:
        subscription.is_active = True
        subscription.save(update_fields=["is_active", "updated_at"])
        was_reactivated = True

    return Response(
        {
            "id": subscription.id,
            "email": subscription.email,
            "is_active": subscription.is_active,
            "detail": (
                "Subscription successful. You will now receive marketplace updates."
                if created or was_reactivated
                else "You are already subscribed."
            ),
        },
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsMarketplaceAdmin])
def admin_support_tickets(request):
    if not has_admin_permission(request.user, "support.view"):
        return Response({"detail": "Missing permission: support.view"}, status=status.HTTP_403_FORBIDDEN)

    queryset = SupportTicket.objects.select_related("user").annotate(
        message_count=Count("messages", distinct=True),
        attachment_count=Count("attachments", distinct=True),
    )

    status_filter = request.query_params.get("status", "").strip()
    query = request.query_params.get("q", "").strip()

    if status_filter:
        queryset = queryset.filter(status=status_filter)
    if query:
        queryset = queryset.filter(
            Q(name__icontains=query)
            | Q(email__icontains=query)
            | Q(subject__icontains=query)
            | Q(user__email__icontains=query)
            | Q(messages__content__icontains=query)
        ).distinct()

    serializer = SupportTicketListSerializer(queryset.order_by("-updated_at"), many=True, context={"request": request})
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["GET", "PATCH"])
@permission_classes([IsMarketplaceAdmin])
def admin_support_ticket_detail(request, ticket_id: int):
    if request.method == "GET" and not has_admin_permission(request.user, "support.view"):
        return Response({"detail": "Missing permission: support.view"}, status=status.HTTP_403_FORBIDDEN)
    if request.method == "PATCH" and not has_admin_permission(request.user, "support.reply"):
        return Response({"detail": "Missing permission: support.reply"}, status=status.HTTP_403_FORBIDDEN)

    try:
        ticket = SupportTicket.objects.select_related("user").prefetch_related("attachments").get(id=ticket_id)
    except SupportTicket.DoesNotExist:
        return Response({"detail": "Support ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        serializer = SupportTicketDetailSerializer(ticket, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = SupportTicketAdminUpdateSerializer(ticket, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    updated = serializer.save()
    log_admin_activity(
        actor=request.user,
        action="support.ticket.update",
        description=f"Updated support ticket #{updated.id}.",
        target_type="SupportTicket",
        target_id=str(updated.id),
        metadata={"status": updated.status},
    )
    return Response(SupportTicketDetailSerializer(updated, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsMarketplaceAdmin])
def admin_support_ticket_reply(request, ticket_id: int):
    if not has_admin_permission(request.user, "support.reply"):
        return Response({"detail": "Missing permission: support.reply"}, status=status.HTTP_403_FORBIDDEN)

    try:
        ticket = SupportTicket.objects.prefetch_related("attachments").get(id=ticket_id)
    except SupportTicket.DoesNotExist:
        return Response({"detail": "Support ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    serializer = SupportTicketReplySerializer(
        data=request.data,
        context={"request": request, "ticket": ticket},
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    log_admin_activity(
        actor=request.user,
        action="support.ticket.reply",
        description=f"Replied to support ticket #{ticket.id}.",
        target_type="SupportTicket",
        target_id=str(ticket.id),
        metadata={},
    )

    return Response(SupportTicketDetailSerializer(ticket, context={"request": request}).data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@permission_classes([IsMarketplaceAdmin])
def admin_help_center_entries(request):
    if request.method == "GET":
        if not (
            has_admin_permission(request.user, "support.view")
            or has_admin_permission(request.user, "helpcenter.manage")
        ):
            return Response(
                {"detail": "Missing permission: support.view or helpcenter.manage"},
                status=status.HTTP_403_FORBIDDEN,
            )
        queryset = KnowledgeBaseEntry.objects.all()

        query = request.query_params.get("q", "").strip()
        category = request.query_params.get("category", "").strip()
        entry_type = request.query_params.get("entry_type", "").strip()

        if category:
            queryset = queryset.filter(category=category)
        if entry_type:
            queryset = queryset.filter(entry_type=entry_type)
        if query:
            queryset = queryset.filter(Q(title__icontains=query) | Q(content__icontains=query))

        serializer = KnowledgeBaseEntrySerializer(queryset.order_by("category", "entry_type", "sort_order", "title"), many=True)
        return Response(
            {
                "categories": support_category_choices_payload(),
                "entries": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    if not has_admin_permission(request.user, "helpcenter.manage"):
        return Response({"detail": "Missing permission: helpcenter.manage"}, status=status.HTTP_403_FORBIDDEN)

    serializer = KnowledgeBaseEntrySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    created = serializer.save()
    log_admin_activity(
        actor=request.user,
        action="help_center.create",
        description=f"Created help center entry '{created.title}'.",
        target_type="KnowledgeBaseEntry",
        target_id=str(created.id),
        metadata={"category": created.category, "entry_type": created.entry_type},
    )
    return Response(KnowledgeBaseEntrySerializer(created).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsMarketplaceAdmin])
def admin_help_center_entry_detail(request, entry_id: int):
    if not has_admin_permission(request.user, "helpcenter.manage"):
        return Response({"detail": "Missing permission: helpcenter.manage"}, status=status.HTTP_403_FORBIDDEN)

    try:
        entry = KnowledgeBaseEntry.objects.get(id=entry_id)
    except KnowledgeBaseEntry.DoesNotExist:
        return Response({"detail": "Knowledge base entry not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        entry_title = entry.title
        entry.delete()
        log_admin_activity(
            actor=request.user,
            action="help_center.delete",
            description=f"Deleted help center entry '{entry_title}'.",
            target_type="KnowledgeBaseEntry",
            target_id=str(entry_id),
            metadata={},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = KnowledgeBaseEntrySerializer(entry, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    updated = serializer.save()
    log_admin_activity(
        actor=request.user,
        action="help_center.update",
        description=f"Updated help center entry '{updated.title}'.",
        target_type="KnowledgeBaseEntry",
        target_id=str(updated.id),
        metadata={"is_published": updated.is_published},
    )
    return Response(KnowledgeBaseEntrySerializer(updated).data, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsMarketplaceAdmin])
def admin_product_reports(request):
    if not has_admin_permission(request.user, "moderation.manage"):
        return Response({"detail": "Missing permission: moderation.manage"}, status=status.HTTP_403_FORBIDDEN)

    status_filter = request.query_params.get("status", "").strip()
    query = request.query_params.get("q", "").strip()

    queryset = (
        SupportTicket.objects.select_related("user")
        .prefetch_related("messages", "attachments")
        .filter(subject__icontains=PRODUCT_REPORT_SUBJECT_TAG)
    )

    if status_filter:
        queryset = queryset.filter(status=status_filter)
    if query:
        queryset = queryset.filter(
            Q(subject__icontains=query)
            | Q(name__icontains=query)
            | Q(email__icontains=query)
            | Q(messages__content__icontains=query)
        ).distinct()

    reports = []
    for ticket in queryset.order_by("-updated_at"):
        parsed = _parse_product_report_payload(ticket)
        candidates = [_serialize_product_candidate(product) for product in _get_product_candidates_from_reference(parsed["product_reference"])]
        attachments = []
        for attachment in ticket.attachments.all():
            file_url = ""
            if attachment.file:
                file_url = request.build_absolute_uri(attachment.file.url)
            attachments.append(
                {
                    "id": attachment.id,
                    "original_name": attachment.original_name,
                    "file_url": file_url,
                    "created_at": attachment.created_at,
                }
            )

        reports.append(
            {
                "id": ticket.id,
                "subject": ticket.subject,
                "status": ticket.status,
                "name": ticket.name,
                "email": ticket.email,
                "user_email": ticket.user.email if ticket.user else "",
                "admin_notes": ticket.admin_notes or "",
                "created_at": ticket.created_at,
                "updated_at": ticket.updated_at,
                "resolved_at": ticket.resolved_at,
                "reporter_name": parsed["reporter_name"],
                "reporter_email": parsed["reporter_email"],
                "product_reference": parsed["product_reference"],
                "reason": parsed["reason"],
                "issue_details": parsed["issue_details"],
                "attachments": attachments,
                "candidates": candidates,
                "primary_candidate": candidates[0] if candidates else None,
            }
        )

    return Response(reports, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsMarketplaceAdmin])
def admin_product_report_action(request, ticket_id: int):
    if not has_admin_permission(request.user, "moderation.manage"):
        return Response({"detail": "Missing permission: moderation.manage"}, status=status.HTTP_403_FORBIDDEN)

    try:
        ticket = SupportTicket.objects.select_related("user").prefetch_related("messages", "attachments").get(id=ticket_id)
    except SupportTicket.DoesNotExist:
        return Response({"detail": "Report ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    action = str(request.data.get("action", "")).strip().lower()
    notes = str(request.data.get("notes", "")).strip()
    product_id = request.data.get("product_id")
    vendor_profile_id = request.data.get("vendor_profile_id")

    try:
        payload = _execute_product_report_action(
            actor=request.user,
            ticket=ticket,
            action=action,
            notes=notes,
            product_id=product_id,
            vendor_profile_id=vendor_profile_id,
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        {
            "detail": "Moderation action completed.",
            "ticket": payload["ticket"],
            "result": payload["result"],
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsMarketplaceAdmin])
def admin_product_report_bulk_action(request):
    if not has_admin_permission(request.user, "moderation.manage"):
        return Response({"detail": "Missing permission: moderation.manage"}, status=status.HTTP_403_FORBIDDEN)

    action = str(request.data.get("action", "")).strip().lower()
    notes = str(request.data.get("notes", "")).strip()
    ticket_ids_raw = request.data.get("ticket_ids", [])
    confirm_suspend = bool(request.data.get("confirm_suspend", False))

    if action not in {"deactivate_product", "resolve", "resolve_and_deactivate", "suspend_vendor"}:
        return Response({"detail": "Unsupported bulk moderation action."}, status=status.HTTP_400_BAD_REQUEST)
    if action == "suspend_vendor" and not confirm_suspend:
        return Response(
            {"detail": "Bulk vendor suspension requires explicit confirmation."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not isinstance(ticket_ids_raw, list) or not ticket_ids_raw:
        return Response({"detail": "ticket_ids must be a non-empty list."}, status=status.HTTP_400_BAD_REQUEST)

    ticket_ids = []
    for value in ticket_ids_raw:
        try:
            ticket_ids.append(int(value))
        except (TypeError, ValueError):
            continue
    ticket_ids = list(dict.fromkeys(ticket_ids))

    if not ticket_ids:
        return Response({"detail": "No valid ticket IDs were provided."}, status=status.HTTP_400_BAD_REQUEST)
    if len(ticket_ids) > 200:
        return Response({"detail": "Bulk moderation is limited to 200 reports per request."}, status=status.HTTP_400_BAD_REQUEST)

    ticket_by_id = {
        ticket.id: ticket
        for ticket in SupportTicket.objects.select_related("user").prefetch_related("messages", "attachments").filter(id__in=ticket_ids)
    }

    successes = []
    failures = []

    for ticket_id in ticket_ids:
        ticket = ticket_by_id.get(ticket_id)
        if not ticket:
            failures.append({"ticket_id": ticket_id, "error": "Report ticket not found."})
            continue
        try:
            payload = _execute_product_report_action(
                actor=request.user,
                ticket=ticket,
                action=action,
                notes=notes,
                product_id=None,
                vendor_profile_id=None,
            )
            successes.append({"ticket_id": ticket_id, "ticket": payload["ticket"], "result": payload["result"]})
        except ValueError as exc:
            failures.append({"ticket_id": ticket_id, "error": str(exc)})

    return Response(
        {
            "detail": "Bulk moderation completed.",
            "processed_count": len(ticket_ids),
            "success_count": len(successes),
            "failure_count": len(failures),
            "successes": successes,
            "failures": failures,
        },
        status=status.HTTP_200_OK,
    )
