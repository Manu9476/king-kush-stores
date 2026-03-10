from django.urls import path

from . import views

urlpatterns = [
    path("my/", views.my_receipts, name="receipts-my"),
    path("vendor/", views.vendor_receipts, name="receipts-vendor"),
    path("admin/", views.admin_receipts, name="receipts-admin"),
    path("station/me/", views.station_receipts, name="receipts-station-me"),
    path("generate/", views.generate_receipt_for_transaction, name="receipts-generate-transaction"),
    path("admin/manual/", views.admin_manual_receipt, name="receipts-admin-manual"),
    path("<int:receipt_id>/download/", views.download_receipt_pdf, name="receipts-download"),
    path("<int:receipt_id>/regenerate/", views.regenerate_receipt_view, name="receipts-regenerate"),
]
