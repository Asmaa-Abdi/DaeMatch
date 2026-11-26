from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Connection
from .serializers import ConnectionSerializer

User = get_user_model()


class ConnectionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = Connection.objects.filter(sender=request.user) | Connection.objects.filter(receiver=request.user)
        queryset = queryset.select_related("sender", "receiver").order_by("-created_at")
        return Response(ConnectionSerializer(queryset, many=True).data)

    def post(self, request):
        receiver_id = request.data.get("receiver_id")
        if not receiver_id:
            return Response({"receiver_id": ["Choose a user to connect with."]}, status=status.HTTP_400_BAD_REQUEST)
        receiver = get_object_or_404(User, pk=receiver_id)
        if receiver == request.user:
            return Response({"detail": "You cannot connect with yourself."}, status=status.HTTP_400_BAD_REQUEST)
        connection = Connection.objects.filter(sender=request.user, receiver=receiver).first()
        if connection:
            return Response(ConnectionSerializer(connection).data, status=status.HTTP_200_OK)
        reverse = Connection.objects.filter(sender=receiver, receiver=request.user, status=Connection.Status.PENDING).first()
        if reverse:
            reverse.status = Connection.Status.ACCEPTED
            reverse.save(update_fields=["status"])
            return Response(ConnectionSerializer(reverse).data, status=status.HTTP_200_OK)
        try:
            connection = Connection.objects.create(sender=request.user, receiver=receiver)
        except IntegrityError:
            connection = Connection.objects.get(sender=request.user, receiver=receiver)
        return Response(ConnectionSerializer(connection).data, status=status.HTTP_201_CREATED)


class AcceptConnectionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        connection = get_object_or_404(Connection, pk=pk, receiver=request.user)
        connection.status = Connection.Status.ACCEPTED
        connection.save(update_fields=["status"])
        return Response(ConnectionSerializer(connection).data)
