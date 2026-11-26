from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction

from .email import queue_notification_email
from .models import EmailDelivery, Notification


@transaction.atomic
def create_application_notification(*, recipient, application, event_type: str) -> tuple[Notification, bool]:
    notification, created = Notification.objects.get_or_create(
        recipient=recipient,
        application=application,
        event_type=event_type,
    )
    if created:
        delivery = EmailDelivery.objects.create(notification=notification)
        delivery_id = delivery.pk
        transaction.on_commit(lambda: queue_notification_email(delivery_id))
    return notification, created


def create_high_match_notification(*, recipient, job, score: float) -> tuple[Notification | None, bool]:
    if getattr(recipient, "role", None) != "developer":
        return None, False

    score_value = Decimal(str(score)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    if score_value <= Decimal("85.0"):
        return None, False

    with transaction.atomic():
        notification, created = Notification.objects.get_or_create(
            recipient=recipient,
            job=job,
            event_type=Notification.EventType.JOB_MATCH_HIGH,
            defaults={"match_score": score_value},
        )
        if created:
            delivery = EmailDelivery.objects.create(notification=notification)
            delivery_id = delivery.pk
            transaction.on_commit(lambda: queue_notification_email(delivery_id))
    return notification, created
