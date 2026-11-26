from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Connection

User = get_user_model()


class ConnectionApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.sender = User.objects.create_user(username="talent", email="talent@example.com", password="StrongPass!834", role=User.Role.DEVELOPER, location="Mogadishu")
        self.receiver = User.objects.create_user(username="employer", email="employer@example.com", password="StrongPass!834", role=User.Role.EMPLOYER, location="Nairobi")

    def test_connection_request_and_receiver_acceptance(self):
        self.client.force_authenticate(user=self.sender)
        created = self.client.post("/api/network/connections/", {"receiver_id": self.receiver.id}, format="json")
        self.assertEqual(created.status_code, 201)
        connection_id = created.data["id"]
        self.assertEqual(created.data["status"], "pending")

        self.client.force_authenticate(user=self.receiver)
        denied = self.client.post(f"/api/network/connections/{connection_id}/accept/", {}, format="json")
        self.assertEqual(denied.status_code, 200)
        self.assertEqual(denied.data["status"], "accepted")
        self.assertEqual(Connection.objects.get(pk=connection_id).status, Connection.Status.ACCEPTED)
        self.assertEqual(self.client.get("/api/network/connections/").data[0]["sender"]["username"], "talent")
