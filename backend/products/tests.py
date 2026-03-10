from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import VendorProfile

from .models import Category, Product

User = get_user_model()


class VendorProductApiTests(APITestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Electronics")
        self.vendor_user = User.objects.create_user(
            email="vendor-approved@example.com",
            password="StrongPassword123!",
            role="vendor",
            first_name="Vendor",
            last_name="Approved",
        )
        self.pending_vendor_user = User.objects.create_user(
            email="vendor-pending@example.com",
            password="StrongPassword123!",
            role="vendor",
            first_name="Vendor",
            last_name="Pending",
        )
        self.vendor_profile = VendorProfile.objects.create(
            user=self.vendor_user,
            store_name="Approved Store",
            approval_status="approved",
        )
        VendorProfile.objects.create(
            user=self.pending_vendor_user,
            store_name="Pending Store",
            approval_status="pending_review",
        )

    def test_approved_vendor_can_create_product(self):
        self.client.force_authenticate(user=self.vendor_user)
        response = self.client.post(
            "/api/products/vendor/products/",
            data={
                "title": "Vendor Product",
                "description": "High quality product",
                "price": "1299.00",
                "stock": 5,
                "category_id": self.category.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Product.objects.count(), 1)

    def test_pending_vendor_cannot_create_product(self):
        self.client.force_authenticate(user=self.pending_vendor_user)
        response = self.client.post(
            "/api/products/vendor/products/",
            data={
                "title": "Blocked Product",
                "description": "Should not be created",
                "price": "500.00",
                "stock": 2,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Product.objects.count(), 0)

    def test_public_product_list_excludes_inactive_and_unapproved_vendor_products(self):
        Product.objects.create(
            vendor=self.vendor_profile,
            category=self.category,
            title="Visible Product",
            description="visible",
            price="1000.00",
            stock=10,
            is_active=True,
        )
        pending_profile = self.pending_vendor_user.vendor_profile
        Product.objects.create(
            vendor=pending_profile,
            category=self.category,
            title="Hidden Product",
            description="hidden",
            price="700.00",
            stock=3,
            is_active=True,
        )

        response = self.client.get("/api/products/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [item["title"] for item in response.data]
        self.assertIn("Visible Product", titles)
        self.assertNotIn("Hidden Product", titles)
