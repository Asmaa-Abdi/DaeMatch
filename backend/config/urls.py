from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"status": "ok", "service": "daematch-api"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health, name="health"),
    path("api/users/", include("apps.accounts.urls")),
    path("api/jobs/", include("apps.jobs.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
    path("api/network/", include("apps.network.urls")),
    path("api/public/", include("apps.accounts.public_urls")),
]
