from django.contrib.auth import get_user_model
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from .models import JobApplication, JobOpening

User = get_user_model()


class CareersApiTests(APITestCase):
    def setUp(self):
        self.opening = JobOpening.objects.create(
            title="Backend Engineer",
            department="Engineering",
            location="Nairobi",
            employment_type="full_time",
            summary="Build APIs for e-commerce scale.",
            responsibilities="Write secure and performant backend code.",
            requirements="Python and Django experience.",
            is_active=True,
        )

    def test_public_openings_endpoint_returns_active_openings(self):
        response = self.client.get(reverse("careers-openings"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)

    def test_submit_job_application_accepts_valid_payload(self):
        cv = SimpleUploadedFile("cv.pdf", b"%PDF-1.4 sample", content_type="application/pdf")
        payload = {
            "job_opening": self.opening.id,
            "full_name": "John Applicant",
            "email": "john@example.com",
            "phone_number": "+254700000000",
            "country_location": "Kenya",
            "years_of_experience": "4",
            "education_level": "Bachelor's Degree",
            "professional_skills": "Django, React, PostgreSQL",
            "linkedin_portfolio": "https://linkedin.com/in/john",
            "cover_letter": "I am excited to apply.",
            "cv_file": cv,
        }

        response = self.client.post(reverse("careers-submit-application"), data=payload, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", response.data)
        self.assertEqual(JobApplication.objects.count(), 1)

    def test_admin_can_update_application_status(self):
        cv = SimpleUploadedFile("cv.pdf", b"%PDF-1.4 sample", content_type="application/pdf")
        application = JobApplication.objects.create(
            job_opening=self.opening,
            full_name="Jane Candidate",
            email="jane@example.com",
            cv_file=cv,
        )
        admin_user = User.objects.create_user(
            email="careers-admin@example.com",
            password="StrongPassword123!",
            first_name="Admin",
            last_name="User",
            role="admin",
            is_staff=True,
        )
        self.client.force_authenticate(user=admin_user)

        response = self.client.patch(
            reverse("careers-admin-application-detail", kwargs={"application_id": application.id}),
            data={"status": "shortlisted"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        application.refresh_from_db()
        self.assertEqual(application.status, "shortlisted")
        self.assertIsNotNone(application.reviewed_at)
