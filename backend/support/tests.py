from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import KnowledgeBaseEntry, NewsletterSubscription, SupportTicket

User = get_user_model()


class SupportPublicApiTests(APITestCase):
    def setUp(self):
        KnowledgeBaseEntry.objects.create(
            title="How do I track my order?",
            category="orders",
            entry_type="faq",
            short_answer="Use Track Your Order and enter your order number.",
            content="Go to Track Your Order page and submit your order details.",
            sort_order=1,
            is_published=True,
        )
        KnowledgeBaseEntry.objects.create(
            title="How to request a return",
            category="returns",
            entry_type="guide",
            short_answer="Use your account orders page.",
            content="Open account > orders > request return.",
            sort_order=2,
            is_published=True,
        )

    def test_help_center_returns_entries(self):
        response = self.client.get("/api/support/help-center/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("entries", response.data)
        self.assertGreaterEqual(len(response.data["entries"]), 2)

    def test_contact_creates_ticket(self):
        payload = {
            "name": "Jane Doe",
            "email": "jane@example.com",
            "subject": "Need order support",
            "message": "Please help me track my order.",
        }
        response = self.client.post("/api/support/contact/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(SupportTicket.objects.count(), 1)
        ticket = SupportTicket.objects.first()
        self.assertEqual(ticket.subject, payload["subject"])
        self.assertEqual(ticket.messages.count(), 1)

    def test_newsletter_subscription_creates_and_deduplicates_email(self):
        payload = {"email": "shopper@example.com"}
        first_response = self.client.post("/api/support/newsletter/", payload, format="json")
        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(NewsletterSubscription.objects.count(), 1)

        second_response = self.client.post("/api/support/newsletter/", payload, format="json")
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(NewsletterSubscription.objects.count(), 1)


class SupportAdminApiTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            email="admin@example.com",
            password="AdminPass123!",
            first_name="Admin",
            last_name="User",
            role="admin",
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin_user)

        self.ticket = SupportTicket.objects.create(
            name="Client One",
            email="client@example.com",
            subject="Payment issue",
        )
        self.ticket.messages.create(
            sender_type="user",
            sender_email="client@example.com",
            content="My payment failed.",
        )

    def test_admin_can_list_and_reply_to_tickets(self):
        list_response = self.client.get("/api/support/admin/tickets/")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(list_response.data), 1)

        reply_response = self.client.post(
            f"/api/support/admin/tickets/{self.ticket.id}/reply/",
            {"message": "We are checking this now.", "status": "in_progress"},
            format="json",
        )
        self.assertEqual(reply_response.status_code, status.HTTP_200_OK)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, "in_progress")
        self.assertEqual(self.ticket.messages.count(), 2)

    def test_admin_can_manage_help_center_entries(self):
        create_response = self.client.post(
            "/api/support/admin/help-center/entries/",
            {
                "title": "How to update my account",
                "category": "account",
                "entry_type": "faq",
                "short_answer": "Go to account settings.",
                "content": "Navigate to account page and update your profile.",
                "is_published": True,
                "sort_order": 1,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        entry_id = create_response.data["id"]

        patch_response = self.client.patch(
            f"/api/support/admin/help-center/entries/{entry_id}/",
            {"is_published": False},
            format="json",
        )
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
