from django.conf import settings
from django.db import models
from django.utils import timezone


class Notification(models.Model):
    class EventType(models.TextChoices):
        APPLICATION_RECEIVED = "application_received", "Application received"
        APPLICATION_ACCEPTED = "application_accepted", "Application accepted"
        APPLICATION_REJECTED = "application_rejected", "Application rejected"
        JOB_MATCH_HIGH = "job_match_high", "High AI job match"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    application = models.ForeignKey(
        "jobs.JobApplication",
        on_delete=models.CASCADE,
        related_name="notifications",
        null=True,
        blank=True,
    )
    job = models.ForeignKey(
        "jobs.Job",
        on_delete=models.CASCADE,
        related_name="notifications",
        null=True,
        blank=True,
    )
    event_type = models.CharField(max_length=32, choices=EventType.choices)
    match_score = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    is_read = models.BooleanField(default=False)  # pyright: ignore[reportArgumentType]
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["recipient", "application", "event_type"],
                name="unique_notification_per_application_event",
            ),
            models.UniqueConstraint(
                fields=["recipient", "job", "event_type"],
                condition=models.Q(job__isnull=False),
                name="notif_job_event_once",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(application__isnull=False, job__isnull=True)
                    | models.Q(application__isnull=True, job__isnull=False)
                ),
                name="notif_one_target",
            ),
        ]


class EmailDelivery(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    notification = models.OneToOneField(
        Notification,
        on_delete=models.CASCADE,
        related_name="email_delivery",
    )
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    attempt_count = models.PositiveIntegerField(default=0)  # pyright: ignore[reportArgumentType]
    next_attempt_at = models.DateTimeField(default=timezone.now)
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["status", "next_attempt_at"], name="notif_email_due_idx")]

    def __str__(self):
        return f"Email delivery #{self.pk}"
