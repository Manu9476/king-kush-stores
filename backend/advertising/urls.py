from django.urls import path

from . import views


urlpatterns = [
    path("public/", views.public_advertising_data, name="advertising-public"),
    path("requests/", views.submit_advertising_request, name="advertising-submit-request"),
    path("events/", views.record_advertising_event, name="advertising-record-event"),
    path("admin/placements/", views.admin_advertising_placements, name="advertising-admin-placements"),
    path("admin/placements/<int:placement_id>/", views.admin_advertising_placement_detail, name="advertising-admin-placement-detail"),
    path("admin/requests/", views.admin_advertising_requests, name="advertising-admin-requests"),
    path("admin/requests/<int:request_id>/", views.admin_advertising_request_detail, name="advertising-admin-request-detail"),
    path("admin/campaigns/", views.admin_advertising_campaigns, name="advertising-admin-campaigns"),
    path("admin/campaigns/<int:campaign_id>/", views.admin_advertising_campaign_detail, name="advertising-admin-campaign-detail"),
    path("admin/analytics/", views.admin_advertising_analytics, name="advertising-admin-analytics"),
]
