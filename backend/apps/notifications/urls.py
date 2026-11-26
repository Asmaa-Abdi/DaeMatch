from django.urls import path

from .views import NotificationFeedView, NotificationReadAllView, NotificationReadView

urlpatterns = [
    path("", NotificationFeedView.as_view(), name="notification-feed"),
    path("read-all/", NotificationReadAllView.as_view(), name="notification-read-all"),
    path("<int:pk>/read/", NotificationReadView.as_view(), name="notification-read"),
]
