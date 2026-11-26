from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied

from apps.accounts.cv_uploads import cv_attachment_response, cv_preview_response
from apps.accounts.models import DeveloperCV, DeveloperProfile, User
from apps.accounts.permissions import IsDeveloper, IsEmployer
from apps.notifications.models import Notification
from apps.notifications.services import create_application_notification
from apps.notifications.match_alerts import evaluate_high_match_alerts
from .models import ApplicationMessage, Job, JobApplication
from .role_templates import ROLE_TEMPLATES
from .serializers import ApplicationMessageSerializer, ApplicationSerializer, JobSerializer


class JobListCreateView(generics.ListCreateAPIView):
    serializer_class = JobSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        applications = JobApplication.objects.filter(job_id=OuterRef("pk"), applicant=self.request.user)
        queryset = Job.objects.select_related("employer").prefetch_related("required_skills").annotate(
            applicant_count=Count("applications", distinct=True), has_applied=Exists(applications)
        )
        query = (self.request.query_params.get("search") or self.request.query_params.get("q") or "").strip()
        if query:
            queryset = queryset.filter(
                Q(title__icontains=query) | Q(description__icontains=query) | Q(employer__username__icontains=query) | Q(required_skills__name__icontains=query)
            ).distinct()
        location_type = self.request.query_params.get("location_type")
        if location_type in Job.LocationType.values:
            queryset = queryset.filter(location_type=location_type)
        skill = self.request.query_params.get("skill")
        if skill:
            queryset = queryset.filter(required_skills__name__iexact=skill)
        return queryset

    def create(self, request, *args, **kwargs):
        if request.user.role != User.Role.EMPLOYER:
            raise PermissionDenied("Only employer accounts can post jobs.")
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        job = serializer.save(employer=self.request.user)
        evaluate_high_match_alerts(job_id=job.pk)


class RoleTemplatesView(APIView):
    permission_classes = [IsAuthenticated, IsEmployer]

    def get(self, request):
        return Response({"templates": [{"role": role, "skills": skills} for role, skills in ROLE_TEMPLATES.items()]})


class JobDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Job.objects.select_related("employer").prefetch_related("required_skills")
    serializer_class = JobSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        job = super().get_object()
        if self.request.method in {"PUT", "PATCH", "DELETE"}:
            is_owner = job.employer_id == self.request.user.pk
            is_employer = self.request.user.role == User.Role.EMPLOYER
            if not is_owner or not is_employer:
                raise PermissionDenied("You can only edit or delete job posts that you own.")
        return job

    def perform_update(self, serializer):
        job = serializer.save()
        evaluate_high_match_alerts(job_id=job.pk)


