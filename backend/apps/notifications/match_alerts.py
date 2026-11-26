from apps.accounts.models import DeveloperProfile
from apps.jobs.matching import required_skill_coverage_score
from apps.jobs.models import Job, JobApplication

from .services import create_high_match_notification


HIGH_MATCH_THRESHOLD = 85.0


def evaluate_high_match_alerts(*, developer_id: int | None = None, job_id: int | None = None) -> int:
    """Persist one alert for each eligible developer/job pair above the strict threshold."""
    if (developer_id is None) == (job_id is None):
        raise ValueError("Provide exactly one of developer_id or job_id.")

    jobs = Job.objects.prefetch_related("required_skills")
    profiles = DeveloperProfile.objects.select_related("user").prefetch_related("skills")

    if developer_id is not None:
        profiles = profiles.filter(user_id=developer_id)
        applied_job_ids = set(
            JobApplication.objects.filter(applicant_id=developer_id).values_list("job_id", flat=True)
        )
        applied_developer_ids: set[int] = set()
    else:
        jobs = jobs.filter(pk=job_id)
        applied_developer_ids = set(
            JobApplication.objects.filter(job_id=job_id).values_list("applicant_id", flat=True)
        )
        applied_job_ids = set()

    created_count = 0
    for profile in profiles:
        developer_skills = [skill.name for skill in profile.skills.all()]
        if not developer_skills:
            continue

        for job in jobs:
            if developer_id is not None and job.pk in applied_job_ids:
                continue
            if job_id is not None and profile.user_id in applied_developer_ids:
                continue

            required_skills = [skill.name for skill in job.required_skills.all()]
            score = required_skill_coverage_score(developer_skills, required_skills)
            if score <= HIGH_MATCH_THRESHOLD:
                continue

            _, created = create_high_match_notification(
                recipient=profile.user,
                job=job,
                score=score,
            )
            created_count += int(created)

    return created_count
