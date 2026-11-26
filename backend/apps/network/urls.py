from django.urls import path

from .views import AcceptConnectionView, ConnectionsView

urlpatterns = [
    path("connections/", ConnectionsView.as_view(), name="connections"),
    path("connections/<int:pk>/accept/", AcceptConnectionView.as_view(), name="connection-accept"),
]
