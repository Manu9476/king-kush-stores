from django.urls import path

from . import views


urlpatterns = [
    path("black-friday/", views.public_black_friday, name="promotion-black-friday-public"),
    path("black-friday/events/", views.black_friday_event, name="promotion-black-friday-event"),
    path("black-friday/vendor/submissions/", views.vendor_black_friday_submissions, name="promotion-black-friday-vendor-submissions"),
    path("admin/black-friday/campaigns/", views.admin_black_friday_campaigns, name="promotion-black-friday-admin-campaigns"),
    path("admin/black-friday/campaigns/<int:campaign_id>/", views.admin_black_friday_campaign_detail, name="promotion-black-friday-admin-campaign-detail"),
    path("admin/black-friday/offers/", views.admin_black_friday_offers, name="promotion-black-friday-admin-offers"),
    path("admin/black-friday/offers/<int:offer_id>/", views.admin_black_friday_offer_detail, name="promotion-black-friday-admin-offer-detail"),
    path("admin/black-friday/analytics/", views.admin_black_friday_analytics, name="promotion-black-friday-admin-analytics"),
]
