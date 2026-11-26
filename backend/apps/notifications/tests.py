import base64
import json
from email import message_from_bytes
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core import mail
from django.core.management import call_command
from django.core.mail import EmailMessage
from django.test import TestCase, override_settings
from django.utils import timezone
from io import StringIO
from rest_framework.test import APIClient
from unittest.mock import patch

from apps.accounts.models import DeveloperProfile, Skill
from apps.jobs.models import Job, JobApplication
from .backends.gmail_api import GmailAPIBackendError, GmailAPIEmailBackend
from .email import send_notification_email
from .match_alerts import evaluate_high_match_alerts
from .models import EmailDelivery, Notification

User = get_user_model()


class ApplicationNotificationApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.employer = User.objects.create_user(
            username="amana-hiring",
            email="hiring@example.com",
            password="StrongPass!834",
            role=User.Role.EMPLOYER,
            location="Nairobi",
            company_name="Amana Software",
        )
        self.other_employer = User.objects.create_user(
            username="other-hiring",
            email="other@example.com",
            password="StrongPass!834",
            role=User.Role.EMPLOYER,
            location="Nairobi",
        )
        self.developer = User.objects.create_user(
            username="somali-dev",
            email="dev@example.com",
            password="StrongPass!834",
            role=User.Role.DEVELOPER,
            location="Mogadishu",
        )
        self.job = Job.objects.create(
            employer=self.employer,
            title="Backend Developer",
            description="Build APIs with Django.",
        )

    def test_new_application_notifies_owning_employer_once(self):
        self.client.force_authenticate(user=self.developer)
        first = self.client.post(f"/api/jobs/{self.job.id}/apply/", {}, format="json")
        retry = self.client.post(f"/api/jobs/{self.job.id}/apply/", {}, format="json")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(JobApplication.objects.filter(job=self.job, applicant=self.developer).count(), 1)
        notification = Notification.objects.get(
            recipient=self.employer,
            event_type=Notification.EventType.APPLICATION_RECEIVED,
        )
        self.assertEqual(notification.application.applicant, self.developer)
        self.assertEqual(Notification.objects.filter(application=notification.application).count(), 1)
        self.assertEqual(EmailDelivery.objects.filter(notification=notification).count(), 1)

        self.client.force_authenticate(user=self.employer)
        feed = self.client.get("/api/notifications/")
        self.assertEqual(feed.status_code, 200)
        self.assertEqual(feed.data["unread_count"], 1)
        self.assertEqual(feed.data["notifications"][0]["event_type"], "application_received")
        self.assertEqual(feed.data["notifications"][0]["job_title"], self.job.title)

        self.client.force_authenticate(user=self.other_employer)
        other_feed = self.client.get("/api/notifications/")
        self.assertEqual(other_feed.data["unread_count"], 0)
        self.assertEqual(other_feed.data["notifications"], [])

        self.client.force_authenticate(user=self.developer)
        developer_feed = self.client.get("/api/notifications/")
        self.assertEqual(developer_feed.data["notifications"], [])

    def test_acceptance_notifies_applicant_and_read_actions_are_private(self):
        application = JobApplication.objects.create(job=self.job, applicant=self.developer)
        self.client.force_authenticate(user=self.employer)
        accepted = self.client.put(
            f"/api/jobs/applications/{application.id}/status/",
            {"status": "accepted"},
            format="json",
        )
        accepted_again = self.client.put(
            f"/api/jobs/applications/{application.id}/status/",
            {"status": "accepted"},
            format="json",
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted_again.status_code, 200)
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.developer,
                application=application,
                event_type=Notification.EventType.APPLICATION_ACCEPTED,
            ).count(),
            1,
        )

        notification = Notification.objects.get(recipient=self.developer, application=application)
        self.client.force_authenticate(user=self.other_employer)
        self.assertEqual(self.client.post(f"/api/notifications/{notification.id}/read/").status_code, 404)

        self.client.force_authenticate(user=self.developer)
        feed = self.client.get("/api/notifications/")
        self.assertEqual(feed.data["unread_count"], 1)
        accepted_notice = feed.data["notifications"][0]
        self.assertEqual(accepted_notice["event_type"], "application_accepted")
        self.assertIn(self.job.title, accepted_notice["message"])
        self.assertEqual(self.client.post(f"/api/notifications/{notification.id}/read/").status_code, 204)
        self.assertEqual(self.client.get("/api/notifications/").data["unread_count"], 0)

        second_job = Job.objects.create(employer=self.employer, title="Frontend Developer", description="Build UI.")
        second_application = JobApplication.objects.create(job=second_job, applicant=self.developer)
        Notification.objects.create(
            recipient=self.developer,
            application=second_application,
            event_type=Notification.EventType.APPLICATION_ACCEPTED,
        )
        self.assertEqual(self.client.post("/api/notifications/read-all/").status_code, 204)
        self.assertEqual(self.client.get("/api/notifications/").data["unread_count"], 0)

    def test_rejection_notifies_applicant_only_once(self):
        application = JobApplication.objects.create(job=self.job, applicant=self.developer)
        self.client.force_authenticate(user=self.employer)
        rejected = self.client.put(
            f"/api/jobs/applications/{application.id}/status/",
            {"status": "rejected"},
            format="json",
        )
        rejected_again = self.client.put(
            f"/api/jobs/applications/{application.id}/status/",
            {"status": "rejected"},
            format="json",
        )
        self.assertEqual(rejected.status_code, 200)
        self.assertEqual(rejected.data["status"], "rejected")
        self.assertEqual(rejected_again.status_code, 200)
        notification = Notification.objects.get(
            recipient=self.developer,
            application=application,
            event_type=Notification.EventType.APPLICATION_REJECTED,
        )
        self.assertEqual(Notification.objects.filter(application=application).count(), 1)
        self.assertEqual(EmailDelivery.objects.filter(notification=notification).count(), 1)

        self.client.force_authenticate(user=self.developer)
        feed = self.client.get("/api/notifications/")
        self.assertEqual(feed.data["unread_count"], 1)
        self.assertEqual(feed.data["notifications"][0]["event_type"], "application_rejected")
        self.assertIn("not selected", feed.data["notifications"][0]["message"])
        self.assertEqual(notification.recipient, self.developer)

    def test_high_match_alert_threshold_is_strict_and_deduplicated(self):
        profile = DeveloperProfile.objects.create(user=self.developer)
        python = Skill.objects.create(name="Python")
        react = Skill.objects.create(name="React")
        profile.skills.add(python, react)
        self.job.required_skills.set([python, react])

        with patch("apps.notifications.match_alerts.required_skill_coverage_score", return_value=85.0):
            self.assertEqual(evaluate_high_match_alerts(job_id=self.job.id), 0)
        self.assertFalse(Notification.objects.filter(event_type=Notification.EventType.JOB_MATCH_HIGH).exists())

        with patch("apps.notifications.services.queue_notification_email") as queue_email:
            with self.captureOnCommitCallbacks(execute=True):
                with patch("apps.notifications.match_alerts.required_skill_coverage_score", return_value=85.1):
                    self.assertEqual(evaluate_high_match_alerts(job_id=self.job.id), 1)
                with patch("apps.notifications.match_alerts.required_skill_coverage_score", return_value=100.0):
                    self.assertEqual(evaluate_high_match_alerts(job_id=self.job.id), 0)

            notification = Notification.objects.get(event_type=Notification.EventType.JOB_MATCH_HIGH)
            self.assertEqual(notification.recipient, self.developer)
            self.assertEqual(notification.job, self.job)
            self.assertIsNone(notification.application_id)
            self.assertEqual(float(notification.match_score), 85.1)
            delivery = EmailDelivery.objects.get(notification=notification)
            self.assertEqual(delivery.status, EmailDelivery.Status.PENDING)
            queue_email.assert_called_once_with(delivery.id)

        self.client.force_authenticate(user=self.developer)
        feed = self.client.get("/api/notifications/")
        self.assertEqual(feed.status_code, 200)
        alert = feed.data["notifications"][0]
        self.assertEqual(alert["event_type"], "job_match_high")
        self.assertEqual(alert["application_id"], None)
        self.assertEqual(alert["job_id"], self.job.id)
        self.assertEqual(alert["match_score"], 85.1)
        self.assertIn("85.1%", alert["message"])

    def test_developer_skill_update_emits_high_match_alert_and_email_delivery(self):
        profile = DeveloperProfile.objects.create(user=self.developer)
        python = Skill.objects.create(name="Python")
        react = Skill.objects.create(name="React")
        profile.skills.add(python)
        self.job.required_skills.set([python, react])
        self.client.force_authenticate(user=self.developer)

        with patch("apps.notifications.services.queue_notification_email") as queue_email:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post("/api/users/profile/skills/", {"name": "React"}, format="json")
            self.assertEqual(response.status_code, 201)
            notification = Notification.objects.get(event_type=Notification.EventType.JOB_MATCH_HIGH)
            self.assertEqual(float(notification.match_score), 100.0)
            self.assertTrue(EmailDelivery.objects.filter(notification=notification).exists())
            queue_email.assert_called_once()

        with patch("apps.notifications.services.queue_notification_email"):
            with self.captureOnCommitCallbacks(execute=True):
                duplicate_skill = self.client.post(
                    "/api/users/profile/skills/", {"name": "React"}, format="json"
                )
            self.assertEqual(duplicate_skill.status_code, 201)
        self.assertEqual(
            Notification.objects.filter(event_type=Notification.EventType.JOB_MATCH_HIGH).count(), 1
        )
        self.assertEqual(EmailDelivery.objects.filter(notification__event_type=Notification.EventType.JOB_MATCH_HIGH).count(), 1)

    def test_job_create_and_edit_evaluate_high_matches(self):
        profile = DeveloperProfile.objects.create(user=self.developer)
        python = Skill.objects.create(name="Python")
        django = Skill.objects.create(name="Django")
        profile.skills.add(python)
        self.job.required_skills.add(django)
        self.client.force_authenticate(user=self.employer)

        with patch("apps.notifications.services.queue_notification_email") as queue_email:
            with self.captureOnCommitCallbacks(execute=True):
                created_job = self.client.post("/api/jobs/", {
                    "title": "Python Engineer",
                    "description": "Build Python services.",
                    "salary_range": "$2,000 per month",
                    "location_type": "remote",
                    "required_skill_ids": [python.id],
                }, format="json")
                self.assertEqual(created_job.status_code, 201)
                updated_job = self.client.patch(
                    f"/api/jobs/{self.job.id}/",
                    {"required_skill_ids": [python.id]},
                    format="json",
                )
                self.assertEqual(updated_job.status_code, 200)

            alerts = Notification.objects.filter(event_type=Notification.EventType.JOB_MATCH_HIGH)
            self.assertEqual(alerts.count(), 2)
            self.assertEqual(EmailDelivery.objects.filter(notification__in=alerts).count(), 2)
            self.assertEqual(queue_email.call_count, 2)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        FRONTEND_URL="https://daematch.example",
    )
    def test_high_match_email_contains_score_and_job_specific_match_link(self):
        notification = Notification.objects.create(
            recipient=self.developer,
            job=self.job,
            event_type=Notification.EventType.JOB_MATCH_HIGH,
            match_score=92.5,
        )
        delivery = EmailDelivery.objects.create(notification=notification)

        self.assertTrue(send_notification_email(delivery.id))

        delivery.refresh_from_db()
        self.assertEqual(delivery.status, EmailDelivery.Status.SENT)
        email = mail.outbox[-1]
        self.assertEqual(email.to, [self.developer.email])
        self.assertIn("92.5%", email.subject)
        self.assertIn(self.job.title, email.body)
        self.assertIn(f"https://daematch.example/matches?job={self.job.id}", email.body)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        FRONTEND_URL="https://daematch.example",
    )
    def test_application_event_emails_go_to_the_intended_recipient_with_action_links(self):
        application = JobApplication.objects.create(job=self.job, applicant=self.developer)
        cases = [
            (self.employer, Notification.EventType.APPLICATION_RECEIVED, "/employer?view=applications"),
            (self.developer, Notification.EventType.APPLICATION_ACCEPTED, f"/messages?application={application.id}"),
            (self.developer, Notification.EventType.APPLICATION_REJECTED, "/jobs"),
        ]

        for recipient, event_type, link_path in cases:
            with self.subTest(event_type=event_type):
                notification = Notification.objects.create(
                    recipient=recipient,
                    application=application,
                    event_type=event_type,
                )
                delivery = EmailDelivery.objects.create(notification=notification)
                self.assertTrue(send_notification_email(delivery.id))
                delivery.refresh_from_db()
                self.assertEqual(delivery.status, EmailDelivery.Status.SENT)
                email = mail.outbox[-1]
                self.assertEqual(email.to, [recipient.email])
                self.assertIn(self.job.title, email.subject)
                self.assertIn(f"https://daematch.example{link_path}", email.body)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_smtp_failure_is_saved_for_retry(self):
        application = JobApplication.objects.create(job=self.job, applicant=self.developer)
        notification = Notification.objects.create(
            recipient=self.employer,
            application=application,
            event_type=Notification.EventType.APPLICATION_RECEIVED,
        )
        delivery = EmailDelivery.objects.create(notification=notification)

        with patch("apps.notifications.email.send_mail", side_effect=OSError("SMTP unavailable")) as mocked_send:
            self.assertFalse(send_notification_email(delivery.id))

        delivery.refresh_from_db()
        self.assertEqual(delivery.status, EmailDelivery.Status.PENDING)
        self.assertEqual(delivery.attempt_count, 1)
        self.assertGreater(delivery.next_attempt_at, timezone.now())
        self.assertIn("SMTP unavailable", delivery.last_error)
        mocked_send.assert_called_once()

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        FRONTEND_URL="https://daematch.example",
    )
    def test_management_command_delivers_a_persisted_outbox_item(self):
        application = JobApplication.objects.create(job=self.job, applicant=self.developer)
        notification = Notification.objects.create(
            recipient=self.employer,
            application=application,
            event_type=Notification.EventType.APPLICATION_RECEIVED,
        )
        delivery = EmailDelivery.objects.create(notification=notification)
        output = StringIO()

        call_command("send_pending_notification_emails", stdout=output, limit=10)

        delivery.refresh_from_db()
        self.assertEqual(delivery.status, EmailDelivery.Status.SENT)
        self.assertIn("Delivered 1 of 1", output.getvalue())
        self.assertEqual(mail.outbox[-1].to, [self.employer.email])


