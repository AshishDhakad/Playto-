from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone
from datetime import timedelta


# ── STATE MACHINE ─────────────────────────────────────────────────────────────
# Single source of truth. All transition logic lives here and nowhere else.

class KYCStateMachine:
    DRAFT                = 'draft'
    SUBMITTED            = 'submitted'
    UNDER_REVIEW         = 'under_review'
    APPROVED             = 'approved'
    REJECTED             = 'rejected'
    MORE_INFO_REQUESTED  = 'more_info_requested'

    STATES = [DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, MORE_INFO_REQUESTED]

    TRANSITIONS = {
        DRAFT:               [SUBMITTED],
        SUBMITTED:           [UNDER_REVIEW],
        UNDER_REVIEW:        [APPROVED, REJECTED, MORE_INFO_REQUESTED],
        MORE_INFO_REQUESTED: [SUBMITTED],
        APPROVED:            [],   # terminal
        REJECTED:            [],   # terminal
    }

    class InvalidTransition(Exception):
        pass

    @classmethod
    def validate(cls, current: str, next_state: str) -> None:
        allowed = cls.TRANSITIONS.get(current, [])
        if next_state not in allowed:
            raise cls.InvalidTransition(
                f"Cannot move from '{current}' to '{next_state}'. "
                f"Allowed next states: {allowed or ['none (terminal state)']}"
            )

    @classmethod
    def choices(cls):
        return [(s, s.replace('_', ' ').title()) for s in cls.STATES]


SM = KYCStateMachine


# ── MODELS ────────────────────────────────────────────────────────────────────

class User(AbstractUser):
    MERCHANT = 'merchant'
    REVIEWER = 'reviewer'
    ROLE_CHOICES = [(MERCHANT, 'Merchant'), (REVIEWER, 'Reviewer')]

    role  = models.CharField(max_length=20, choices=ROLE_CHOICES, default=MERCHANT)
    phone = models.CharField(max_length=20, blank=True)

    @property
    def is_merchant(self):
        return self.role == self.MERCHANT

    @property
    def is_reviewer(self):
        return self.role == self.REVIEWER


class KYCSubmission(models.Model):
    BUSINESS_TYPES = [
        ('agency', 'Agency'), ('freelancer', 'Freelancer'),
        ('ecommerce', 'E-Commerce'), ('saas', 'SaaS'), ('other', 'Other'),
    ]

    merchant = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name='kyc_submission',
        limit_choices_to={'role': User.MERCHANT}
    )

    full_name  = models.CharField(max_length=200, blank=True)
    email      = models.EmailField(blank=True)
    phone      = models.CharField(max_length=20, blank=True)

    business_name       = models.CharField(max_length=200, blank=True)
    business_type       = models.CharField(max_length=50, choices=BUSINESS_TYPES, blank=True)
    monthly_volume_usd  = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    status = models.CharField(
        max_length=30, choices=SM.choices(), default=SM.DRAFT, db_index=True
    )

    assigned_reviewer = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='assigned_submissions',
        limit_choices_to={'role': User.REVIEWER}
    )
    reviewer_note = models.TextField(blank=True)

    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)
    submitted_at      = models.DateTimeField(null=True, blank=True)
    review_started_at = models.DateTimeField(null=True, blank=True)
    decided_at        = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['submitted_at']

    def __str__(self):
        return f"{self.merchant.username} — {self.status}"

    @property
    def is_sla_at_risk(self) -> bool:
        """Dynamically computed — never stored, never stale."""
        if self.status not in (SM.SUBMITTED, SM.UNDER_REVIEW, SM.MORE_INFO_REQUESTED):
            return False
        reference_time = self.submitted_at or self.created_at
        return (timezone.now() - reference_time) > timedelta(hours=24)

    def transition_to(self, new_status: str, reviewer=None, note: str = '') -> None:
        SM.validate(self.status, new_status)
        now = timezone.now()
        self.status = new_status
        if new_status == SM.SUBMITTED:
            self.submitted_at = now
        elif new_status == SM.UNDER_REVIEW:
            self.review_started_at = now
            if reviewer:
                self.assigned_reviewer = reviewer
        elif new_status in (SM.APPROVED, SM.REJECTED):
            self.decided_at = now
        if note:
            self.reviewer_note = note
        self.save()


class Document(models.Model):
    DOC_TYPES = [
        ('pan', 'PAN Card'),
        ('aadhaar', 'Aadhaar Card'),
        ('bank_statement', 'Bank Statement'),
    ]

    submission        = models.ForeignKey(KYCSubmission, on_delete=models.CASCADE, related_name='documents')
    doc_type          = models.CharField(max_length=30, choices=DOC_TYPES)

    # FileField uses DEFAULT_FILE_STORAGE from settings
    # → Cloudinary in production, local disk in dev
    file              = models.FileField(upload_to='kyc_documents/')
    original_filename = models.CharField(max_length=255)
    file_size         = models.PositiveIntegerField()   # bytes
    mime_type         = models.CharField(max_length=100)
    uploaded_at       = models.DateTimeField(auto_now_add=True)

    # Cloudinary public_id stored separately so we can delete old files
    cloudinary_public_id = models.CharField(max_length=300, blank=True)

    class Meta:
        unique_together = ('submission', 'doc_type')

    def __str__(self):
        return f"{self.doc_type} for {self.submission}"

    def get_file_url(self):
        """Returns the correct URL regardless of storage backend."""
        try:
            return self.file.url
        except Exception:
            return None


class NotificationLog(models.Model):
    merchant   = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    event_type = models.CharField(max_length=100)
    timestamp  = models.DateTimeField(auto_now_add=True)
    payload    = models.JSONField(default=dict)
    sent       = models.BooleanField(default=False)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.event_type} → {self.merchant.username} at {self.timestamp}"

    @classmethod
    def log(cls, merchant: User, event_type: str, payload: dict = None):
        return cls.objects.create(
            merchant=merchant,
            event_type=event_type,
            payload=payload or {},
        )
