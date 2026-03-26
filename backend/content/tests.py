from rest_framework import status
from rest_framework.test import APITestCase

from .models import CompanyProfile, CreatorProfile, Department, TeamMember


class ContentPublicApiTests(APITestCase):
    def setUp(self):
        self.department = Department.objects.create(name="Design", is_active=True, sort_order=1)
        self.company = CompanyProfile.objects.create(company_name="My Company", is_published=True, is_active=True)
        self.creator = CreatorProfile.objects.create(
            full_name="Jane Creator",
            role_title="Lead Creator",
            is_published=True,
            is_active=True,
        )
        self.creator.departments.add(self.department)
        self.member = TeamMember.objects.create(
            full_name="John Team",
            role_title="Engineer",
            is_published=True,
            is_active=True,
        )
        self.member.departments.add(self.department)

    def test_public_creators_page_returns_company_and_creators(self):
        response = self.client.get("/api/content/public/creators/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["company"]["company_name"], "My Company")
        self.assertEqual(len(response.data["creators"]), 1)

    def test_public_team_page_returns_members(self):
        response = self.client.get("/api/content/public/team/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["members"]), 1)
