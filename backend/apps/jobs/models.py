from django.conf import settings
from django.db import models

from apps.accounts.models import Skill


class Job(models.Model):
    class LocationType(models.TextChoices):
        REMOTE = "remote", "Remote"
        ONSITE = "onsite", "On-site"
        HYBRID = "hybrid", "Hybrid"

    employer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="jobs")
    title = models.CharField(max_length=160)
    description = models.TextField(max_length=12000)
    salary_range = models.CharField(max_length=120, blank=True)
    location_type = models.CharField(max_length=10, choices=LocationType.choices, default=LocationType.REMOTE)
    required_skills = models.ManyToManyField(Skill, blank=True, related_name="jobs")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title


class JobApplication(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        REVIEWED = "reviewed", "Reviewed"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"

    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="applications")
    applicant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="job_applications")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    cover_letter = models.TextField(blank=True, max_length=3000)
    applied_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-applied_at"]
        constraints = [models.UniqueConstraint(fields=["job", "applicant"], name="unique_job_applicant")]

    def __str__(self) -> str:
        return f"{self.applicant.username} → {self.job.title}"


class ApplicationMessage(models.Model):
    application = models.ForeignKey(JobApplication, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="application_messages")
    body = models.TextField(max_length=5000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"Application message {self.pk}"
