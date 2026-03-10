from django.urls import path

from . import views

urlpatterns = [
    path("openings/", views.public_job_openings, name="careers-openings"),
    path("form-fields/", views.public_application_form_fields, name="careers-form-fields"),
    path("applications/", views.submit_job_application, name="careers-submit-application"),
    path("admin/applications/", views.admin_job_applications, name="careers-admin-applications"),
    path("admin/applications/<int:application_id>/", views.admin_job_application_detail, name="careers-admin-application-detail"),
    path("admin/form-fields/", views.admin_form_fields, name="careers-admin-form-fields"),
    path("admin/form-fields/<int:field_id>/", views.admin_form_field_detail, name="careers-admin-form-field-detail"),
    path("admin/openings/", views.admin_job_openings, name="careers-admin-openings"),
    path("admin/openings/<int:opening_id>/", views.admin_job_opening_detail, name="careers-admin-opening-detail"),
]
