from rest_framework.permissions import BasePermission


class IsDeveloper(BasePermission):
    message = "This action is available to developer accounts only."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "developer")


class IsEmployer(BasePermission):
    message = "This action is available to employer accounts only."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "employer")
