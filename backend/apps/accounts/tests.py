from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from io import BytesIO
from rest_framework.test import APIClient
from zipfile import ZipFile

from django.core import mail
from django.core.cache import cache
from django.test.utils import override_settings
from urllib.parse import urlsplit
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from django.contrib.auth.tokens import default_token_generator
from django.test import TransactionTestCase
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.db import connections

from .cv_uploads import MAX_CV_UPLOAD_BYTES
from .models import DeveloperCV, DeveloperProfile, Skill

User = get_user_model()


class AccountApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_registration_requires_location_and_creates_developer_profile(self):
        missing_username = self.client.post("/api/users/register/", {
            "email": "talent@example.com", "password": "StrongPass!834", "role": "developer", "location": "Mogadishu",
        }, format="json")
        self.assertEqual(missing_username.status_code, 400)
        missing_location = self.client.post("/api/users/register/", {
            "username": "new-talent", "email": "talent@example.com", "password": "StrongPass!834", "role": "developer",
        }, format="json")
        self.assertEqual(missing_location.status_code, 400)
        response = self.client.post("/api/users/register/", {
            "username": "new-talent", "email": "talent@example.com", "password": "StrongPass!834", "role": "developer", "location": "Mogadishu",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username="new-talent")
        self.assertTrue(DeveloperProfile.objects.filter(user=user).exists())
        self.assertEqual(user.location, "Mogadishu")

    def test_employer_registration_requires_company_details_and_supports_email_login(self):
        missing_website = self.client.post("/api/users/register/", {
            "email": "hiring@amana.example", "password": "StrongPass!834", "role": "employer",
            "company_name": "Amana Software", "location": "Nairobi",
        }, format="json")
        self.assertEqual(missing_website.status_code, 400)
        self.assertIn("company_website", missing_website.data)

        response = self.client.post("/api/users/register/", {
            "email": "hiring@amana.example", "password": "StrongPass!834", "role": "employer",
            "company_website": "https://amana.example", "company_name": "Amana Software", "location": "Nairobi",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email="hiring@amana.example")
        self.assertTrue(user.username)
        self.assertEqual(user.company_name, "Amana Software")
        self.assertEqual(user.company_website, "https://amana.example")
        self.assertFalse(DeveloperProfile.objects.filter(user=user).exists())

        collision = self.client.post("/api/users/register/", {
            "email": "hiring@another.example", "password": "StrongPass!834", "role": "employer",
            "company_website": "https://another.example", "company_name": "Another Company", "location": "Hargeisa",
        }, format="json")
        self.assertEqual(collision.status_code, 201)
        collision_user = User.objects.get(email="hiring@another.example")
        self.assertEqual(collision_user.username, f"{user.username}-2")

        login = self.client.post("/api/users/login/", {"username": "hiring@amana.example", "password": "StrongPass!834"}, format="json")
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.data["user"]["company_name"], "Amana Software")

        self.client.force_authenticate(user=user)
        updated = self.client.put("/api/users/profile/", {
            "company_name": "Amana Software Group", "company_website": "https://group.amana.example", "location": "Hargeisa",
        }, format="json")
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["company_name"], "Amana Software Group")
        self.assertEqual(updated.data["company_website"], "https://group.amana.example")

    def test_login_returns_jwt_and_profile_fields(self):
        user = User.objects.create_user(username="dev-user", email="dev@example.com", password="StrongPass!834", role=User.Role.DEVELOPER, location="Hargeisa")
        DeveloperProfile.objects.create(user=user)
        response = self.client.post("/api/users/login/", {"username": "dev-user", "password": "StrongPass!834"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["role"], "developer")
        self.assertEqual(response.data["user"]["location"], "Hargeisa")

    def test_developer_can_update_profile_and_manage_skills(self):
        user = User.objects.create_user(username="profile-dev", email="profile@example.com", password="StrongPass!834", role=User.Role.DEVELOPER, location="Mogadishu")
        DeveloperProfile.objects.create(user=user)
        self.client.force_authenticate(user=user)
        update = self.client.put("/api/users/profile/", {
            "bio": "Python engineer building useful products.",
            "github_url": "https://github.com/profile-dev",
            "linkedin_url": "https://linkedin.com/in/profile-dev",
            "years_experience": 4,
            "is_open_to_work": True,
        }, format="json")
        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.data["years_experience"], 4)
        added = self.client.post("/api/users/profile/skills/", {"name": "Python"}, format="json")
        self.assertEqual(added.status_code, 201)
        self.assertEqual(self.client.get("/api/users/profile/").data["skills"][0]["name"], "Python")
        removed = self.client.delete("/api/users/profile/skills/", {"skill_id": added.data["id"]}, format="json")
        self.assertEqual(removed.status_code, 204)
        self.assertEqual(user.developer_profile.skills.count(), 0)

    def test_employer_cannot_manage_developer_skills(self):
        employer = User.objects.create_user(username="hiring-team", email="hire@example.com", password="StrongPass!834", role=User.Role.EMPLOYER, location="Nairobi")
        self.client.force_authenticate(user=employer)
        response = self.client.post("/api/users/profile/skills/", {"name": "Python"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Skill.objects.count(), 0)


class DeveloperCVApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.developer = User.objects.create_user(
            username="cv-developer", email="cv-developer@example.com", password="StrongPass!834",
            role=User.Role.DEVELOPER, location="Mogadishu",
        )

    def test_developer_can_upload_replace_download_and_remove_private_cv(self):
        self.client.force_authenticate(user=self.developer)
        original = SimpleUploadedFile("Amina CV.PDF", b"%PDF-1.7\nprivate cv bytes", content_type="application/pdf")
        uploaded = self.client.post("/api/users/profile/cv/", {"file": original}, format="multipart")
        self.assertEqual(uploaded.status_code, 201)
        self.assertTrue(uploaded.data["available"])
        self.assertTrue(uploaded.data["filename"].endswith(".pdf"))
        self.assertNotIn("content", uploaded.data)

        document = DeveloperCV.objects.get(developer=self.developer)
        self.assertEqual(bytes(document.content), b"%PDF-1.7\nprivate cv bytes")
        metadata = self.client.get("/api/users/profile/cv/")
        self.assertEqual(metadata.status_code, 200)
        self.assertEqual(metadata.data["filename"], document.file_name)
        self.assertNotIn("content", metadata.data)

        download = self.client.get("/api/users/profile/cv/download/")
        self.assertEqual(download.status_code, 200)
        self.assertIn("attachment", download.headers["Content-Disposition"])
        self.assertEqual(download.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(download.headers["Cache-Control"], "private, no-store, max-age=0")
        self.assertEqual(b"".join(download.streaming_content), b"%PDF-1.7\nprivate cv bytes")

        replacement = SimpleUploadedFile("updated.pdf", b"%PDF-1.7\nreplacement", content_type="application/pdf")
        replaced = self.client.post("/api/users/profile/cv/", {"file": replacement}, format="multipart")
        self.assertEqual(replaced.status_code, 200)
        self.assertEqual(DeveloperCV.objects.filter(developer=self.developer).count(), 1)
        self.assertEqual(bytes(DeveloperCV.objects.get(developer=self.developer).content), b"%PDF-1.7\nreplacement")

        docx_buffer = BytesIO()
        with ZipFile(docx_buffer, "w") as archive:
            archive.writestr("[Content_Types].xml", "<Types/>")
            archive.writestr("word/document.xml", "<w:document/>")
        docx = SimpleUploadedFile("developer.docx", docx_buffer.getvalue(), content_type="application/octet-stream")
        docx_replaced = self.client.post("/api/users/profile/cv/", {"file": docx}, format="multipart")
        self.assertEqual(docx_replaced.status_code, 200)
        self.assertEqual(docx_replaced.data["content_type"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document")

        self.assertEqual(self.client.delete("/api/users/profile/cv/").status_code, 204)
        self.assertFalse(DeveloperCV.objects.filter(developer=self.developer).exists())
        self.assertFalse(self.client.get("/api/users/profile/cv/").data["available"])

    def test_private_preview_renders_pdf_inline_and_docx_as_read_only_text(self):
        self.client.force_authenticate(user=self.developer)
        pdf = SimpleUploadedFile("private.pdf", b"%PDF-1.7\npreview content", content_type="application/pdf")
        self.assertEqual(self.client.post("/api/users/profile/cv/", {"file": pdf}, format="multipart").status_code, 201)

        pdf_preview = self.client.get("/api/users/profile/cv/preview/")
        self.assertEqual(pdf_preview.status_code, 200)
        self.assertEqual(pdf_preview["Content-Type"], "application/pdf")
        self.assertIn("inline", pdf_preview["Content-Disposition"])
        self.assertEqual(pdf_preview["Cache-Control"], "private, no-store, max-age=0")
        self.assertEqual(pdf_preview["X-Content-Type-Options"], "nosniff")
        self.assertEqual(b"".join(pdf_preview.streaming_content), b"%PDF-1.7\npreview content")

        document_xml = (
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            "<w:body><w:p><w:r><w:t>Software Engineer</w:t></w:r></w:p>"
            "<w:p><w:r><w:t>Python and Django</w:t></w:r></w:p></w:body></w:document>"
        )
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("[Content_Types].xml", "<Types/>")
            archive.writestr("word/document.xml", document_xml)
        docx = SimpleUploadedFile("private.docx", buffer.getvalue(), content_type="application/octet-stream")
        self.assertEqual(self.client.post("/api/users/profile/cv/", {"file": docx}, format="multipart").status_code, 200)

        docx_preview = self.client.get("/api/users/profile/cv/preview/")
        self.assertEqual(docx_preview.status_code, 200)
        self.assertTrue(docx_preview["Content-Type"].startswith("text/plain"))
        self.assertIn("inline", docx_preview["Content-Disposition"])
        self.assertEqual(docx_preview["Cache-Control"], "private, no-store, max-age=0")
        self.assertEqual(b"".join(docx_preview.streaming_content), b"Software Engineer\nPython and Django")

    def test_preview_rejects_unauthenticated_access_and_unsafe_docx_xml(self):
        self.client.force_authenticate(user=self.developer)
        unsafe_xml = '<!DOCTYPE x [<!ENTITY secret "not-for-preview">]><w:document/>'
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("[Content_Types].xml", "<Types/>")
            archive.writestr("word/document.xml", unsafe_xml)
        docx = SimpleUploadedFile("unsafe.docx", buffer.getvalue(), content_type="application/octet-stream")
        self.assertEqual(self.client.post("/api/users/profile/cv/", {"file": docx}, format="multipart").status_code, 201)
        self.assertEqual(self.client.get("/api/users/profile/cv/preview/").status_code, 400)

        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get("/api/users/profile/cv/preview/").status_code, {401, 403})

    def test_upload_rejects_wrong_extension_signature_and_files_over_five_mib(self):
        self.client.force_authenticate(user=self.developer)
        wrong_extension = SimpleUploadedFile("resume.doc", b"legacy Word file")
        self.assertEqual(self.client.post("/api/users/profile/cv/", {"file": wrong_extension}, format="multipart").status_code, 400)

        bad_pdf = SimpleUploadedFile("resume.pdf", b"not a PDF", content_type="application/pdf")
        self.assertEqual(self.client.post("/api/users/profile/cv/", {"file": bad_pdf}, format="multipart").status_code, 400)

        oversized = SimpleUploadedFile("resume.pdf", b"%PDF-" + b"x" * MAX_CV_UPLOAD_BYTES, content_type="application/pdf")
        response = self.client.post("/api/users/profile/cv/", {"file": oversized}, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(DeveloperCV.objects.filter(developer=self.developer).exists())

    def test_employer_cannot_read_or_manage_developer_cv(self):
        employer = User.objects.create_user(
            username="cv-employer", email="cv-employer@example.com", password="StrongPass!834",
            role=User.Role.EMPLOYER, location="Nairobi",
        )
        self.client.force_authenticate(user=employer)
        self.assertEqual(self.client.get("/api/users/profile/cv/").status_code, 403)
        self.assertEqual(self.client.get("/api/users/profile/cv/download/").status_code, 403)
        self.assertEqual(self.client.get("/api/users/profile/cv/preview/").status_code, 403)
        upload = SimpleUploadedFile("resume.pdf", b"%PDF-1.7\nprivate", content_type="application/pdf")
        self.assertEqual(self.client.post("/api/users/profile/cv/", {"file": upload}, format="multipart").status_code, 403)
        self.assertFalse(DeveloperCV.objects.exists())


class PasswordResetConcurrencyTests(TransactionTestCase):
    def setUp(self):
        cache.clear()

    def test_concurrent_confirmations_only_accept_the_reset_token_once(self):
        user = User.objects.create_user(
            username="concurrent-reset",
            email="concurrent.reset@example.com",
            password="OldStrong!834",
            role=User.Role.DEVELOPER,
            location="Mogadishu",
        )
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        payload = {
            "uid": uid,
            "token": token,
            "new_password": "NewStrong!927",
            "confirm_password": "NewStrong!927",
        }

        def confirm_reset():
            try:
                return APIClient().post("/api/users/password-reset/confirm/", payload, format="json").status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = list(executor.map(lambda _index: confirm_reset(), range(2)))

        self.assertCountEqual(statuses, [200, 400])
        user.refresh_from_db()
        self.assertTrue(user.check_password("NewStrong!927"))


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="https://daematch.example",
)
class PasswordResetApiTests(TestCase):
    def setUp(self):
        cache.clear()
        mail.outbox.clear()
        self.client = APIClient()

    def make_user(self):
        return User.objects.create_user(
            username="reset-person",
            email="reset.person@example.com",
            password="OldStrong!834",
            role=User.Role.DEVELOPER,
            location="Mogadishu",
        )

    def request_link(self):
        self.assertEqual(len(mail.outbox), 1)
        body = mail.outbox[0].body
        link = next(line for line in body.splitlines() if line.startswith("https://daematch.example/reset-password/"))
        path_parts = urlsplit(link).path.strip("/").split("/")
        self.assertEqual(path_parts[-3], "reset-password")
        return path_parts[-2], path_parts[-1]

    def request_reset_inline(self, email):
        with patch("apps.accounts.views.close_old_connections"), patch(
            "apps.accounts.views._RESET_EMAIL_EXECUTOR.submit",
            side_effect=lambda function, address: function(address),
        ):
            return self.client.post("/api/users/password-reset/", {"email": email}, format="json")

    def test_request_sends_frontend_link_but_does_not_disclose_account_existence(self):
        user = self.make_user()
        known = self.request_reset_inline(user.email.upper())
        unknown = self.request_reset_inline("nobody@example.com")
        self.assertEqual(known.status_code, 202)
        generic_message = known.data["detail"]
        self.assertEqual(mail.outbox[0].to, [user.email])
        self.assertIn("https://daematch.example/reset-password/", mail.outbox[0].body)

        self.assertEqual(unknown.status_code, 202)
        self.assertEqual(unknown.data["detail"], generic_message)
        self.assertEqual(len(mail.outbox), 1)

    def test_known_and_unknown_addresses_take_the_same_async_dispatch_path(self):
        user = self.make_user()
        with patch("apps.accounts.views._RESET_EMAIL_EXECUTOR.submit") as submit:
            known = self.client.post("/api/users/password-reset/", {"email": user.email}, format="json")
            unknown = self.client.post("/api/users/password-reset/", {"email": "nobody@example.com"}, format="json")

        self.assertEqual(known.status_code, 202)
        self.assertEqual(unknown.status_code, 202)
        self.assertEqual(known.data["detail"], unknown.data["detail"])
        self.assertEqual(submit.call_count, 2)
        self.assertEqual([call.args[1] for call in submit.call_args_list], [user.email, "nobody@example.com"])

    def test_valid_link_changes_password_and_cannot_be_reused(self):
        user = self.make_user()
        self.request_reset_inline(user.email)
        uid, token = self.request_link()
        payload = {
            "uid": uid,
            "token": token,
            "new_password": "NewlyStrong!927",
            "confirm_password": "NewlyStrong!927",
        }
        response = self.client.post("/api/users/password-reset/confirm/", payload, format="json")
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.check_password("NewlyStrong!927"))

        reused = self.client.post("/api/users/password-reset/confirm/", payload, format="json")
        self.assertEqual(reused.status_code, 400)
        user.refresh_from_db()
        self.assertTrue(user.check_password("NewlyStrong!927"))

    def test_expired_link_does_not_change_password(self):
        user = self.make_user()
        self.request_reset_inline(user.email)
        uid, token = self.request_link()
        with override_settings(PASSWORD_RESET_TIMEOUT=-1):
            response = self.client.post("/api/users/password-reset/confirm/", {
                "uid": uid,
                "token": token,
                "new_password": "NewlyStrong!927",
                "confirm_password": "NewlyStrong!927",
            }, format="json")
        self.assertEqual(response.status_code, 400)
        user.refresh_from_db()
        self.assertTrue(user.check_password("OldStrong!834"))
