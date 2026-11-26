from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import DeveloperProfile, Skill, User


@admin.register(User)
class DAEMatchUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("DAEMatch", {"fields": ("role", "location")}),)
    add_fieldsets = UserAdmin.add_fieldsets + (("DAEMatch", {"fields": ("email", "role", "location")}),)


admin.site.register(DeveloperProfile)
admin.site.register(Skill)
