from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import logging
from threading import Timer

from django.conf import settings
from django.core.mail import send_mail
from django.db import close_old_connections, transaction
from django.db.models import Q
from django.utils import timezone

from .models import EmailDelivery, Notification

logger = logging.getLogger(__name__)
_EMAIL_EXECUTOR = ThreadPoolExecutor(max_workers=3, thread_name_prefix="daematch-application-email")
MAX_ATTEMPTS = 6
RETRY_BASE_SECONDS = 60
MAX_RETRY_SECONDS = 60 * 60
STALE_DELIVERY_MINUTES = 10


class PermanentDeliveryError(Exception):
    pass


def _email_content(notification: Notification) -> tuple[str, str]:
    frontend_url = settings.FRONTEND_URL.rstrip("/")

    if notification.event_type == Notification.EventType.JOB_MATCH_HIGH:
        if notification.job_id is None or notification.match_score is None:
            raise PermanentDeliveryError("High-match notification is missing its job or score.")
        job = notification.job
        score = f"{notification.match_score:.1f}%"
        subject = f"Strong AI match: {job.title} ({score})"
        message = (
            f"Your skills are a {score} match for {job.title}.\n\n"
            "Review the job and the skills behind your score in DAEMatch:\n"
            f"{frontend_url}/matches?job={job.id}"
        )
        return subject, message

    application = notification.application
    job = application.job
    employer = job.employer.company_name or job.employer.get_full_name() or job.employer.username
    if notification.event_type == Notification.EventType.APPLICATION_RECEIVED:
        subject = f"New application: {job.title}"
        message = (
            f"{application.applicant.username} has applied for your {job.title} role.\n\n"
            "Review the incoming applications in your DAEMatch employer dashboard:\n"
            f"{frontend_url}/employer?view=applications&refresh=1"
        )
    elif notification.event_type == Notification.EventType.APPLICATION_ACCEPTED:
        subject = f"Your application was accepted: {job.title}"
        message = (
            f"Good news: {employer} accepted your application for {job.title}.\n\n"
            "You can now message the employer in DAEMatch:\n"
            f"{frontend_url}/messages?application={application.id}"
        )
    else:
        subject = f"Application update: {job.title}"
        message = (
            f"{employer} decided not to move forward with your application for {job.title}.\n\n"
            "You can review other opportunities in DAEMatch:\n"
            f"{frontend_url}/jobs"
        )
    return subject, message


def _claim_delivery(delivery_id: int) -> tuple[int, int] | None:
    now = timezone.now()
    stale_before = now - timedelta(minutes=STALE_DELIVERY_MINUTES)
    with transaction.atomic():
        delivery = EmailDelivery.objects.select_for_update().filter(pk=delivery_id).first()
        if delivery is None or delivery.status in {EmailDelivery.Status.SENT, EmailDelivery.Status.FAILED}:
            return None
        if delivery.status == EmailDelivery.Status.PENDING and delivery.next_attempt_at > now:
            return None
        if (
            delivery.status == EmailDelivery.Status.SENDING
            and delivery.last_attempt_at is not None
            and delivery.last_attempt_at > stale_before
        ):
            return None

        delivery.status = EmailDelivery.Status.SENDING
        delivery.attempt_count += 1
        delivery.last_attempt_at = now
        delivery.save(update_fields=["status", "attempt_count", "last_attempt_at", "updated_at"])
        return delivery.notification_id, delivery.attempt_count


def _record_failure(delivery_id: int, attempt_count: int, error: Exception, *, permanent: bool = False) -> None:
    now = timezone.now()
    exhausted = permanent or attempt_count >= MAX_ATTEMPTS
    retry_seconds = min(RETRY_BASE_SECONDS * (2 ** max(attempt_count - 1, 0)), MAX_RETRY_SECONDS)
    EmailDelivery.objects.filter(pk=delivery_id).update(
        status=EmailDelivery.Status.FAILED if exhausted else EmailDelivery.Status.PENDING,
        next_attempt_at=now if exhausted else now + timedelta(seconds=retry_seconds),
        last_error=str(error)[:4000],
        updated_at=now,
    )
    if exhausted:
        logger.error("Application email delivery %s failed permanently: %s", delivery_id, error)
    else:
        logger.warning("Application email delivery %s failed; retry scheduled: %s", delivery_id, error)


def send_notification_email(delivery_id: int) -> bool:
    claimed = _claim_delivery(delivery_id)
    if claimed is None:
        return False
    notification_id, attempt_count = claimed

    try:
        notification = Notification.objects.select_related(
            "recipient",
            "job",
            "application__applicant",
            "application__job__employer",
        ).get(pk=notification_id)
        recipient_email = (notification.recipient.email or "").strip()
        if not recipient_email:
            raise PermanentDeliveryError("Notification recipient has no email address.")

        subject, message = _email_content(notification)
        sent_count = send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
        )
        if sent_count < 1:
            raise RuntimeError("Django's email backend did not accept the message.")
    except Notification.DoesNotExist as error:
        _record_failure(delivery_id, attempt_count, error, permanent=True)
        return False
    except PermanentDeliveryError as error:
        _record_failure(delivery_id, attempt_count, error, permanent=True)
        return False
    except Exception as error:
        _record_failure(delivery_id, attempt_count, error)
        logger.exception("Unable to deliver application email outbox record %s.", delivery_id)
        return False

    EmailDelivery.objects.filter(pk=delivery_id).update(
        status=EmailDelivery.Status.SENT,
        sent_at=timezone.now(),
        last_error="",
        updated_at=timezone.now(),
    )
    return True


def pending_email_delivery_ids(*, limit: int = 100) -> list[int]:
    now = timezone.now()
    stale_before = now - timedelta(minutes=STALE_DELIVERY_MINUTES)
    due = Q(status=EmailDelivery.Status.PENDING, next_attempt_at__lte=now) | Q(
        status=EmailDelivery.Status.SENDING,
        last_attempt_at__lte=stale_before,
    ) | Q(status=EmailDelivery.Status.SENDING, last_attempt_at__isnull=True)
    return list(
        EmailDelivery.objects.filter(due)
        .order_by("created_at", "id")
        .values_list("id", flat=True)[:limit]
    )


def queue_notification_email(delivery_id: int) -> None:
    try:
        _EMAIL_EXECUTOR.submit(_send_notification_email_in_worker, delivery_id)
    except Exception:
        logger.exception("Unable to queue email outbox record %s; it remains stored for recovery.", delivery_id)


def _send_notification_email_in_worker(delivery_id: int) -> None:
    close_old_connections()
    try:
        delivered = send_notification_email(delivery_id)
        if delivered:
            return
        delivery = EmailDelivery.objects.filter(pk=delivery_id, status=EmailDelivery.Status.PENDING).first()
        if delivery is None:
            return
        delay = max(1, (delivery.next_attempt_at - timezone.now()).total_seconds())
        timer = Timer(delay, queue_notification_email, args=(delivery_id,))
        timer.daemon = True
        timer.start()
    finally:
        close_old_connections()
