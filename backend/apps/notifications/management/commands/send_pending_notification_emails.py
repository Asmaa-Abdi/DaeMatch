from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.notifications.email import pending_email_delivery_ids, send_notification_email
from apps.notifications.models import EmailDelivery


class Command(BaseCommand):
    help = "Send due application notification emails stored in the database outbox."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=100, help="Maximum number of due emails to process.")
        parser.add_argument(
            "--retry-failed",
            action="store_true",
            help="Reset permanently failed emails and retry them once more.",
        )

    def handle(self, *args, **options):
        limit = options["limit"]
        if limit < 1:
            raise CommandError("--limit must be a positive integer.")

        if options["retry_failed"]:
            EmailDelivery.objects.filter(status=EmailDelivery.Status.FAILED).update(
                status=EmailDelivery.Status.PENDING,
                attempt_count=0,
                next_attempt_at=timezone.now(),
                last_error="",
                last_attempt_at=None,
            )

        delivery_ids = pending_email_delivery_ids(limit=limit)
        delivered = sum(1 for delivery_id in delivery_ids if send_notification_email(delivery_id))
        self.stdout.write(self.style.SUCCESS(f"Delivered {delivered} of {len(delivery_ids)} due notification emails."))
