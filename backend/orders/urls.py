# backend/orders/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # Door 1: For customers placing a new order from the checkout page
    path('create/', views.create_order, name='order-create'),
    path('payments/mpesa/initiate/', views.initiate_mpesa_payment, name='order-payment-mpesa-initiate'),
    path('payments/mpesa/callback/', views.mpesa_payment_callback, name='order-payment-mpesa-callback'),
    path('payments/mpesa/b2c/result-callback/', views.mpesa_b2c_result_callback, name='order-payment-mpesa-b2c-result-callback'),
    path('payments/mpesa/mock-confirm/<int:payment_id>/', views.mock_confirm_mpesa_payment, name='order-payment-mpesa-mock-confirm'),
    path('payments/my/', views.my_marketplace_payments, name='order-payments-my'),
    
    # Door 2: For YOU (the admin) fetching the list for the dashboard
    path('list/', views.get_all_orders, name='order-list'),
    path('admin/orders/<int:order_id>/', views.admin_order_detail, name='order-admin-detail'),
    path('admin/orders/release-expired-reservations/', views.admin_release_expired_reservations, name='order-admin-release-expired-reservations'),
    path('admin/orders/rebuild-vendor-splits/', views.admin_rebuild_vendor_splits, name='order-admin-rebuild-vendor-splits'),
    path('admin/orders/<int:order_id>/refund/', views.admin_order_refund, name='order-admin-refund'),
    path('admin/finance/summary/', views.admin_finance_dashboard, name='order-admin-finance-summary'),
    path('admin/finance/payments/', views.admin_marketplace_payments, name='order-admin-finance-payments'),
    path('admin/finance/vendor-orders/', views.admin_vendor_orders, name='order-admin-finance-vendor-orders'),
    path('admin/finance/payout-requests/', views.admin_payout_requests, name='order-admin-payout-requests'),
    path('admin/finance/payout-requests/<int:payout_request_id>/', views.admin_payout_request_detail, name='order-admin-payout-request-detail'),
    path('my-orders/', views.get_my_orders, name='order-my-list'),
    path('track/<str:order_number>/', views.track_my_order, name='order-track-my-order'),
    path('<int:order_id>/cancel/', views.cancel_my_order, name='order-cancel'),
    path('addresses/', views.shipping_addresses, name='shipping-addresses'),
    path('addresses/<int:address_id>/', views.shipping_address_detail, name='shipping-address-detail'),
    path('payment-methods/', views.payment_methods, name='payment-methods'),
    path('payment-methods/<int:payment_method_id>/', views.payment_method_detail, name='payment-method-detail'),
    path('vendor/orders/', views.vendor_orders, name='vendor-orders'),
    path('vendor/orders/<int:order_id>/status/', views.vendor_order_status_detail, name='vendor-order-status-detail'),
    path('vendor/finance/', views.vendor_finance_summary, name='vendor-finance-summary'),
    path('vendor/payout-requests/', views.vendor_payout_requests, name='vendor-payout-requests'),
]
