import os
import mimetypes
from django.conf import settings
from rest_framework import serializers
from .models import User, KYCSubmission, Document, NotificationLog, KYCStateMachine as SM


# ── AUTH ──────────────────────────────────────────────────────────────────────

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    role     = serializers.ChoiceField(choices=[('merchant','Merchant'),('reviewer','Reviewer')], default='merchant')

    class Meta:
        model  = User
        fields = ['username', 'email', 'password', 'role', 'phone']

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
            role=validated_data.get('role', User.MERCHANT),
            phone=validated_data.get('phone', ''),
        )


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model  = User
        fields = ['id', 'username', 'email', 'role', 'phone']


# ── FILE VALIDATION ───────────────────────────────────────────────────────────

def validate_upload_file(file):
    """
    Server-side file validation.
    We do NOT trust the Content-Type header from the client.
    """
    # 1. Size check first — fast, before any disk IO
    if file.size > settings.MAX_UPLOAD_SIZE_BYTES:
        raise serializers.ValidationError(
            f"File too large: {file.size / (1024*1024):.1f} MB. Maximum allowed: 5 MB."
        )

    # 2. Extension check — from filename, not from client header
    _, ext = os.path.splitext(file.name.lower())
    if ext not in settings.ALLOWED_UPLOAD_EXTENSIONS:
        raise serializers.ValidationError(
            f"Invalid file type '{ext}'. Accepted types: PDF, JPG, PNG."
        )

    # 3. MIME check using Python stdlib — independent of client-supplied Content-Type
    guessed_mime, _ = mimetypes.guess_type(file.name)
    if guessed_mime not in ['application/pdf', 'image/jpeg', 'image/png']:
        raise serializers.ValidationError(
            f"File MIME type not allowed: {guessed_mime}."
        )

    return file


# ── DOCUMENT ──────────────────────────────────────────────────────────────────

class DocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model  = Document
        fields = ['id', 'doc_type', 'file_url', 'original_filename',
                  'file_size', 'mime_type', 'uploaded_at']

    def get_file_url(self, obj):
        """
        Always returns the full URL whether file is on Cloudinary or local disk.
        Cloudinary URLs look like: https://res.cloudinary.com/your_cloud/...
        Local URLs look like: http://localhost:8000/media/...
        """
        return obj.get_file_url()


class DocumentUploadSerializer(serializers.Serializer):
    doc_type = serializers.ChoiceField(choices=Document.DOC_TYPES)
    file     = serializers.FileField()

    def validate_file(self, file):
        return validate_upload_file(file)


# ── KYC SUBMISSION ────────────────────────────────────────────────────────────

class KYCSubmissionSerializer(serializers.ModelSerializer):
    documents          = DocumentSerializer(many=True, read_only=True)
    merchant_username  = serializers.CharField(source='merchant.username', read_only=True)
    is_sla_at_risk     = serializers.SerializerMethodField()
    time_in_queue_hours = serializers.SerializerMethodField()

    class Meta:
        model  = KYCSubmission
        fields = [
            'id', 'merchant_username',
            'full_name', 'email', 'phone',
            'business_name', 'business_type', 'monthly_volume_usd',
            'status', 'reviewer_note',
            'created_at', 'submitted_at', 'review_started_at', 'decided_at', 'updated_at',
            'is_sla_at_risk', 'time_in_queue_hours',
            'documents',
        ]
        read_only_fields = ['status', 'created_at', 'submitted_at', 'review_started_at',
                            'decided_at', 'updated_at', 'merchant_username']

    def get_is_sla_at_risk(self, obj):
        return obj.is_sla_at_risk

    def get_time_in_queue_hours(self, obj):
        if not obj.submitted_at:
            return None
        from django.utils import timezone
        return round((timezone.now() - obj.submitted_at).total_seconds() / 3600, 1)


class KYCUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = KYCSubmission
        fields = ['full_name', 'email', 'phone',
                  'business_name', 'business_type', 'monthly_volume_usd']


class StateTransitionSerializer(serializers.Serializer):
    new_status = serializers.ChoiceField(choices=SM.choices())
    note       = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, data):
        submission = self.context['submission']
        try:
            SM.validate(submission.status, data['new_status'])
        except SM.InvalidTransition as e:
            raise serializers.ValidationError({'new_status': str(e)})
        return data


class ReviewerDashboardSerializer(serializers.ModelSerializer):
    merchant_username   = serializers.CharField(source='merchant.username')
    is_sla_at_risk      = serializers.SerializerMethodField()
    time_in_queue_hours = serializers.SerializerMethodField()
    document_count      = serializers.SerializerMethodField()

    class Meta:
        model  = KYCSubmission
        fields = ['id', 'merchant_username', 'business_name', 'business_type',
                  'monthly_volume_usd', 'status', 'submitted_at',
                  'is_sla_at_risk', 'time_in_queue_hours', 'document_count']

    def get_is_sla_at_risk(self, obj):
        return obj.is_sla_at_risk

    def get_time_in_queue_hours(self, obj):
        if not obj.submitted_at:
            return None
        from django.utils import timezone
        return round((timezone.now() - obj.submitted_at).total_seconds() / 3600, 1)

    def get_document_count(self, obj):
        return obj.documents.count()


class NotificationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model  = NotificationLog
        fields = ['id', 'event_type', 'timestamp', 'payload']
