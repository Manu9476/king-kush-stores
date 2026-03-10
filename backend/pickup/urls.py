from django.urls import path

from . import views

urlpatterns = [
    path("stations/public/", views.public_pickup_stations, name="pickup-public-stations"),
    path("admin/stations/", views.admin_pickup_stations, name="pickup-admin-stations"),
    path("admin/stations/<int:station_id>/", views.admin_pickup_station_detail, name="pickup-admin-station-detail"),
    path("admin/assignments/", views.admin_pickup_assignments, name="pickup-admin-assignments"),
    path("admin/assignments/<int:assignment_id>/", views.admin_pickup_assignment_detail, name="pickup-admin-assignment-detail"),
    path("admin/operations/", views.admin_pickup_operations, name="pickup-admin-operations"),
    path("station/me/stations/", views.station_me_stations, name="pickup-station-me-stations"),
    path("station/me/orders/", views.station_me_orders, name="pickup-station-me-orders"),
    path("station/me/orders/<int:order_id>/ready/", views.station_order_ready, name="pickup-station-order-ready"),
    path("station/me/orders/<int:order_id>/collect/", views.station_order_collect, name="pickup-station-order-collect"),
    path("station/me/orders/<int:order_id>/return-dropoff/", views.station_order_return_dropoff, name="pickup-station-order-return-dropoff"),
    path("station/me/stations/<int:station_id>/notice/", views.station_notice_update, name="pickup-station-notice-update"),
    path("station/me/stations/<int:station_id>/settings/", views.station_operational_settings_update, name="pickup-station-settings-update"),
]
