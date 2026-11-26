from django.core.management.base import BaseCommand

from apps.accounts.models import Skill
from apps.jobs.role_templates import ROLE_TEMPLATES


class Command(BaseCommand):
    help = "Create the DAEMatch common skill choices if they are missing."

    def handle(self, *args, **options):
        names = list(dict.fromkeys(name for skills in ROLE_TEMPLATES.values() for name in skills))
        created = 0
        for name in names:
            _, was_created = Skill.objects.get_or_create(name=name)
            created += int(was_created)
        self.stdout.write(self.style.SUCCESS(f"Skill catalog ready ({created} added, {len(names)} common skills)."))
