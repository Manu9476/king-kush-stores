from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from orders.models import Order, OrderItem, ShippingAddress
from users.models import VendorProfile

from .models import Category, Product, ProductReview, ProductReviewComment

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


class ProductReviewApiTests(APITestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Groceries")
        self.customer = User.objects.create_user(
            email="customer@example.com",
            password="StrongPassword123!",
            role="customer",
            first_name="Mary",
            last_name="Shopper",
        )
        self.vendor_user = User.objects.create_user(
            email="vendor@example.com",
            password="StrongPassword123!",
            role="vendor",
            first_name="Vendor",
            last_name="Owner",
        )
        self.vendor_profile = VendorProfile.objects.create(
            user=self.vendor_user,
            store_name="Trusted Store",
            approval_status="approved",
        )
        self.product = Product.objects.create(
            vendor=self.vendor_profile,
            category=self.category,
            title="Jogoo Flour",
            description="Household flour",
            price="90.00",
            stock=50,
            is_active=True,
        )
        self.address = ShippingAddress.objects.create(
            user=self.customer,
            full_name="Mary Shopper",
            phone_number="0700000000",
            address_line_1="Nairobi West",
            city="Nairobi",
            country="Kenya",
        )
        self.order = Order.objects.create(
            user=self.customer,
            shipping_address=self.address,
            total_amount="90.00",
            status="Delivered",
            is_paid=True,
        )
        self.order_item = OrderItem.objects.create(
            order=self.order,
            product=self.product,
            price_at_purchase="90.00",
            quantity=1,
        )

    def test_customer_can_create_review_for_purchased_product(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.post(
            f"/api/products/{self.product.id}/reviews/",
            {"rating": 5, "title": "Excellent", "content": "Very good quality flour."},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ProductReview.objects.filter(product=self.product, user=self.customer).count(), 1)

    def test_customer_can_comment_on_review(self):
        review = ProductReview.objects.create(
            product=self.product,
            user=self.customer,
            order_item=self.order_item,
            author_name="Mary Shopper",
            rating=4,
            title="Good",
            content="Nice quality.",
            is_verified_purchase=True,
            is_approved=True,
        )
        self.client.force_authenticate(user=self.customer)
        response = self.client.post(
            f"/api/products/reviews/{review.id}/comments/",
            {"content": "I agree with this review."},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ProductReviewComment.objects.filter(review=review).count(), 1)

    def test_admin_can_list_reviews(self):
        admin = User.objects.create_user(
            email="admin@example.com",
            password="StrongPassword123!",
            role="admin",
            first_name="Admin",
            last_name="User",
            is_staff=True,
        )
        ProductReview.objects.create(
            product=self.product,
            user=self.customer,
            order_item=self.order_item,
            author_name="Mary Shopper",
            rating=4,
            title="Good",
            content="Nice quality.",
            is_verified_purchase=True,
            is_approved=True,
        )
        self.client.force_authenticate(user=admin)
        response = self.client.get("/api/products/admin/reviews/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)
