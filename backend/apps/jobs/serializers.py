from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.accounts.models import DeveloperCV, DeveloperProfile, Skill
from apps.accounts.serializers import SkillSerializer
from .matching import required_skill_coverage_score
from .models import ApplicationMessage, Job, JobApplication
from .role_templates import MIN_REQUIRED_SKILLS

User = get_user_model()


class JobSerializer(serializers.ModelSerializer):
    employer_name = serializers.SerializerMethodField()
    required_skills = SkillSerializer(many=True, read_only=True)
    required_skill_ids = serializers.PrimaryKeyRelatedField(
        source="required_skills", many=True, queryset=Skill.objects.all(), write_only=True, required=False
    )
    application_count = serializers.SerializerMethodField()
    has_applied = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = ["id", "employer", "employer_name", "title", "description", "salary_range", "location_type", "required_skills", "required_skill_ids", "created_at", "application_count", "has_applied"]
        read_only_fields = ["id", "employer", "employer_name", "created_at", "application_count", "has_applied"]

    def validate(self, attrs):
        if "required_skills" in attrs and len({skill.pk for skill in attrs["required_skills"]}) < MIN_REQUIRED_SKILLS:
            raise serializers.ValidationError({"required_skill_ids": f"Choose at least {MIN_REQUIRED_SKILLS} required skills."})
        if self.instance is None and len({skill.pk for skill in attrs.get("required_skills", [])}) < MIN_REQUIRED_SKILLS:
            raise serializers.ValidationError({"required_skill_ids": f"Choose at least {MIN_REQUIRED_SKILLS} required skills."})
        return attrs

    def get_employer_name(self, obj):
        return obj.employer.company_name or obj.employer.get_full_name() or obj.employer.username

    def get_application_count(self, obj):
        count = getattr(obj, "applicant_count", None)
        return count if count is not None else obj.applications.count()

    def get_has_applied(self, obj):
        return bool(getattr(obj, "has_applied", False))


class ApplicationSerializer(serializers.ModelSerializer):
    job = serializers.SerializerMethodField()
    applicant = serializers.SerializerMethodField()
    match_score = serializers.SerializerMethodField()

    class Meta:
        model = JobApplication
        fields = ["id", "job", "applicant", "status", "cover_letter", "applied_at", "match_score"]
        read_only_fields = ["id", "job", "applicant", "applied_at", "match_score"]

    def get_job(self, obj):
        return {
            "id": obj.job_id,
            "title": obj.job.title,
            "employer_name": obj.job.employer.company_name or obj.job.employer.get_full_name() or obj.job.employer.username,
            "location_type": obj.job.location_type,
            "salary_range": obj.job.salary_range,
            "required_skills": SkillSerializer(obj.job.required_skills.all(), many=True).data,
        }

    def get_applicant(self, obj):
        user = obj.applicant
        profile = getattr(user, "developer_profile", None)
        has_cv = getattr(obj, "applicant_has_cv", None)
        if has_cv is None:
            has_cv = DeveloperCV.objects.filter(developer_id=user.id).exists()
        return {
            "id": user.id,
            "username": user.username,
            "location": user.location,
            "bio": profile.bio if profile else "",
            "years_experience": profile.years_experience if profile else 0,
            "skills": SkillSerializer(profile.skills.all(), many=True).data if profile else [],
            "github_url": profile.github_url if profile else "",
            "linkedin_url": profile.linkedin_url if profile else "",
            "has_cv": bool(has_cv),
        }

    def get_match_score(self, obj):
        profile = getattr(obj.applicant, "developer_profile", None)
        if not profile:
            return 0.0
        return required_skill_coverage_score(
            profile.skills.values_list("name", flat=True),
            obj.job.required_skills.values_list("name", flat=True),
        )


class ApplicationMessageSerializer(serializers.ModelSerializer):
    application_id = serializers.IntegerField(read_only=True)
    sender_id = serializers.IntegerField(read_only=True)
    sender_name = serializers.CharField(source="sender.username", read_only=True)

    class Meta:
        model = ApplicationMessage
        fields = ["id", "application_id", "sender_id", "sender_name", "body", "created_at"]
        read_only_fields = ["id", "application_id", "sender_id", "sender_name", "created_at"]

    def validate_body(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Write a message before sending.")
        return value
