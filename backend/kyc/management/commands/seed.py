"""
Seed script: creates 2 merchants + 1 reviewer with test data.
Run: python manage.py seed
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from kyc.models import User, KYCSubmission, NotificationLog, KYCStateMachine as SM
from rest_framework.authtoken.models import Token


class Command(BaseCommand):
    help = 'Seed the database with test data'

    def handle(self, *args, **options):
        self.stdout.write('Seeding database...')

        # Reviewer
        reviewer, _ = User.objects.get_or_create(
            username='reviewer1',
            defaults={'email': 'reviewer@playto.so', 'role': User.REVIEWER}
        )
        reviewer.set_password('reviewer123')
        reviewer.save()
        token_r, _ = Token.objects.get_or_create(user=reviewer)
        self.stdout.write(f'  Reviewer: reviewer1 / reviewer123  (token: {token_r.key})')

        # Merchant 1 — draft state
        m1, _ = User.objects.get_or_create(
            username='merchant_draft',
            defaults={'email': 'draft@example.com', 'role': User.MERCHANT}
        )
        m1.set_password('merchant123')
        m1.save()
        token_m1, _ = Token.objects.get_or_create(user=m1)

        sub1, _ = KYCSubmission.objects.get_or_create(merchant=m1)
        sub1.full_name = 'Rahul Sharma'
        sub1.email = 'rahul@example.com'
        sub1.phone = '+91-9876543210'
        sub1.business_name = 'Sharma Digital Agency'
        sub1.business_type = 'agency'
        sub1.monthly_volume_usd = 5000
        sub1.status = SM.DRAFT
        sub1.save()
        self.stdout.write(f'  Merchant 1 (draft): merchant_draft / merchant123  (token: {token_m1.key})')

        # Merchant 2 — under_review state, submitted 30 hours ago (SLA at risk)
        m2, _ = User.objects.get_or_create(
            username='merchant_review',
            defaults={'email': 'review@example.com', 'role': User.MERCHANT}
        )
        m2.set_password('merchant123')
        m2.save()
        token_m2, _ = Token.objects.get_or_create(user=m2)

        sub2, _ = KYCSubmission.objects.get_or_create(merchant=m2)
        sub2.full_name = 'Priya Patel'
        sub2.email = 'priya@example.com'
        sub2.phone = '+91-9123456789'
        sub2.business_name = 'Patel Freelance Studio'
        sub2.business_type = 'freelancer'
        sub2.monthly_volume_usd = 2500
        sub2.status = SM.UNDER_REVIEW
        sub2.submitted_at = timezone.now() - timedelta(hours=30)  # triggers SLA flag
        sub2.review_started_at = timezone.now() - timedelta(hours=25)
        sub2.assigned_reviewer = reviewer
        sub2.save()

        NotificationLog.log(m2, 'kyc_submitted', {'submission_id': sub2.id})
        NotificationLog.log(m2, 'kyc_under_review', {'submission_id': sub2.id})
        self.stdout.write(f'  Merchant 2 (under_review, SLA at risk): merchant_review / merchant123  (token: {token_m2.key})')

        self.stdout.write(self.style.SUCCESS('\nSeed complete. Login credentials above.'))
        self.stdout.write('\nReviewer queue: GET /api/v1/reviewer/queue/')
        self.stdout.write('Login: POST /api/v1/auth/login/')
