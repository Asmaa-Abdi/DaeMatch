from rest_framework import serializers

from apps.accounts.models import User
from .models import Connection


class UserSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "location"]


class ConnectionSerializer(serializers.ModelSerializer):
    sender = UserSummarySerializer(read_only=True)
    receiver = UserSummarySerializer(read_only=True)

    class Meta:
        model = Connection
        fields = ["id", "sender", "receiver", "status", "created_at"]
        read_only_fields = ["id", "sender", "receiver", "status", "created_at"]
