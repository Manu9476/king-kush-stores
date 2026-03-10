from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from products.models import Product
from users.models import StaffAssignment, StaffRole, VendorProfile

from .models import Order, PaymentMethod, ShippingAddress, VendorOrder, VendorWallet

User = get_user_model()


class OrderDashboardApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="customer@example.com",
            password="testpassword123",
            first_name="Test",
            last_name="Customer",
        )
        self.other_user = User.objects.create_user(
            email="other@example.com",
            password="testpassword123",
            first_name="Other",
            last_name="User",
        )

        self.address = ShippingAddress.objects.create(
            user=self.user,
            full_name="Test Customer",
            phone_number="0712345678",
            address_line_1="Street 1",
            city="Nairobi",
            country="Kenya",
            is_default=True,
        )
        self.other_address = ShippingAddress.objects.create(
            user=self.other_user,
            full_name="Other User",
            phone_number="0799999999",
            address_line_1="Street 99",
            city="Mombasa",
            country="Kenya",
            is_default=True,
        )

        self.my_order = Order.objects.create(
            user=self.user,
            shipping_address=self.address,
            total_amount="1200.00",
            status="Pending",
        )
        self.other_order = Order.objects.create(
            user=self.other_user,
            shipping_address=self.other_address,
            total_amount="990.00",
            status="Pending",
        )

    def test_get_my_orders_returns_only_authenticated_user_orders(self):
        self.client.force_authenticate(user=self.user)
        url = reverse("order-my-list")

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], self.my_order.id)
        self.assertNotEqual(response.data[0]["id"], self.other_order.id)

    def test_track_my_order_returns_own_order(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(reverse("order-track-my-order", kwargs={"order_number": self.my_order.order_number}))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["order_number"], self.my_order.order_number)

    def test_track_my_order_does_not_return_other_users_order(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(reverse("order-track-my-order", kwargs={"order_number": self.other_order.order_number}))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cancel_my_order_updates_status_for_pending_order(self):
        self.client.force_authenticate(user=self.user)
        url = reverse("order-cancel", kwargs={"order_id": self.my_order.id})

        response = self.client.patch(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.my_order.refresh_from_db()
        self.assertEqual(self.my_order.status, "Cancelled")

    def test_cancel_my_order_rejects_shipped_order(self):
        self.client.force_authenticate(user=self.user)
        self.my_order.status = "Shipped"
        self.my_order.save(update_fields=["status"])
        url = reverse("order-cancel", kwargs={"order_id": self.my_order.id})

        response = self.client.patch(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.my_order.refresh_from_db()
        self.assertEqual(self.my_order.status, "Shipped")

    def test_shipping_addresses_first_address_auto_becomes_default(self):
        new_user = User.objects.create_user(
            email="newcustomer@example.com",
            password="testpassword123",
            first_name="New",
            last_name="Customer",
        )
        self.client.force_authenticate(user=new_user)

        response = self.client.post(
            reverse("shipping-addresses"),
            data={
                "full_name": "First Address",
                "phone_number": "0700000000",
                "address_line_1": "Address One",
                "city": "Nairobi",
                "country": "Kenya",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["is_default"])

    def test_shipping_addresses_can_switch_default(self):
        self.client.force_authenticate(user=self.user)
        second_address = ShippingAddress.objects.create(
            user=self.user,
            full_name="Office",
            phone_number="0711111111",
            address_line_1="Business Street",
            city="Nairobi",
            country="Kenya",
            is_default=False,
        )

        response = self.client.patch(
            reverse("shipping-address-detail", kwargs={"address_id": second_address.id}),
            data={"is_default": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.address.refresh_from_db()
        second_address.refresh_from_db()
        self.assertFalse(self.address.is_default)
        self.assertTrue(second_address.is_default)

    def test_create_card_payment_method(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            reverse("payment-methods"),
            data={
                "method_type": "card",
                "provider": "Visa",
                "cardholder_name": "Test Customer",
                "card_number": "4111 1111 1111 1111",
                "card_expiry": "12/30",
                "billing_email": "customer@example.com",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["method_type"], "card")
        self.assertEqual(response.data["card_last4"], "1111")
        self.assertTrue(response.data["is_default"])

    def test_create_mpesa_payment_method(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            reverse("payment-methods"),
            data={
                "method_type": "mpesa",
                "mpesa_phone": "0712345678",
                "billing_email": "customer@example.com",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["method_type"], "mpesa")
        self.assertIn("*", response.data["mpesa_phone_masked"])

    def test_payment_methods_switch_default(self):
        self.client.force_authenticate(user=self.user)
        first = PaymentMethod.objects.create(
            user=self.user,
            method_type="card",
            provider="Visa",
            cardholder_name="Test User",
            card_last4="4242",
            card_expiry_month=12,
            card_expiry_year=2030,
            billing_email="customer@example.com",
            is_default=True,
        )
        second = PaymentMethod.objects.create(
            user=self.user,
            method_type="mpesa",
            provider="M-Pesa",
            mpesa_phone_masked="07******78",
            billing_email="customer@example.com",
            is_default=False,
        )

        response = self.client.patch(
            reverse("payment-method-detail", kwargs={"payment_method_id": second.id}),
            data={"is_default": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertFalse(first.is_default)
        self.assertTrue(second.is_default)


class MarketplacePaymentFlowTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(
            email="buyer@example.com",
            password="buyer1234",
            first_name="Buyer",
            last_name="One",
            role="customer",
        )
        self.vendor_user = User.objects.create_user(
            email="vendor@example.com",
            password="vendor1234",
            first_name="Vendor",
            last_name="One",
            role="vendor",
        )
        self.vendor_profile = VendorProfile.objects.create(
            user=self.vendor_user,
            store_name="Vendor One Store",
            approval_status="approved",
        )
        self.product = Product.objects.create(
            vendor=self.vendor_profile,
            category=None,
            title="Vendor Product",
            description="Product description",
            price="1000.00",
            stock=10,
            is_active=True,
        )

    def test_mpesa_confirm_creates_vendor_split_and_releases_wallet_balance(self):
        self.client.force_authenticate(user=self.customer)

        create_response = self.client.post(
            reverse("order-create"),
            data={
                "full_name": "Buyer One",
                "phone_number": "0712345678",
                "address_line_1": "Nairobi street",
                "city": "Nairobi",
                "country": "Kenya",
                "items": [{"product_id": self.product.id, "quantity": 1}],
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        order_id = create_response.data["id"]

        initiate_response = self.client.post(
            reverse("order-payment-mpesa-initiate"),
            data={"order_id": order_id, "phone_number": "0712345678"},
            format="json",
        )
        self.assertEqual(initiate_response.status_code, status.HTTP_201_CREATED)
        payment_id = initiate_response.data["payment"]["id"]

        confirm_response = self.client.post(
            reverse("order-payment-mpesa-mock-confirm", kwargs={"payment_id": payment_id}),
            format="json",
        )
        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)
        self.assertEqual(confirm_response.data["status"], "confirmed")

        order = Order.objects.get(id=order_id)
        self.assertTrue(order.is_paid)
        self.assertEqual(order.status, "Processing")

        vendor_order = VendorOrder.objects.get(order=order, vendor=self.vendor_profile)
        self.assertEqual(str(vendor_order.gross_amount), "1000.00")
        self.assertEqual(str(vendor_order.platform_commission_amount), "100.00")
        self.assertEqual(str(vendor_order.vendor_earning_amount), "900.00")

        wallet = VendorWallet.objects.get(vendor=self.vendor_profile)
        self.assertEqual(str(wallet.available_balance), "900.00")
        self.assertEqual(str(wallet.pending_balance), "0.00")

    def test_vendor_payout_is_auto_processed_without_admin_review(self):
        # First confirm payment to fund vendor wallet.
        self.client.force_authenticate(user=self.customer)
        create_response = self.client.post(
            reverse("order-create"),
            data={
                "full_name": "Buyer One",
                "phone_number": "0712345678",
                "address_line_1": "Nairobi street",
                "city": "Nairobi",
                "country": "Kenya",
                "items": [{"product_id": self.product.id, "quantity": 1}],
            },
            format="json",
        )
        order_id = create_response.data["id"]
        initiate_response = self.client.post(
            reverse("order-payment-mpesa-initiate"),
            data={"order_id": order_id, "phone_number": "0712345678"},
            format="json",
        )
        payment_id = initiate_response.data["payment"]["id"]
        self.client.post(reverse("order-payment-mpesa-mock-confirm", kwargs={"payment_id": payment_id}), format="json")

        self.client.force_authenticate(user=self.vendor_user)
        payout_response = self.client.post(
            reverse("vendor-payout-requests"),
            data={"amount": "500.00", "phone_number": "0712345678", "notes": "Withdraw part of earnings"},
            format="json",
        )
        self.assertEqual(payout_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(payout_response.data["status"], "paid")

        wallet = VendorWallet.objects.get(vendor=self.vendor_profile)
        self.assertEqual(str(wallet.available_balance), "400.00")

    def test_admin_finance_summary_includes_merchant_balance(self):
        self.customer.role = "admin"
        self.customer.admin_level = "super_admin"
        self.customer.is_staff = True
        self.customer.is_superuser = True
        self.customer.save(update_fields=["role", "admin_level", "is_staff", "is_superuser"])
        self.client.force_authenticate(user=self.customer)

        response = self.client.get(reverse("order-admin-finance-summary"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        totals = response.data.get("totals", {})
        self.assertIn("merchant_account_balance", totals)
        self.assertIn("vendor_wallet_available_liability", totals)
        self.assertIn("vendor_wallet_pending_liability", totals)


class AdminFinanceRbacTests(APITestCase):
    def setUp(self):
        self.super_admin = User.objects.create_user(
            email="superadmin-rbac@example.com",
            password="StrongPassword123!",
            role="admin",
            admin_level="super_admin",
            is_staff=True,
        )
        self.staff_no_finance = User.objects.create_user(
            email="staff-no-finance@example.com",
            password="StrongPassword123!",
            role="admin",
            admin_level="staff",
            is_staff=True,
        )
        self.staff_with_finance = User.objects.create_user(
            email="staff-finance@example.com",
            password="StrongPassword123!",
            role="admin",
            admin_level="staff",
            is_staff=True,
        )
        self.staff_with_orders_edit = User.objects.create_user(
            email="staff-orders-edit@example.com",
            password="StrongPassword123!",
            role="admin",
            admin_level="staff",
            is_staff=True,
        )
        self.staff_orders_read_only = User.objects.create_user(
            email="staff-orders-readonly@example.com",
            password="StrongPassword123!",
            role="admin",
            admin_level="staff",
            is_staff=True,
        )

        self.finance_role = StaffRole.objects.create(
            name="Finance Viewer Role",
            slug="finance-viewer-role",
            permissions=["dashboard.view", "finance.view"],
            is_active=True,
        )
        self.orders_edit_role = StaffRole.objects.create(
            name="Orders Editor Role",
            slug="orders-editor-role",
            permissions=["dashboard.view", "orders.view", "orders.edit"],
            is_active=True,
        )
        self.orders_view_role = StaffRole.objects.create(
            name="Orders View Role",
            slug="orders-view-role",
            permissions=["dashboard.view", "orders.view"],
            is_active=True,
        )

        StaffAssignment.objects.create(user=self.staff_with_finance, role=self.finance_role, is_active=True)
        StaffAssignment.objects.create(user=self.staff_with_orders_edit, role=self.orders_edit_role, is_active=True)
        StaffAssignment.objects.create(user=self.staff_orders_read_only, role=self.orders_view_role, is_active=True)

    def test_admin_finance_summary_requires_finance_view_permission(self):
        self.client.force_authenticate(user=self.staff_no_finance)
        response = self.client.get(reverse("order-admin-finance-summary"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_finance_summary_allows_staff_with_finance_view(self):
        self.client.force_authenticate(user=self.staff_with_finance)
        response = self.client.get(reverse("order-admin-finance-summary"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_release_expired_reservations_requires_orders_edit_permission(self):
        self.client.force_authenticate(user=self.staff_orders_read_only)
        response = self.client.post(
            reverse("order-admin-release-expired-reservations"),
            data={"limit": 10},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_release_expired_reservations_allows_orders_edit_permission(self):
        self.client.force_authenticate(user=self.staff_with_orders_edit)
        response = self.client.post(
            reverse("order-admin-release-expired-reservations"),
            data={"limit": 10},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("released_orders", response.data)
