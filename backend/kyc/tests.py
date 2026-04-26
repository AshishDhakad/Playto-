"""
Tests for KYC state machine and authorization.
Run: python manage.py test kyc
"""
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token

from .models import User, KYCSubmission, KYCStateMachine as SM


def make_user(username, role=User.MERCHANT, password='pass123'):
    u = User.objects.create_user(username=username, password=password, role=role)
    return u, Token.objects.create(user=u)


class StateMachineUnitTests(TestCase):
    """Pure unit tests for the state machine — no HTTP."""

    def test_draft_to_submitted_is_legal(self):
        SM.validate(SM.DRAFT, SM.SUBMITTED)  # should not raise

    def test_submitted_to_under_review_is_legal(self):
        SM.validate(SM.SUBMITTED, SM.UNDER_REVIEW)

    def test_under_review_to_approved_is_legal(self):
        SM.validate(SM.UNDER_REVIEW, SM.APPROVED)

    def test_under_review_to_rejected_is_legal(self):
        SM.validate(SM.UNDER_REVIEW, SM.REJECTED)

    def test_more_info_back_to_submitted_is_legal(self):
        SM.validate(SM.MORE_INFO_REQUESTED, SM.SUBMITTED)

    def test_approved_to_draft_is_illegal(self):
        with self.assertRaises(SM.InvalidTransition):
            SM.validate(SM.APPROVED, SM.DRAFT)

    def test_approved_to_rejected_is_illegal(self):
        with self.assertRaises(SM.InvalidTransition):
            SM.validate(SM.APPROVED, SM.REJECTED)

    def test_draft_to_approved_is_illegal(self):
        with self.assertRaises(SM.InvalidTransition):
            SM.validate(SM.DRAFT, SM.APPROVED)

    def test_rejected_terminal_state(self):
        with self.assertRaises(SM.InvalidTransition):
            SM.validate(SM.REJECTED, SM.SUBMITTED)

    def test_invalid_transition_error_message(self):
        try:
            SM.validate(SM.APPROVED, SM.DRAFT)
        except SM.InvalidTransition as e:
            self.assertIn('approved', str(e))
            self.assertIn('draft', str(e))


class StateTransitionAPITests(TestCase):
    """Integration tests: illegal transitions must return 400 from the API."""

    def setUp(self):
        self.client = APIClient()
        self.merchant, self.m_token = make_user('merchant1')
        self.reviewer, self.r_token = make_user('reviewer1', role=User.REVIEWER)
        self.sub = KYCSubmission.objects.create(
            merchant=self.merchant,
            full_name='Test User', email='t@t.com', phone='123',
            business_name='Test Co', business_type='agency',
            monthly_volume_usd=1000,
            status=SM.UNDER_REVIEW,
            submitted_at=timezone.now(),
        )

    def auth_reviewer(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.r_token.key}')

    def auth_merchant(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.m_token.key}')

    def test_illegal_transition_approved_to_draft_returns_400(self):
        """Core test: once approved, cannot go back to draft."""
        self.sub.status = SM.APPROVED
        self.sub.save()

        self.auth_reviewer()
        response = self.client.post(
            f'/api/v1/reviewer/submissions/{self.sub.id}/transition/',
            {'new_status': 'draft'},
            format='json'
        )
        self.assertEqual(response.status_code, 400)

    def test_illegal_transition_approved_to_rejected_returns_400(self):
        """Cannot move from approved to rejected."""
        self.sub.status = SM.APPROVED
        self.sub.save()

        self.auth_reviewer()
        response = self.client.post(
            f'/api/v1/reviewer/submissions/{self.sub.id}/transition/',
            {'new_status': SM.REJECTED},
            format='json'
        )
        self.assertEqual(response.status_code, 400)

    def test_legal_transition_under_review_to_approved(self):
        """under_review → approved should succeed."""
        self.auth_reviewer()
        response = self.client.post(
            f'/api/v1/reviewer/submissions/{self.sub.id}/transition/',
            {'new_status': SM.APPROVED, 'note': 'All documents verified.'},
            format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.status, SM.APPROVED)

    def test_merchant_cannot_access_reviewer_queue(self):
        self.auth_merchant()
        response = self.client.get('/api/v1/reviewer/queue/')
        self.assertEqual(response.status_code, 403)

    def test_merchant_cannot_see_other_merchant_submission(self):
        other_merchant, other_token = make_user('merchant2')
        KYCSubmission.objects.create(merchant=other_merchant)

        self.auth_merchant()
        # Merchant can only access their own via /merchant/submission/
        response = self.client.get('/api/v1/merchant/submission/')
        data = response.json()
        self.assertEqual(data['id'], self.sub.id)

    def test_reviewer_cannot_submit_as_merchant(self):
        self.auth_reviewer()
        response = self.client.post('/api/v1/merchant/submission/submit/')
        self.assertEqual(response.status_code, 403)


class SLAFlagTests(TestCase):
    """SLA flag is computed dynamically, not stored."""

    def test_sla_at_risk_when_older_than_24h(self):
        merchant, _ = make_user('m_sla')
        sub = KYCSubmission.objects.create(
            merchant=merchant, status=SM.UNDER_REVIEW,
            submitted_at=timezone.now() - timedelta(hours=25)
        )
        self.assertTrue(sub.is_sla_at_risk)

    def test_not_at_risk_when_recent(self):
        merchant, _ = make_user('m_ok')
        sub = KYCSubmission.objects.create(
            merchant=merchant, status=SM.UNDER_REVIEW,
            submitted_at=timezone.now() - timedelta(hours=10)
        )
        self.assertFalse(sub.is_sla_at_risk)

    def test_approved_never_at_risk(self):
        merchant, _ = make_user('m_approved')
        sub = KYCSubmission.objects.create(
            merchant=merchant, status=SM.APPROVED,
            submitted_at=timezone.now() - timedelta(hours=100)
        )
        self.assertFalse(sub.is_sla_at_risk)
