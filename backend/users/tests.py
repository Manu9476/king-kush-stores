from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import CustomUser
from .models import StaffAssignment, StaffRole, VendorProfile


class CustomUserModelTests(TestCase):
    def test_customer_id_is_auto_generated(self):
        user = CustomUser.objects.create_user(
            email="customer1@example.com",
            password="StrongPassword123!",
            role="customer",
            first_name="Cust",
            last_name="One",
        )
        self.assertIsNotNone(user.customer_id)
        self.assertTrue(user.customer_id.startswith("CUS-"))
        self.assertGreaterEqual(len(user.customer_id), 8)

    def test_customer_id_is_unique(self):
        first = CustomUser.objects.create_user(
            email="customer2@example.com",
            password="StrongPassword123!",
            role="customer",
            first_name="Cust",
            last_name="Two",
        )
        second = CustomUser.objects.create_user(
            email="customer3@example.com",
            password="StrongPassword123!",
            role="customer",
            first_name="Cust",
            last_name="Three",
        )
        self.assertNotEqual(first.customer_id, second.customer_id)


class UserProfileApiTests(APITestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user(
            email="profile@example.com",
            password="StrongPassword123!",
            role="customer",
            first_name="Profile",
            last_name="Owner",
        )
        self.client.force_authenticate(user=self.user)

    def test_get_me_returns_profile(self):
        response = self.client.get(reverse("user-me"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "profile@example.com")
        self.assertIn("customer_id", response.data)

    def test_patch_me_updates_allowed_fields(self):
        response = self.client.patch(
            reverse("user-me"),
            data={
                "first_name": "Updated",
                "phone_number": "0712345678",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Updated")
        self.assertEqual(self.user.phone_number, "0712345678")


class VendorApprovalWorkflowTests(APITestCase):
    def test_vendor_registration_creates_pending_vendor_profile(self):
        response = self.client.post(
            reverse("register"),
            data={
                "first_name": "Vendor",
                "last_name": "Applicant",
                "email": "vendor-applicant@example.com",
                "phone_number": "0712000000",
                "password": "StrongPassword123!",
                "password_confirm": "StrongPassword123!",
                "role": "vendor",
                "business_name": "Applicant Store",
                "business_description": "Selling electronics",
                "business_email": "sales@applicantstore.com",
                "business_phone": "0712555555",
                "business_location": "Nairobi",
                "product_category": "Electronics",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = CustomUser.objects.get(email="vendor-applicant@example.com")
        self.assertEqual(user.role, "vendor")
        self.assertTrue(hasattr(user, "vendor_profile"))
        self.assertEqual(user.vendor_profile.approval_status, "pending_review")
        self.assertFalse(user.vendor_profile.is_approved)

    def test_admin_can_approve_vendor_application(self):
        vendor_user = CustomUser.objects.create_user(
            email="vendor-pending-approval@example.com",
            password="StrongPassword123!",
            role="vendor",
            first_name="Vendor",
            last_name="Pending",
        )
        vendor_profile = VendorProfile.objects.create(
            user=vendor_user,
            store_name="Pending Vendor Store",
            approval_status="pending_review",
        )
        admin_user = CustomUser.objects.create_user(
            email="market-admin@example.com",
            password="StrongPassword123!",
            role="admin",
            is_staff=True,
            first_name="Market",
            last_name="Admin",
        )
        self.client.force_authenticate(user=admin_user)

        response = self.client.patch(
            reverse("admin-vendor-application-detail", kwargs={"vendor_profile_id": vendor_profile.id}),
            data={"approval_status": "approved", "review_notes": "Approved after review."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        vendor_profile.refresh_from_db()
        self.assertEqual(vendor_profile.approval_status, "approved")
        self.assertTrue(vendor_profile.is_approved)


class VendorApprovalRbacTests(APITestCase):
    def setUp(self):
        self.vendor_user = CustomUser.objects.create_user(
            email="vendor-rbac-pending@example.com",
            password="StrongPassword123!",
            role="vendor",
            first_name="Pending",
            last_name="Vendor",
        )
        self.vendor_profile = VendorProfile.objects.create(
            user=self.vendor_user,
            store_name="RBAC Pending Vendor Store",
            approval_status="pending_review",
        )

        self.staff_view_only = CustomUser.objects.create_user(
            email="staff-vendors-view@example.com",
            password="StrongPassword123!",
            role="admin",
            admin_level="staff",
            is_staff=True,
        )
        self.staff_with_approve = CustomUser.objects.create_user(
            email="staff-vendors-approve@example.com",
            password="StrongPassword123!",
            role="admin",
            admin_level="staff",
            is_staff=True,
        )

        view_role = StaffRole.objects.create(
            name="Vendors View Role",
            slug="vendors-view-role",
            permissions=["dashboard.view", "vendors.view"],
            is_active=True,
        )
        approve_role = StaffRole.objects.create(
            name="Vendors Approve Role",
            slug="vendors-approve-role",
            permissions=["dashboard.view", "vendors.view", "vendors.approve"],
            is_active=True,
        )
        StaffAssignment.objects.create(user=self.staff_view_only, role=view_role, is_active=True)
        StaffAssignment.objects.create(user=self.staff_with_approve, role=approve_role, is_active=True)

    def test_staff_without_vendors_approve_cannot_review_vendor(self):
        self.client.force_authenticate(user=self.staff_view_only)
        response = self.client.patch(
            reverse("admin-vendor-application-detail", kwargs={"vendor_profile_id": self.vendor_profile.id}),
            data={"approval_status": "approved", "review_notes": "Attempt without approval permission"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_with_vendors_approve_can_review_vendor(self):
        self.client.force_authenticate(user=self.staff_with_approve)
        response = self.client.patch(
            reverse("admin-vendor-application-detail", kwargs={"vendor_profile_id": self.vendor_profile.id}),
            data={"approval_status": "approved", "review_notes": "Approved with proper permission"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.vendor_profile.refresh_from_db()
        self.assertEqual(self.vendor_profile.approval_status, "approved")
