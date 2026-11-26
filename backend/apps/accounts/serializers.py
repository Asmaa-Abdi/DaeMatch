from django.contrib.auth import get_user_model, password_validation
from django.utils.text import slugify
from rest_framework import serializers

from .models import DeveloperProfile, Skill

User = get_user_model()


class SkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = ["id", "name"]


class RegisterSerializer(serializers.ModelSerializer):
    username = serializers.CharField(required=False, max_length=150)
    password = serializers.CharField(write_only=True, min_length=8, style={"input_type": "password"})
    location = serializers.CharField(max_length=120)
    company_name = serializers.CharField(required=False, max_length=160)
    company_website = serializers.URLField(required=False, max_length=250)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password", "role", "location", "company_name", "company_website"]
        read_only_fields = ["id"]

    def validate_email(self, value):
        return value.strip().lower()

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def validate(self, attrs):
        if attrs["role"] == User.Role.DEVELOPER:
            if not attrs.get("username", "").strip():
                raise serializers.ValidationError({"username": "This field is required for developer accounts."})
            attrs.pop("company_name", None)
            attrs.pop("company_website", None)
            return attrs

        if not attrs.get("company_name", "").strip():
            raise serializers.ValidationError({"company_name": "This field is required for employer accounts."})
        if not attrs.get("company_website", "").strip():
            raise serializers.ValidationError({"company_website": "This field is required for employer accounts."})

        base = (slugify(attrs["email"].split("@", 1)[0]) or "employer")[:145]
        username = base
        suffix = 2
        while User.objects.filter(username=username).exists():
            suffix_text = f"-{suffix}"
            username = f"{base[:150 - len(suffix_text)]}{suffix_text}"
            suffix += 1
        attrs["username"] = username
        return attrs

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        if user.role == User.Role.DEVELOPER:
            DeveloperProfile.objects.create(user=user)
        return user


class ProfileSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    role = serializers.CharField(read_only=True)
    location = serializers.CharField(required=False, allow_blank=True, max_length=120)
    company_name = serializers.CharField(required=False, allow_blank=True, max_length=160)
    company_website = serializers.URLField(required=False, allow_blank=True, max_length=250)
    bio = serializers.CharField(required=False, allow_blank=True, max_length=1200)
    github_url = serializers.URLField(required=False, allow_blank=True, max_length=250)
    linkedin_url = serializers.URLField(required=False, allow_blank=True, max_length=250)
    years_experience = serializers.IntegerField(required=False, min_value=0, max_value=80)
    is_open_to_work = serializers.BooleanField(required=False)

    def to_representation(self, instance):
        result = {
            "id": instance.id,
            "username": instance.username,
            "email": instance.email,
            "role": instance.role,
            "location": instance.location,
            "company_name": instance.company_name,
            "company_website": instance.company_website,
            "bio": "",
            "github_url": "",
            "linkedin_url": "",
            "years_experience": 0,
            "is_open_to_work": False,
            "skills": [],
        }
        profile = getattr(instance, "developer_profile", None)
        if profile:
            result.update({
                "bio": profile.bio,
                "github_url": profile.github_url,
                "linkedin_url": profile.linkedin_url,
                "years_experience": profile.years_experience,
                "is_open_to_work": profile.is_open_to_work,
                "skills": SkillSerializer(profile.skills.all(), many=True).data,
            })
        return result

    def update(self, instance, validated_data):
        user_updates = []
        for field in ("location", "company_name", "company_website"):
            if field not in validated_data:
                continue
            value = validated_data.pop(field)
            if field == "location" or instance.role == User.Role.EMPLOYER:
                setattr(instance, field, value.strip())
                user_updates.append(field)
        if user_updates:
            instance.save(update_fields=user_updates)
        if instance.role == User.Role.DEVELOPER:
            profile, _ = DeveloperProfile.objects.get_or_create(user=instance)
            for field in ("bio", "github_url", "linkedin_url", "years_experience", "is_open_to_work"):
                if field in validated_data:
                    setattr(profile, field, validated_data[field])
            profile.save()
            instance._state.fields_cache["developer_profile"] = profile
        return instance


class DeveloperSummarySerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    location = serializers.CharField(source="user.location", read_only=True)
    bio = serializers.CharField(read_only=True)
    github_url = serializers.URLField(read_only=True)
    linkedin_url = serializers.URLField(read_only=True)
    skills = SkillSerializer(many=True, read_only=True)
    match_score = serializers.FloatField(read_only=True, default=0)

    class Meta:
        model = DeveloperProfile
        fields = ["id", "username", "location", "bio", "github_url", "linkedin_url", "years_experience", "is_open_to_work", "skills", "match_score"]


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=64)
    token = serializers.CharField(max_length=256)
    new_password = serializers.CharField(
        write_only=True,
        min_length=8,
        max_length=128,
        trim_whitespace=False,
        style={"input_type": "password"},
    )
    confirm_password = serializers.CharField(
        write_only=True,
        min_length=8,
        max_length=128,
        trim_whitespace=False,
        style={"input_type": "password"},
    )

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return attrs