class ApplyView(APIView):
    permission_classes = [IsAuthenticated, IsDeveloper]

    @transaction.atomic
    def post(self, request, pk):
        job = get_object_or_404(Job, pk=pk)
        application, created = JobApplication.objects.get_or_create(
            job=job,
            applicant=request.user,
            defaults={"cover_letter": request.data.get("cover_letter", "")},
        )
        if created:
            create_application_notification(
                recipient=job.employer,
                application=application,
                event_type=Notification.EventType.APPLICATION_RECEIVED,
            )
        return Response(
            {"id": application.id, "job_id": job.id, "status": application.status, "applied": True},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class MyJobsView(generics.ListAPIView):
    serializer_class = JobSerializer
    permission_classes = [IsAuthenticated, IsEmployer]
    pagination_class = None

    def get_queryset(self):
        return Job.objects.filter(employer=self.request.user).select_related("employer").prefetch_related("required_skills").annotate(
            applicant_count=Count("applications", distinct=True)
        )


class ApplicationsView(generics.ListAPIView):
    serializer_class = ApplicationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        applicant_cv_exists = DeveloperCV.objects.filter(developer_id=OuterRef("applicant_id"))
        queryset = JobApplication.objects.select_related("job", "job__employer", "applicant").prefetch_related(
            "job__required_skills", "applicant__developer_profile__skills"
        ).annotate(applicant_has_cv=Exists(applicant_cv_exists))
        if self.request.user.role == User.Role.DEVELOPER:
            return queryset.filter(applicant=self.request.user)
        return queryset.filter(job__employer=self.request.user)


class ApplicationStatusView(APIView):
    permission_classes = [IsAuthenticated, IsEmployer]

    @transaction.atomic
    def put(self, request, pk):
        application = get_object_or_404(
            JobApplication.objects.select_for_update().select_related("job", "job__employer", "applicant"),
            pk=pk,
            job__employer=request.user,
        )
        status_value = request.data.get("status")
        if status_value not in JobApplication.Status.values:
            return Response({"status": ["Choose pending, reviewed, accepted or rejected."]}, status=status.HTTP_400_BAD_REQUEST)
        previous_status = application.status
        application.status = status_value
        application.save(update_fields=["status"])
        if status_value != previous_status:
            event_type = None
            if status_value == JobApplication.Status.ACCEPTED:
                event_type = Notification.EventType.APPLICATION_ACCEPTED
            elif status_value == JobApplication.Status.REJECTED:
                event_type = Notification.EventType.APPLICATION_REJECTED
            if event_type:
                create_application_notification(
                    recipient=application.applicant,
                    application=application,
                    event_type=event_type,
                )
        return Response(ApplicationSerializer(application).data)


class ApplicationMessagesView(APIView):
    permission_classes = [IsAuthenticated]

    def get_application(self, request, pk):
        application = get_object_or_404(
            JobApplication.objects.select_related("job", "job__employer", "applicant"),
            pk=pk,
        )
        is_participant = request.user.pk in {application.applicant_id, application.job.employer_id}
        if not is_participant:
            raise PermissionDenied("Only the developer and employer on this application can access its conversation.")
        if application.status != JobApplication.Status.ACCEPTED:
            raise PermissionDenied("Messaging is available only after the application has been accepted.")
        return application

    def get(self, request, pk):
        application = self.get_application(request, pk)
        messages = application.messages.select_related("sender").all()
        return Response(ApplicationMessageSerializer(messages, many=True).data)

    def post(self, request, pk):
        application = self.get_application(request, pk)
        serializer = ApplicationMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.save(application=application, sender=request.user)
        return Response(ApplicationMessageSerializer(message).data, status=status.HTTP_201_CREATED)


def get_application_cv_for_request(request, pk):
    application = get_object_or_404(
        JobApplication.objects.select_related("job__employer", "applicant"), pk=pk
    )
    is_applicant = request.user.role == User.Role.DEVELOPER and application.applicant_id == request.user.pk
    is_owning_employer = request.user.role == User.Role.EMPLOYER and application.job.employer_id == request.user.pk
    if not (is_applicant or is_owning_employer):
        raise PermissionDenied("Only this applicant or the employer who received the application can view the CV.")
    return get_object_or_404(
        DeveloperCV.objects.only("content", "file_name", "content_type"),
        developer_id=application.applicant_id,
    )


class ApplicationCVDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return cv_attachment_response(get_application_cv_for_request(request, pk))


class ApplicationCVPreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return cv_preview_response(get_application_cv_for_request(request, pk))


class EmployerDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsEmployer]

    def get(self, request):
        jobs = list(
            Job.objects.filter(employer=request.user).select_related("employer").prefetch_related("required_skills")
            .annotate(applicant_count=Count("applications", distinct=True))
        )
        application_count = JobApplication.objects.filter(job__employer=request.user).count()
        open_developers = DeveloperProfile.objects.filter(is_open_to_work=True).count()
        applicant_cv_exists = DeveloperCV.objects.filter(developer_id=OuterRef("applicant_id"))
        applications = list(
            JobApplication.objects.filter(job__employer=request.user)
            .select_related("job", "job__employer", "applicant")
            .prefetch_related("job__required_skills", "applicant__developer_profile__skills")
            .annotate(applicant_has_cv=Exists(applicant_cv_exists))
            .order_by("-applied_at")
        )
        applicants = ApplicationSerializer(applications, many=True).data
        applicants.sort(key=lambda item: (-item["match_score"], item["applied_at"]))
        return Response({
            "jobs_posted": len(jobs),
            "total_applicants": application_count,
            "available_developers": open_developers,
            "my_jobs": JobSerializer(jobs, many=True).data,
            "top_applicants": applicants[:5],
        })
