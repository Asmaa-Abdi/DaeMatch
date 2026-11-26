from django.urls import path

from .views import (
    DeveloperDirectoryView,
    DeveloperCVDownloadView,
    DeveloperCVPreviewView,
    DeveloperCVView,
    JobMatchesView,
    LoginView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    ProfileSkillView,
    ProfileView,
    RefreshView,
    RegisterView,
    SkillListView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="user-register"),
    path("login/", LoginView.as_view(), name="user-login"),
    path("token/refresh/", RefreshView.as_view(), name="token-refresh"),
    path("password-reset/", PasswordResetRequestView.as_view(), name="password-reset-request"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
    path("profile/", ProfileView.as_view(), name="user-profile"),
    path("profile/cv/", DeveloperCVView.as_view(), name="profile-cv"),
    path("profile/cv/download/", DeveloperCVDownloadView.as_view(), name="profile-cv-download"),
    path("profile/cv/preview/", DeveloperCVPreviewView.as_view(), name="profile-cv-preview"),
    path("profile/skills/", ProfileSkillView.as_view(), name="profile-skills"),
    path("skills/", SkillListView.as_view(), name="skills-list"),
    path("job-matches/", JobMatchesView.as_view(), name="job-matches"),
    path("developers/", DeveloperDirectoryView.as_view(), name="developer-directory"),
]
