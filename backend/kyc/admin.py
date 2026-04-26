from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, KYCSubmission, Document, NotificationLog


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'email', 'role', 'is_active']
    list_filter = ['role']
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Role', {'fields': ('role', 'phone')}),
    )


@admin.register(KYCSubmission)
class KYCSubmissionAdmin(admin.ModelAdmin):
    list_display = ['merchant', 'status', 'business_name', 'submitted_at', 'is_sla_at_risk']
    list_filter = ['status']
    readonly_fields = ['created_at', 'updated_at', 'submitted_at', 'review_started_at', 'decided_at']


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ['submission', 'doc_type', 'original_filename', 'file_size', 'uploaded_at']


@admin.register(NotificationLog)
class NotificationLogAdmin(admin.ModelAdmin):
    list_display = ['merchant', 'event_type', 'timestamp']
    readonly_fields = ['timestamp']
