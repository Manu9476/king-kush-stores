from django.urls import path

from . import views

urlpatterns = [
    path("public/creators/", views.public_creators_page, name="public-creators-page"),
    path("public/creators/<slug:slug>/", views.public_creator_detail, name="public-creator-detail"),
    path("public/team/", views.public_team_page, name="public-team-page"),
    path("public/team/<slug:slug>/", views.public_team_member_detail, name="public-team-member-detail"),
    path("admin/company/", views.admin_company_profile, name="admin-company-profile"),
    path("admin/company/media/<int:media_id>/", views.admin_company_media_detail, name="admin-company-media-detail"),
    path("admin/departments/", views.admin_departments, name="admin-departments"),
    path("admin/departments/<int:department_id>/", views.admin_department_detail, name="admin-department-detail"),
    path("admin/creators/", views.admin_creators, name="admin-creators"),
    path("admin/creators/<int:creator_id>/", views.admin_creator_detail, name="admin-creator-detail"),
    path("admin/team-members/", views.admin_team_members, name="admin-team-members"),
    path("admin/team-members/<int:member_id>/", views.admin_team_member_detail, name="admin-team-member-detail"),
]
