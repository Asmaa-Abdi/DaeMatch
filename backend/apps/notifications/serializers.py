from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    application_id = serializers.IntegerField(read_only=True, allow_null=True)
    job_id = serializers.SerializerMethodField()
    job_title = serializers.SerializerMethodField()
    applicant_name = serializers.SerializerMethodField()
    employer_name = serializers.SerializerMethodField()
    message = serializers.SerializerMethodField()
    match_score = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "id",
            "event_type",
            "application_id",
            "job_id",
            "job_title",
            "applicant_name",
            "employer_name",
            "message",
            "match_score",
            "is_read",
            "created_at",
        ]
        read_only_fields = fields

    def _job(self, obj):
        return obj.job if obj.job_id else obj.application.job

    def get_job_title(self, obj):
        return self._job(obj).title

    def get_job_id(self, obj):
        return self._job(obj).pk

    def get_applicant_name(self, obj):
        return obj.application.applicant.username if obj.application_id else None

    def get_employer_name(self, obj):
        employer = self._job(obj).employer
        return employer.company_name or employer.get_full_name() or employer.username

    def get_message(self, obj):
        job = self._job(obj)
        if obj.event_type == Notification.EventType.JOB_MATCH_HIGH:
            score = float(obj.match_score or 0)
            return f"A strong skills match ({score:.1f}%) was found for {job.title}."
        job_title = job.title
        if obj.event_type == Notification.EventType.APPLICATION_RECEIVED:
            return f"{obj.application.applicant.username} applied for {job_title}."
        if obj.event_type == Notification.EventType.APPLICATION_ACCEPTED:
            return f"Your application for {job_title} was accepted by {self.get_employer_name(obj)}."
        return f"Your application for {job_title} was not selected by {self.get_employer_name(obj)}."

    def get_match_score(self, obj):
        return float(obj.match_score) if obj.match_score is not None else None
