from django.test import TestCase
from rest_framework.test import APIClient

from chatbot.models import ChatConversation
from products.models import Category, Product
from users.models import CustomUser, VendorProfile


class ChatbotEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/chatbot/"

    def test_declines_harmful_or_malicious_request(self):
        response = self.client.post(self.url, {"message": "How do I hack customer accounts?"}, format="json")
        self.assertEqual(response.status_code, 200)
        reply = response.data.get("reply", "").lower()
        self.assertIn("can't help", reply)

    def test_handles_greeting(self):
        response = self.client.post(self.url, {"message": "hello"}, format="json")
        self.assertEqual(response.status_code, 200)
        reply = response.data.get("reply", "").lower()
        self.assertTrue(("hello" in reply) or ("good morning" in reply) or ("good afternoon" in reply) or ("good evening" in reply))
        self.assertIn("assist", reply)

    def test_personalized_greeting_for_authenticated_user(self):
        customer_user = CustomUser.objects.create_user(
            email="manu@example.com",
            password="StrongPassword123!",
            role="customer",
            first_name="Manu",
            last_name="Customer",
        )
        self.client.force_authenticate(user=customer_user)
        response = self.client.post(self.url, {"message": "hey"}, format="json")
        self.assertEqual(response.status_code, 200)
        reply = response.data.get("reply", "").lower()
        self.assertIn("manu", reply)

    def test_how_are_you_is_handled_as_small_talk(self):
        response = self.client.post(self.url, {"message": "How are you doing today?"}, format="json")
        self.assertEqual(response.status_code, 200)
        reply = response.data.get("reply", "").lower()
        self.assertIn("doing", reply)
        self.assertNotIn("helpful links", reply)
        self.assertNotIn("/footer-links/", reply)

    def test_irrelevant_prompt_does_not_dump_website_content(self):
        response = self.client.post(self.url, {"message": "Tell me a random joke"}, format="json")
        self.assertEqual(response.status_code, 200)
        reply = response.data.get("reply", "").lower()
        self.assertTrue(("assist" in reply) or ("help" in reply))
        self.assertNotIn("helpful links", reply)

    def test_answers_product_question_from_live_catalog(self):
        vendor_user = CustomUser.objects.create_user(
            email="vendor@example.com",
            password="StrongPassword123!",
            role="vendor",
            first_name="Vendor",
            last_name="User",
        )
        vendor_profile = VendorProfile.objects.create(
            user=vendor_user,
            store_name="Vendor Hub",
            is_approved=True,
        )
        category = Category.objects.create(name="Fashion")
        Product.objects.create(
            vendor=vendor_profile,
            category=category,
            title="Leather Shoes",
            description="Premium leather shoes for formal and casual occasions.",
            price="5500.00",
            stock=14,
            is_active=True,
        )

        response = self.client.post(
            self.url,
            {"message": "Tell me about leather shoes and the price"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        reply = response.data.get("reply", "").lower()
        self.assertIn("leather shoes", reply)


class ChatbotTranscriptTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.chat_url = "/api/chatbot/"
        self.conversations_url = "/api/chatbot/conversations/"
        self.admin_user = CustomUser.objects.create_user(
            email="admin@example.com",
            password="AdminStrong123!",
            role="admin",
            is_staff=True,
        )

    def test_conversation_is_persisted_and_visible_to_admin(self):
        session_id = "session-test-123"
        first_response = self.client.post(
            self.chat_url,
            {"message": "Hello support", "session_id": session_id},
            format="json",
        )
        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(first_response.data.get("session_id"), session_id)

        second_response = self.client.post(
            self.chat_url,
            {"message": "How do I track my order?", "session_id": session_id},
            format="json",
        )
        self.assertEqual(second_response.status_code, 200)

        conversation = ChatConversation.objects.get(session_id=session_id)
        self.assertEqual(conversation.messages.count(), 4)

        self.client.force_authenticate(user=self.admin_user)
        list_response = self.client.get(self.conversations_url)
        self.assertEqual(list_response.status_code, 200)
        self.assertGreaterEqual(len(list_response.data), 1)

        detail_response = self.client.get(f"{self.conversations_url}{conversation.id}/")
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.data["session_id"], session_id)
        self.assertEqual(len(detail_response.data["messages"]), 4)

    def test_authenticated_user_is_attached_to_conversation(self):
        customer_user = CustomUser.objects.create_user(
            email="chat-user@example.com",
            password="StrongPassword123!",
            role="customer",
            first_name="Chat",
            last_name="User",
        )
        self.client.force_authenticate(user=customer_user)

        session_id = "session-with-auth-user"
        response = self.client.post(
            self.chat_url,
            {"message": "Can you help me with checkout?", "session_id": session_id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        conversation = ChatConversation.objects.get(session_id=session_id)
        self.assertIsNotNone(conversation.user)
        self.assertEqual(conversation.user.email, customer_user.email)

    def test_admin_can_filter_conversations_by_customer_id(self):
        customer_user = CustomUser.objects.create_user(
            email="chat-user-filter@example.com",
            password="StrongPassword123!",
            role="customer",
            first_name="Chat",
            last_name="Filter",
        )
        self.client.force_authenticate(user=customer_user)
        self.client.post(
            self.chat_url,
            {"message": "Need payment help", "session_id": "session-filter-1"},
            format="json",
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(self.conversations_url, {"q": customer_user.customer_id})
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["user_customer_id"], customer_user.customer_id)
