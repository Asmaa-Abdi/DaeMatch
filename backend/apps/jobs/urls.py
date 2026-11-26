from django.urls import path

from .views import ApplicationCVDownloadView, ApplicationCVPreviewView, ApplicationMessagesView, ApplicationStatusView, ApplicationsView, ApplyView, EmployerDashboardView, JobDetailView, JobListCreateView, MyJobsView, RoleTemplatesView

urlpatterns = [
    path("", JobListCreateView.as_view(), name="job-list-create"),
    path("role-templates/", RoleTemplatesView.as_view(), name="role-templates"),
    path("dashboard/", EmployerDashboardView.as_view(), name="employer-dashboard"),
    path("my-jobs/", MyJobsView.as_view(), name="my-jobs"),
    path("applications/", ApplicationsView.as_view(), name="job-applications"),
    path("applications/<int:pk>/cv/", ApplicationCVDownloadView.as_view(), name="application-cv"),
    path("applications/<int:pk>/cv/preview/", ApplicationCVPreviewView.as_view(), name="application-cv-preview"),
    path("applications/<int:pk>/messages/", ApplicationMessagesView.as_view(), name="application-messages"),
    path("applications/<int:pk>/status/", ApplicationStatusView.as_view(), name="application-status"),
    path("<int:pk>/", JobDetailView.as_view(), name="job-detail"),
    path("<int:pk>/apply/", ApplyView.as_view(), name="job-apply"),
]
