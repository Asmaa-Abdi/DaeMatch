from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        DEVELOPER = "developer", "Developer"
        EMPLOYER = "employer", "Employer"

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=12, choices=Role.choices)
    location = models.CharField(max_length=120, blank=True)
    company_name = models.CharField(max_length=160, blank=True)
    company_website = models.URLField(blank=True, max_length=250)

    def __str__(self) -> str:
        return self.get_full_name() or self.username


class Skill(models.Model):
    name = models.CharField(max_length=64, unique=True)

    class Meta:
        ordering = ["name"]

    def save(self, *args, **kwargs):
        self.name = " ".join(self.name.strip().split())
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class DeveloperCV(models.Model):
    developer = models.OneToOneField(User, on_delete=models.CASCADE, related_name="cv_document")
    file_name = models.CharField(max_length=180)
    content_type = models.CharField(max_length=120)
    size_bytes = models.PositiveIntegerField()
    content = models.BinaryField()
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.developer.username}'s CV"


class DeveloperProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="developer_profile")
    bio = models.TextField(blank=True, max_length=1200)
    github_url = models.URLField(blank=True, max_length=250)
    linkedin_url = models.URLField(blank=True, max_length=250)
    years_experience = models.PositiveSmallIntegerField(default=0)
    skills = models.ManyToManyField(Skill, blank=True, related_name="developers")
    is_open_to_work = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.user.username}'s developer profile"