class AuthenticatedApplicationWorkflowTests(TestCase):
    def setUp(self):
        self.developer = User.objects.create_user(
            username="jwt-seeker", email="jwt-seeker@example.com", password="StrongPass!834",
            role=User.Role.DEVELOPER, location="Mogadishu",
        )
        self.employer = User.objects.create_user(
            username="jwt-employer", email="jwt-employer@example.com", password="StrongPass!834",
            role=User.Role.EMPLOYER, location="Nairobi", company_name="Amana Software",
        )
        self.other_employer = User.objects.create_user(
            username="jwt-other-employer", email="jwt-other-employer@example.com", password="StrongPass!834",
            role=User.Role.EMPLOYER, location="Hargeisa",
        )
        self.skill = Skill.objects.create(name="Python")
        self.developer_client = APIClient()
        self.employer_client = APIClient()
        self.other_client = APIClient()
        self._login(self.developer_client, self.developer.username)
        self._login(self.employer_client, self.employer.email)
        self._login(self.other_client, self.other_employer.email)

    def _login(self, client, identifier):
        response = client.post(
            "/api/users/login/",
            {"username": identifier, "password": "StrongPass!834"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return response.data["access"]

    def test_jwt_login_cv_notifications_and_accepted_chat_work_together(self):
        anonymous = APIClient()
        self.assertEqual(anonymous.get("/api/notifications/").status_code, 401)

        created_job = self.employer_client.post("/api/jobs/", {
            "title": "Python Engineer",
            "description": "Build secure Django services.",
            "salary_range": "$2,000 per month",
            "location_type": "remote",
            "required_skill_ids": [self.skill.id],
        }, format="json")
        self.assertEqual(created_job.status_code, 201)
        job_id = created_job.data["id"]
        self.assertEqual(self.employer_client.get("/api/notifications/").data["notifications"], [])

        upload = SimpleUploadedFile(
            "jwt-seeker.pdf", b"%PDF-1.7\nprivate CV content", content_type="application/pdf"
        )
        uploaded = self.developer_client.post("/api/users/profile/cv/", {"file": upload}, format="multipart")
        self.assertEqual(uploaded.status_code, 201)
        self.assertNotIn("content", uploaded.data)
        own_download = self.developer_client.get("/api/users/profile/cv/download/")
        self.assertEqual(own_download.status_code, 200)
        self.assertEqual(b"".join(own_download.streaming_content), b"%PDF-1.7\nprivate CV content")

        applied = self.developer_client.post(
            f"/api/jobs/{job_id}/apply/", {"cover_letter": "I build Python services."}, format="json"
        )
        self.assertEqual(applied.status_code, 201)
        application_id = applied.data["id"]
        chat_url = f"/api/jobs/applications/{application_id}/messages/"
        cv_url = f"/api/jobs/applications/{application_id}/cv/"
        self.assertEqual(anonymous.get(chat_url).status_code, 401)
        self.assertEqual(self.developer_client.get(chat_url).status_code, 403)
        self.assertEqual(self.employer_client.get(chat_url).status_code, 403)

        employer_feed = self.employer_client.get("/api/notifications/")
        self.assertEqual(employer_feed.status_code, 200)
        self.assertEqual(employer_feed.data["notifications"][0]["event_type"], "application_received")
        received_notification_id = employer_feed.data["notifications"][0]["id"]
        self.assertEqual(self.developer_client.get("/api/notifications/").data["notifications"], [])
        self.assertEqual(self.other_client.get("/api/notifications/").data["notifications"], [])
        self.assertEqual(
            self.other_client.post(f"/api/notifications/{received_notification_id}/read/").status_code, 404
        )

        accepted = self.employer_client.put(
            f"/api/jobs/applications/{application_id}/status/", {"status": "accepted"}, format="json"
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.data["status"], "accepted")
        developer_feed = self.developer_client.get("/api/notifications/")
        self.assertEqual(developer_feed.status_code, 200)
        self.assertEqual(developer_feed.data["notifications"][0]["event_type"], "application_accepted")

        employer_applications = self.employer_client.get("/api/jobs/applications/")
        applicant_data = employer_applications.data[0]["applicant"]
        self.assertTrue(applicant_data["has_cv"])
        self.assertNotIn("content", applicant_data)
        employer_cv = self.employer_client.get(cv_url)
        self.assertEqual(employer_cv.status_code, 200)
        self.assertEqual(b"".join(employer_cv.streaming_content), b"%PDF-1.7\nprivate CV content")
        self.assertEqual(self.other_client.get(cv_url).status_code, 403)

        sent = self.developer_client.post(chat_url, {"body": "Hello, thank you for accepting."}, format="json")
        self.assertEqual(sent.status_code, 201)
        history = self.employer_client.get(chat_url)
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.data[0]["body"], "Hello, thank you for accepting.")
        reply = self.employer_client.post(chat_url, {"body": "Welcome to the team."}, format="json")
        self.assertEqual(reply.status_code, 201)
        developer_history = self.developer_client.get(chat_url)
        self.assertEqual([item["body"] for item in developer_history.data], [
            "Hello, thank you for accepting.",
            "Welcome to the team.",
        ])
        self.assertEqual(self.other_client.get(chat_url).status_code, 403)


class GmailAPIEmailBackendTests(TestCase):
    class FakeResponse:
        def __init__(self, payload):
            self.payload = payload

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

        def read(self):
            return json.dumps(self.payload).encode("utf-8")

    @override_settings(
        GOOGLE_OAUTH_CLIENT_ID="client-id",
        GOOGLE_OAUTH_CLIENT_SECRET="client-secret",
        GOOGLE_OAUTH_REFRESH_TOKEN="refresh-token",
        EMAIL_TIMEOUT=5,
    )
    def test_backend_refreshes_token_and_posts_base64url_message(self):
        email = EmailMessage(
            subject="DAEMatch test",
            body="OAuth2 email body",
            from_email="DAEMatch <sender@example.com>",
            to=["developer@example.com"],
        )
        responses = [
            self.FakeResponse({"access_token": "temporary-access-token", "expires_in": 3600}),
            self.FakeResponse({"id": "gmail-message-id", "threadId": "gmail-thread-id"}),
        ]

        with patch("apps.notifications.backends.gmail_api.urlopen", side_effect=responses) as mocked_urlopen:
            sent_count = GmailAPIEmailBackend().send_messages([email])

        self.assertEqual(sent_count, 1)
        token_request = mocked_urlopen.call_args_list[0].args[0]
        self.assertEqual(token_request.full_url, "https://oauth2.googleapis.com/token")
        self.assertIn(b"grant_type=refresh_token", token_request.data)
        send_request = mocked_urlopen.call_args_list[1].args[0]
        self.assertEqual(
            send_request.full_url,
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        )
        self.assertEqual(send_request.get_header("Authorization"), "Bearer temporary-access-token")
        raw_message = json.loads(send_request.data)["raw"]
        decoded = base64.urlsafe_b64decode(raw_message.encode("ascii"))
        parsed_message = message_from_bytes(decoded)
        self.assertEqual(parsed_message["Subject"], "DAEMatch test")
        self.assertIn("OAuth2 email body", parsed_message.get_payload())

    @override_settings(
        GOOGLE_OAUTH_CLIENT_ID="client-id",
        GOOGLE_OAUTH_CLIENT_SECRET="client-secret",
        GOOGLE_OAUTH_REFRESH_TOKEN="refresh-token",
        EMAIL_TIMEOUT=5,
    )
    def test_oauth_http_failure_is_sanitized(self):
        from io import BytesIO
        from urllib.error import HTTPError

        response = HTTPError(
            "https://oauth2.googleapis.com/token",
            400,
            "Bad Request",
            {},
            BytesIO(b"sensitive provider response"),
        )
        email = EmailMessage(
            subject="DAEMatch test",
            body="body",
            from_email="sender@example.com",
            to=["developer@example.com"],
        )
        with patch("apps.notifications.backends.gmail_api.urlopen", side_effect=response):
            with self.assertRaises(GmailAPIBackendError) as raised:
                GmailAPIEmailBackend().send_messages([email])

        self.assertIn("HTTP 400", str(raised.exception))
        self.assertNotIn("sensitive provider response", str(raised.exception))
