from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import DeveloperCV, DeveloperProfile, Skill
from apps.notifications.models import Notification
from .matching import required_skill_coverage_score
from .models import Job, JobApplication

User = get_user_model()


class RequiredSkillCoverageTests(TestCase):
    def test_exact_skill_coverage_scores_one_hundred(self):
        self.assertEqual(required_skill_coverage_score(["Python", "Django"], ["Django", "Python"]), 100.0)

    def test_extra_and_duplicate_skills_do_not_penalize_or_inflate_score(self):
        score = required_skill_coverage_score(
            [" Python ", "React", "react", "Go"], ["python", "Django", " django "]
        )
        self.assertEqual(score, 50.0)

    def test_unmatched_or_empty_skill_sets_score_zero(self):
        self.assertEqual(required_skill_coverage_score(["Python"], ["React"]), 0.0)
        self.assertEqual(required_skill_coverage_score([], ["Python"]), 0.0)
        self.assertEqual(required_skill_coverage_score(["Python"], []), 0.0)


class JobApiWorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.employer = User.objects.create_user(username="amana-hiring", email="hiring@example.com", password="StrongPass!834", role=User.Role.EMPLOYER, location="Nairobi")
        self.developer = User.objects.create_user(username="somali-dev", email="dev@example.com", password="StrongPass!834", role=User.Role.DEVELOPER, location="Mogadishu")
        self.profile = DeveloperProfile.objects.create(user=self.developer, bio="Python and Django developer.", years_experience=3)
        self.python = Skill.objects.create(name="Python")
        self.django = Skill.objects.create(name="Django")
        self.react = Skill.objects.create(name="React")
        self.profile.skills.add(self.python, self.django)

    def test_employer_post_job_developer_matches_and_applies_once(self):
        self.client.force_authenticate(user=self.developer)
        denied = self.client.post("/api/jobs/", {"title": "Not allowed", "description": "Role", "required_skill_ids": [self.python.id]}, format="json")
        self.assertEqual(denied.status_code, 403)

        self.client.force_authenticate(user=self.employer)
        created = self.client.post("/api/jobs/", {
            "title": "Backend Developer", "description": "Build APIs with Python and Django.", "salary_range": "$2,000–$3,000 / month",
            "location_type": "remote", "required_skill_ids": [self.python.id, self.django.id],
        }, format="json")
        self.assertEqual(created.status_code, 201)
        job_id = created.data["id"]

        self.client.force_authenticate(user=self.developer)
        match_response = self.client.get("/api/users/job-matches/")
        self.assertEqual(match_response.status_code, 200)
        self.assertEqual(match_response.data["results"][0]["match_score"], 100.0)
        self.assertEqual(match_response.data["results"][0]["title"], "Backend Developer")

        first_apply = self.client.post(f"/api/jobs/{job_id}/apply/", {}, format="json")
        second_apply = self.client.post(f"/api/jobs/{job_id}/apply/", {}, format="json")
        self.assertEqual(first_apply.status_code, 201)
        self.assertEqual(second_apply.status_code, 200)
        self.assertEqual(JobApplication.objects.filter(job_id=job_id, applicant=self.developer).count(), 1)

        self.client.force_authenticate(user=self.employer)
        dashboard = self.client.get("/api/jobs/dashboard/")
        self.assertEqual(dashboard.status_code, 200)
        self.assertEqual(dashboard.data["jobs_posted"], 1)
        self.assertEqual(dashboard.data["total_applicants"], 1)
        self.assertEqual(dashboard.data["my_jobs"][0]["application_count"], 1)
        self.assertEqual(dashboard.data["top_applicants"][0]["match_score"], 100.0)

        application_id = dashboard.data["top_applicants"][0]["id"]
        status_response = self.client.put(f"/api/jobs/applications/{application_id}/status/", {"status": "accepted"}, format="json")
        self.assertEqual(status_response.status_code, 200)
        self.assertEqual(status_response.data["status"], "accepted")
        self.assertEqual(JobApplication.objects.get(pk=application_id).status, "accepted")

    def test_extra_profile_skills_do_not_lower_developer_or_employer_scores(self):
        job = Job.objects.create(employer=self.employer, title="Backend Engineer", description="Build Python services.")
        job.required_skills.add(self.python, self.django)
        self.profile.skills.add(self.react)
        self.profile.is_open_to_work = True
        self.profile.save(update_fields=["is_open_to_work"])
        application = JobApplication.objects.create(job=job, applicant=self.developer)

        self.client.force_authenticate(user=self.developer)
        matches = self.client.get("/api/users/job-matches/")
        match = next(item for item in matches.data["results"] if item["id"] == job.id)
        self.assertEqual(match["match_score"], 100.0)
        self.assertEqual(len(match["matched_skills"]), 2)
        self.assertEqual(match["required_skill_count"], 2)

        self.client.force_authenticate(user=self.employer)
        dashboard = self.client.get("/api/jobs/dashboard/")
        applicant = next(item for item in dashboard.data["top_applicants"] if item["id"] == application.id)
        self.assertEqual(applicant["match_score"], 100.0)
        directory = self.client.get(f"/api/users/developers/?job={job.id}")
        listed_developer = next(item for item in directory.data["results"] if item["id"] == self.profile.id)
        self.assertEqual(listed_developer["match_score"], 100.0)

    def test_employer_can_accept_and_reject_applications_and_notify_applicants(self):
        job = Job.objects.create(employer=self.employer, title="Software Engineer", description="Build products.")
        accepted_application = JobApplication.objects.create(job=job, applicant=self.developer)
        rejected_developer = User.objects.create_user(
            username="rejected-developer", email="rejected@example.com", password="StrongPass!834",
            role=User.Role.DEVELOPER, location="Hargeisa",
        )
        DeveloperProfile.objects.create(user=rejected_developer)
        rejected_application = JobApplication.objects.create(job=job, applicant=rejected_developer)

        self.client.force_authenticate(user=self.employer)
        accepted = self.client.put(
            f"/api/jobs/applications/{accepted_application.id}/status/", {"status": "accepted"}, format="json"
        )
        reviewed = self.client.put(
            f"/api/jobs/applications/{rejected_application.id}/status/", {"status": "reviewed"}, format="json"
        )
        rejected = self.client.put(
            f"/api/jobs/applications/{rejected_application.id}/status/", {"status": "rejected"}, format="json"
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.data["status"], "accepted")
        self.assertEqual(reviewed.data["status"], "reviewed")
        self.assertEqual(rejected.status_code, 200)
        self.assertEqual(rejected.data["status"], "rejected")
        self.assertEqual(JobApplication.objects.get(pk=accepted_application.id).status, "accepted")
        self.assertEqual(JobApplication.objects.get(pk=rejected_application.id).status, "rejected")
        self.assertTrue(Notification.objects.filter(
            recipient=self.developer, application=accepted_application,
            event_type=Notification.EventType.APPLICATION_ACCEPTED,
        ).exists())
        self.assertTrue(Notification.objects.filter(
            recipient=rejected_developer, application=rejected_application,
            event_type=Notification.EventType.APPLICATION_REJECTED,
        ).exists())

    def test_match_explanation_recalculates_when_developer_changes_skills(self):
        job = Job.objects.create(employer=self.employer, title="Backend Engineer", description="Build Python services.")
        job.required_skills.add(self.python, self.django)
        self.client.force_authenticate(user=self.developer)

        initial = self.client.get("/api/users/job-matches/")
        initial_match = next(item for item in initial.data["results"] if item["id"] == job.id)
        self.assertEqual(initial_match["match_score"], 100.0)
        self.assertCountEqual(initial_match["matched_skills"], ["Python", "Django"])
        self.assertEqual(initial_match["missing_skills"], [])
        self.assertEqual(initial_match["developer_skill_count"], 2)
        self.assertEqual(initial_match["required_skill_count"], 2)

        removed = self.client.delete("/api/users/profile/skills/", {"skill_id": self.django.id}, format="json")
        self.assertEqual(removed.status_code, 204)
        decreased = self.client.get("/api/users/job-matches/")
        decreased_match = next(item for item in decreased.data["results"] if item["id"] == job.id)
        self.assertEqual(decreased_match["match_score"], 50.0)
        self.assertEqual(decreased_match["matched_skills"], ["Python"])
        self.assertEqual(decreased_match["missing_skills"], ["Django"])
        self.assertEqual(decreased_match["developer_skill_count"], 1)

        added = self.client.post("/api/users/profile/skills/", {"name": "Django"}, format="json")
        self.assertEqual(added.status_code, 201)
        increased = self.client.get("/api/users/job-matches/")
        increased_match = next(item for item in increased.data["results"] if item["id"] == job.id)
        self.assertEqual(increased_match["match_score"], 100.0)
        self.assertCountEqual(increased_match["matched_skills"], ["Python", "Django"])
        self.assertEqual(increased_match["missing_skills"], [])

        self.client.force_authenticate(user=self.employer)
        self.assertEqual(self.client.get("/api/users/job-matches/").status_code, 403)

    def test_employer_can_list_all_applications_for_owned_jobs_only(self):
        first_job = Job.objects.create(employer=self.employer, title="Backend Developer", description="Build APIs.")
        first_job.required_skills.add(self.python, self.django)
        second_job = Job.objects.create(employer=self.employer, title="Python Engineer", description="Ship services.")
        second_job.required_skills.add(self.python)
        owned_jobs = [first_job, second_job]
        for index in range(3, 7):
            job = Job.objects.create(employer=self.employer, title=f"Engineering role {index}", description="Build software.")
            job.required_skills.add(self.python)
            owned_jobs.append(job)
        other_employer = User.objects.create_user(
            username="other-hiring", email="other-hiring@example.com", password="StrongPass!834",
            role=User.Role.EMPLOYER, location="Nairobi",
        )
        other_job = Job.objects.create(employer=other_employer, title="Other role", description="Not this employer's role.")
        for job in owned_jobs:
            JobApplication.objects.create(job=job, applicant=self.developer)
        JobApplication.objects.create(job=other_job, applicant=self.developer)

        self.client.force_authenticate(user=self.employer)
        response = self.client.get("/api/jobs/applications/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 6)
        self.assertEqual({item["job"]["id"] for item in response.data}, {job.id for job in owned_jobs})
        self.assertTrue(all(item["applicant"]["username"] == self.developer.username for item in response.data))
        self.assertTrue(all("match_score" in item and "status" in item for item in response.data))

    def test_unrelated_role_cannot_apply_or_view_employer_dashboard(self):
        job = Job.objects.create(employer=self.employer, title="Frontend Developer", description="Build interfaces.")
        job.required_skills.add(self.react)
        self.client.force_authenticate(user=self.employer)
        self.assertEqual(self.client.get("/api/jobs/dashboard/").status_code, 200)
        self.client.force_authenticate(user=self.developer)
        self.assertEqual(self.client.get("/api/jobs/dashboard/").status_code, 403)
        self.assertEqual(self.client.post(f"/api/jobs/{job.id}/apply/", {}, format="json").status_code, 201)

    def test_only_owner_employer_can_edit_and_delete_job(self):
        job = Job.objects.create(
            employer=self.employer,
            title="Backend Engineer",
            description="Build API services.",
            salary_range="$2,000 per month",
            location_type="remote",
        )
        job.required_skills.add(self.python)
        application = JobApplication.objects.create(job=job, applicant=self.developer)
        created_at = job.created_at

        self.client.force_authenticate(user=self.employer)
        updated = self.client.patch(f"/api/jobs/{job.id}/", {
            "title": "Senior Backend Engineer",
            "description": "Build and maintain secure API services.",
            "salary_range": "$3,000 per month",
            "location_type": "hybrid",
            "required_skill_ids": [self.react.id],
            "employer": self.developer.id,
            "created_at": "2000-01-01T00:00:00Z",
        }, format="json")
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["title"], "Senior Backend Engineer")
        self.assertEqual(updated.data["description"], "Build and maintain secure API services.")
        self.assertEqual(updated.data["salary_range"], "$3,000 per month")
        self.assertEqual(updated.data["location_type"], "hybrid")
        self.assertEqual(updated.data["employer"], self.employer.id)
        self.assertEqual(Job.objects.get(pk=job.id).created_at, created_at)
        self.assertEqual(list(Job.objects.get(pk=job.id).required_skills.values_list("name", flat=True)), ["React"])

        another_employer = User.objects.create_user(
            username="other-hiring", email="other-hiring@example.com", password="StrongPass!834",
            role=User.Role.EMPLOYER, location="Nairobi",
        )
        self.client.force_authenticate(user=another_employer)
        self.assertEqual(self.client.patch(f"/api/jobs/{job.id}/", {"title": "Hijacked"}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/jobs/{job.id}/").status_code, 403)
        self.assertTrue(Job.objects.filter(pk=job.id).exists())

        self.client.force_authenticate(user=self.developer)
        self.assertEqual(self.client.patch(f"/api/jobs/{job.id}/", {"title": "Not allowed"}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/jobs/{job.id}/").status_code, 403)

    def test_delete_job_cascades_to_applications(self):
        job = Job.objects.create(employer=self.employer, title="Temporary role", description="To be removed.")
        application = JobApplication.objects.create(job=job, applicant=self.developer)
        self.client.force_authenticate(user=self.employer)
        deleted = self.client.delete(f"/api/jobs/{job.id}/")
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(Job.objects.filter(pk=job.id).exists())
        self.assertFalse(JobApplication.objects.filter(pk=application.id).exists())


class ApplicationCVDownloadTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.employer = User.objects.create_user(
            username="cv-job-employer", email="cv-job-employer@example.com", password="StrongPass!834",
            role=User.Role.EMPLOYER, location="Nairobi",
        )
        self.developer = User.objects.create_user(
            username="cv-job-developer", email="cv-job-developer@example.com", password="StrongPass!834",
            role=User.Role.DEVELOPER, location="Mogadishu",
        )
        self.job = Job.objects.create(employer=self.employer, title="Backend Developer", description="Build APIs.")
        self.application = JobApplication.objects.create(job=self.job, applicant=self.developer)
        self.cv = DeveloperCV.objects.create(
            developer=self.developer,
            file_name="developer-cv.pdf",
            content_type="application/pdf",
            size_bytes=len(b"%PDF-1.7\nprivate CV"),
            content=b"%PDF-1.7\nprivate CV",
        )

    def test_only_applicant_and_employer_who_received_application_can_download_cv(self):
        self.client.force_authenticate(user=self.employer)
        listing = self.client.get("/api/jobs/applications/")
        self.assertEqual(listing.status_code, 200)
        applicant_data = listing.data[0]["applicant"]
        self.assertTrue(applicant_data["has_cv"])
        self.assertNotIn("content", applicant_data)

        thread_path = f"/api/jobs/applications/{self.application.id}/cv/"
        employer_download = self.client.get(thread_path)
        self.assertEqual(employer_download.status_code, 200)
        self.assertEqual(b"".join(employer_download.streaming_content), bytes(self.cv.content))
        employer_preview = self.client.get(f"{thread_path}preview/")
        self.assertEqual(employer_preview.status_code, 200)
        self.assertEqual(employer_preview["Content-Type"], "application/pdf")
        self.assertIn("inline", employer_preview["Content-Disposition"])
        self.assertEqual(employer_preview["Cache-Control"], "private, no-store, max-age=0")
        self.assertEqual(b"".join(employer_preview.streaming_content), bytes(self.cv.content))

        self.client.force_authenticate(user=self.developer)
        applicant_download = self.client.get(thread_path)
        self.assertEqual(applicant_download.status_code, 200)
        self.assertEqual(b"".join(applicant_download.streaming_content), bytes(self.cv.content))
        applicant_preview = self.client.get(f"{thread_path}preview/")
        self.assertEqual(applicant_preview.status_code, 200)
        self.assertEqual(b"".join(applicant_preview.streaming_content), bytes(self.cv.content))

        other_employer = User.objects.create_user(
            username="cv-other-employer", email="cv-other-employer@example.com", password="StrongPass!834",
            role=User.Role.EMPLOYER, location="Hargeisa",
        )
        self.client.force_authenticate(user=other_employer)
        self.assertEqual(self.client.get(thread_path).status_code, 403)
        self.assertEqual(self.client.get(f"{thread_path}preview/").status_code, 403)

        other_developer = User.objects.create_user(
            username="cv-other-developer", email="cv-other-developer@example.com", password="StrongPass!834",
            role=User.Role.DEVELOPER, location="Hargeisa",
        )
        self.client.force_authenticate(user=other_developer)
        self.assertEqual(self.client.get(thread_path).status_code, 403)
        self.assertEqual(self.client.get(f"{thread_path}preview/").status_code, 403)


class ApplicationMessageApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.employer = User.objects.create_user(
            username="message-employer", email="message-employer@example.com", password="StrongPass!834",
            role=User.Role.EMPLOYER, location="Nairobi",
        )
        self.developer = User.objects.create_user(
            username="message-developer", email="message-developer@example.com", password="StrongPass!834",
            role=User.Role.DEVELOPER, location="Mogadishu",
        )
        self.other_developer = User.objects.create_user(
            username="other-developer", email="other-developer@example.com", password="StrongPass!834",
            role=User.Role.DEVELOPER, location="Hargeisa",
        )
        self.job = Job.objects.create(employer=self.employer, title="Backend Developer", description="Build APIs.")
        self.application = JobApplication.objects.create(job=self.job, applicant=self.developer, status="accepted")

    def test_only_application_participants_can_exchange_messages(self):
        self.client.force_authenticate(user=self.employer)
        first = self.client.post(
            f"/api/jobs/applications/{self.application.id}/messages/",
            {"body": "Welcome — let's discuss the role."},
            format="json",
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.data["sender_id"], self.employer.id)
        self.assertEqual(first.data["application_id"], self.application.id)

        self.client.force_authenticate(user=self.developer)
        second = self.client.post(
            f"/api/jobs/applications/{self.application.id}/messages/",
            {"body": "Thank you. I am available this week."},
            format="json",
        )
        self.assertEqual(second.status_code, 201)
        history = self.client.get(f"/api/jobs/applications/{self.application.id}/messages/")
        self.assertEqual(history.status_code, 200)
        self.assertEqual([item["body"] for item in history.data], [
            "Welcome — let's discuss the role.",
            "Thank you. I am available this week.",
        ])

        self.client.force_authenticate(user=self.other_developer)
        self.assertEqual(self.client.get(f"/api/jobs/applications/{self.application.id}/messages/").status_code, 403)

    def test_pending_or_rejected_applications_cannot_read_or_send_messages(self):
        pending = JobApplication.objects.create(job=self.job, applicant=self.other_developer, status="pending")
        self.client.force_authenticate(user=self.other_developer)
        thread_url = f"/api/jobs/applications/{pending.id}/messages/"
        self.assertEqual(self.client.get(thread_url).status_code, 403)
        self.assertEqual(self.client.post(thread_url, {"body": "Hello"}, format="json").status_code, 403)

        self.application.status = JobApplication.Status.REJECTED
        self.application.save(update_fields=["status"])
        self.client.force_authenticate(user=self.developer)
        accepted_url = f"/api/jobs/applications/{self.application.id}/messages/"
        self.assertEqual(self.client.get(accepted_url).status_code, 403)
        self.assertEqual(self.client.post(accepted_url, {"body": "Hello"}, format="json").status_code, 403)
