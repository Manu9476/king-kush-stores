from django.urls import path

from . import views


urlpatterns = [
    path("help-center/", views.help_center_content, name="support-help-center"),
    path("contact/", views.submit_support_ticket, name="support-contact"),
    path("admin/tickets/", views.admin_support_tickets, name="support-admin-tickets"),
    path("admin/tickets/<int:ticket_id>/", views.admin_support_ticket_detail, name="support-admin-ticket-detail"),
    path("admin/tickets/<int:ticket_id>/reply/", views.admin_support_ticket_reply, name="support-admin-ticket-reply"),
    path("admin/product-reports/", views.admin_product_reports, name="support-admin-product-reports"),
    path("admin/product-reports/bulk-action/", views.admin_product_report_bulk_action, name="support-admin-product-report-bulk-action"),
    path("admin/product-reports/<int:ticket_id>/action/", views.admin_product_report_action, name="support-admin-product-report-action"),
    path("admin/help-center/entries/", views.admin_help_center_entries, name="support-admin-help-center-entries"),
    path("admin/help-center/entries/<int:entry_id>/", views.admin_help_center_entry_detail, name="support-admin-help-center-entry-detail"),
]
