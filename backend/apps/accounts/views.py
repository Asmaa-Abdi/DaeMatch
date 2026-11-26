from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from concurrent.futures import ThreadPoolExecutor
import binascii
import logging

from django.conf import settings
from django.db import close_old_connections, transaction
from django.contrib.auth import password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework.throttling import AnonRateThrottle
from rest_framework.parsers import FormParser, MultiPartParser

from apps.jobs.matching import required_skill_coverage_score
from apps.jobs.models import Job
from apps.notifications.match_alerts import evaluate_high_match_alerts
from .cv_uploads import cv_attachment_response, cv_preview_response, validate_cv_upload
from .models import DeveloperCV, DeveloperProfile, Skill
from .permissions import IsDeveloper, IsEmployer
from .serializers import (
    DeveloperSummarySerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileSerializer,
    RegisterSerializer,
    SkillSerializer,
)

User = get_user_model()
_RESET_EMAIL_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="daematch-password-reset")
logger = logging.getLogger(__name__)


def _send_password_reset_email(email: str) -> None:
    close_old_connections()
    try:
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if not user:
            return
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}"
        message = (
            "We received a request to reset your DAEMatch password.\n\n"
            f"Use this link within {settings.PASSWORD_RESET_TIMEOUT // 60} minutes:\n"
            f"{reset_url}\n\n"
            "If you did not request this, you can ignore this email. Your password will not change."
        )
        send_mail(
            subject="Reset your DAEMatch password",
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except Exception:
        logger.exception("Unable to deliver a DAEMatch password reset email.")
    finally:
        close_old_connections()


def _queue_password_reset_email(email: str) -> None:
    try:
        _RESET_EMAIL_EXECUTOR.submit(_send_password_reset_email, email)
    except Exception:
        logger.exception("Unable to queue a DAEMatch password reset email.")


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class LoginSerializer(TokenObtainPairSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields[self.username_field].max_length = 254

    def validate(self, attrs):
        identifier = attrs.get(self.username_field, "").strip()
        if "@" in identifier:
            account = User.objects.filter(email__iexact=identifier).only("username").first()
            if account:
                attrs[self.username_field] = account.get_username()
        data = super().validate(attrs)
        data["user"] = ProfileSerializer(self.user).data
        return data


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    permission_classes = [AllowAny]


class RefreshView(TokenRefreshView):
    permission_classes = [AllowAny]


class PasswordResetRequestThrottle(AnonRateThrottle):
    scope = "password_reset_request"
    rate = "5/hour"


class PasswordResetConfirmThrottle(AnonRateThrottle):
    scope = "password_reset_confirm"
    rate = "10/hour"


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PasswordResetRequestThrottle]
    generic_message = "If an account with that email exists, a password reset link will be sent shortly."

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _queue_password_reset_email(serializer.validated_data["email"])
        return Response({"detail": self.generic_message}, status=status.HTTP_202_ACCEPTED)


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PasswordResetConfirmThrottle]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_password = serializer.validated_data["new_password"]
        with transaction.atomic():
            try:
                uid = force_str(urlsafe_base64_decode(serializer.validated_data["uid"]))
                user = User.objects.select_for_update().get(pk=uid, is_active=True)
            except (binascii.Error, TypeError, ValueError, OverflowError, User.DoesNotExist):
                user = None

            token = serializer.validated_data["token"]
            if not user or not default_token_generator.check_token(user, token):
                return Response(
                    {"detail": "This reset link is invalid or has expired. Please request a new one."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                password_validation.validate_password(new_password, user=user)
            except DjangoValidationError as error:
                return Response({"new_password": error.messages}, status=status.HTTP_400_BAD_REQUEST)

            user.set_password(new_password)
            user.save(update_fields=["password"])
        return Response({"detail": "Your password has been reset. You can now log in."})


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(ProfileSerializer(request.user).data)

    def put(self, request):
        serializer = ProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(ProfileSerializer(user).data)


class DeveloperCVView(APIView):
    permission_classes = [IsAuthenticated, IsDeveloper]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        document = DeveloperCV.objects.filter(developer=request.user).only(
            "file_name", "content_type", "size_bytes", "updated_at"
        ).first()
        if document is None:
            return Response({"available": False, "filename": None, "content_type": None, "size_bytes": 0, "updated_at": None})
        return Response({
            "available": True,
            "filename": document.file_name,
            "content_type": document.content_type,
            "size_bytes": document.size_bytes,
            "updated_at": document.updated_at,
        })

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if uploaded_file is None:
            return Response({"file": ["Choose a PDF or DOCX CV to upload."]}, status=status.HTTP_400_BAD_REQUEST)
        values = validate_cv_upload(uploaded_file)
        values["file_name"] = values.pop("filename")
        document, created = DeveloperCV.objects.update_or_create(developer=request.user, defaults=values)
        return Response({
            "available": True,
            "filename": document.file_name,
            "content_type": document.content_type,
            "size_bytes": document.size_bytes,
            "updated_at": document.updated_at,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request):
        DeveloperCV.objects.filter(developer=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeveloperCVDownloadView(APIView):
    permission_classes = [IsAuthenticated, IsDeveloper]

    def get(self, request):
        document = generics.get_object_or_404(
            DeveloperCV.objects.only("content", "file_name", "content_type"), developer=request.user
        )
        return cv_attachment_response(document)


class DeveloperCVPreviewView(APIView):
    permission_classes = [IsAuthenticated, IsDeveloper]

    def get(self, request):
        document = generics.get_object_or_404(
            DeveloperCV.objects.only("content", "file_name", "content_type"), developer=request.user
        )
        return cv_preview_response(document)


class SkillListView(generics.ListAPIView):
    queryset = Skill.objects.all()
    serializer_class = SkillSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class ProfileSkillView(APIView):
    permission_classes = [IsAuthenticated, IsDeveloper]

    def post(self, request):
        name = " ".join(str(request.data.get("name", "")).strip().split())
        if not name:
            return Response({"name": ["Enter a skill name."]}, status=status.HTTP_400_BAD_REQUEST)
        if len(name) > 64:
            return Response({"name": ["Skill names must be 64 characters or fewer."]}, status=status.HTTP_400_BAD_REQUEST)
        skill, _ = Skill.objects.get_or_create(name=name)
        profile, _ = DeveloperProfile.objects.get_or_create(user=request.user)
        profile.skills.add(skill)
        request.user._state.fields_cache["developer_profile"] = profile
        evaluate_high_match_alerts(developer_id=request.user.pk)
        return Response(SkillSerializer(skill).data, status=status.HTTP_201_CREATED)

    def delete(self, request):
        profile = getattr(request.user, "developer_profile", None)
        if not profile:
            return Response(status=status.HTTP_204_NO_CONTENT)
        skill_id = request.data.get("skill_id") or request.query_params.get("skill_id")
        name = request.data.get("name") or request.query_params.get("name")
        if skill_id:
            profile.skills.remove(skill_id)
        elif name:
            profile.skills.remove(*Skill.objects.filter(name__iexact=str(name).strip()))
        else:
            return Response({"detail": "Provide skill_id or name."}, status=status.HTTP_400_BAD_REQUEST)
        evaluate_high_match_alerts(developer_id=request.user.pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class JobMatchesView(APIView):
    permission_classes = [IsAuthenticated, IsDeveloper]

    def get(self, request):
        profile = getattr(request.user, "developer_profile", None)
        developer_skills = list(profile.skills.values_list("name", flat=True)) if profile else []
        developer_skill_keys = {name.strip().casefold() for name in developer_skills if name.strip()}
        jobs = Job.objects.select_related("employer").prefetch_related("required_skills")
        matches = []
        for job in jobs:
            unique_required_skills = []
            required_names_by_key = {}
            for skill in job.required_skills.all():
                name = skill.name.strip()
                key = name.casefold()
                if key and key not in required_names_by_key:
                    required_names_by_key[key] = name
                    unique_required_skills.append(skill)
            required = list(required_names_by_key.values())
            matched_skills = [name for key, name in required_names_by_key.items() if key in developer_skill_keys]
            missing_skills = [name for key, name in required_names_by_key.items() if key not in developer_skill_keys]
            score = required_skill_coverage_score(developer_skills, required)
            matches.append({
                "id": job.id,
                "title": job.title,
                "description": job.description,
                "employer": job.employer.company_name or job.employer.get_full_name() or job.employer.username,
                "employer_location": job.employer.location,
                "location_type": job.location_type,
                "salary_range": job.salary_range,
                "required_skills": [{"id": skill.id, "name": skill.name} for skill in unique_required_skills],
                "matched_skills": matched_skills,
                "missing_skills": missing_skills,
                "developer_skill_count": len(developer_skill_keys),
                "required_skill_count": len(required_names_by_key),
                "created_at": job.created_at,
                "match_score": score,
            })
        matches.sort(key=lambda item: (-item["match_score"], -item["id"]))
        return Response({"count": len(matches), "results": matches})


class DeveloperDirectoryView(APIView):
    permission_classes = [IsAuthenticated, IsEmployer]

    def get(self, request):
        job = None
        job_id = request.query_params.get("job")
        if job_id:
            job = generics.get_object_or_404(Job, pk=job_id, employer=request.user)
        required = list(job.required_skills.values_list("name", flat=True)) if job else []
        profiles = DeveloperProfile.objects.select_related("user").prefetch_related("skills").filter(is_open_to_work=True)
        query = request.query_params.get("search", "").strip()
        if query:
            profiles = profiles.filter(Q(user__username__icontains=query) | Q(user__location__icontains=query) | Q(bio__icontains=query) | Q(skills__name__icontains=query)).distinct()
        results = []
        for profile in profiles:
            score = required_skill_coverage_score(profile.skills.values_list("name", flat=True), required) if job else 0.0
            results.append({
                "id": profile.id,
                "username": profile.user.username,
                "location": profile.user.location,
                "bio": profile.bio,
                "github_url": profile.github_url,
                "linkedin_url": profile.linkedin_url,
                "years_experience": profile.years_experience,
                "is_open_to_work": profile.is_open_to_work,
                "skills": [{"id": skill.id, "name": skill.name} for skill in profile.skills.all()],
                "match_score": score,
            })
        results.sort(key=lambda item: (-item["match_score"], item["username"].casefold()))
        return Response({"count": len(results), "results": results})


class PublicStatsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        developer_count = User.objects.filter(role=User.Role.DEVELOPER).count()
        employer_count = User.objects.filter(role=User.Role.EMPLOYER).count()
        jobs = list(Job.objects.prefetch_related("required_skills").order_by("-created_at")[:50])
        profiles = list(DeveloperProfile.objects.filter(is_open_to_work=True).prefetch_related("skills").order_by("-updated_at")[:50])
        scores = [
            required_skill_coverage_score(profile.skills.values_list("name", flat=True), job.required_skills.values_list("name", flat=True))
            for profile in profiles for job in jobs
        ]
        match_rate = round(100 * sum(score >= 50 for score in scores) / len(scores)) if scores else None
        return Response({
            "users": developer_count + employer_count,
            "developers": developer_count,
            "employers": employer_count,
            "jobs": Job.objects.count(),
            "match_rate": match_rate,
        })
