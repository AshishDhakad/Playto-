import mimetypes
import os
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.authtoken.models import Token

from .models import User, KYCSubmission, Document, NotificationLog, KYCStateMachine as SM
from .serializers import (
    RegisterSerializer, UserSerializer,
    KYCSubmissionSerializer, KYCUpdateSerializer,
    StateTransitionSerializer, DocumentUploadSerializer, DocumentSerializer,
    ReviewerDashboardSerializer, NotificationLogSerializer,
)
from .permissions import IsMerchant, IsReviewer


def submission_response(sub, request):
    """Helper — always passes request so DocumentSerializer builds absolute URLs."""
    return KYCSubmissionSerializer(sub, context={'request': request}).data


# ── AUTH ──────────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({'errors': serializer.errors}, status=400)
    user = serializer.save()
    if user.is_merchant:
        KYCSubmission.objects.create(merchant=user)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({'token': token.key, 'user': UserSerializer(user).data}, status=201)


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    from django.contrib.auth import authenticate
    user = authenticate(
        username=request.data.get('username'),
        password=request.data.get('password')
    )
    if not user:
        return Response({'error': 'Invalid credentials.'}, status=401)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({'token': token.key, 'user': UserSerializer(user).data})


@api_view(['GET'])
def me(request):
    return Response(UserSerializer(request.user).data)


# ── MERCHANT ──────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsMerchant])
def my_submission(request):
    try:
        sub = KYCSubmission.objects.prefetch_related('documents').get(merchant=request.user)
    except KYCSubmission.DoesNotExist:
        return Response({'error': 'No submission found.'}, status=404)
    return Response(submission_response(sub, request))


@api_view(['PATCH'])
@permission_classes([IsAuthenticated, IsMerchant])
def update_submission(request):
    try:
        sub = KYCSubmission.objects.get(merchant=request.user)
    except KYCSubmission.DoesNotExist:
        return Response({'error': 'No submission found.'}, status=404)

    if sub.status not in (SM.DRAFT, SM.MORE_INFO_REQUESTED):
        return Response({'error': f"Cannot edit a submission with status '{sub.status}'."}, status=400)

    serializer = KYCUpdateSerializer(sub, data=request.data, partial=True)
    if not serializer.is_valid():
        return Response({'errors': serializer.errors}, status=400)
    serializer.save()
    sub.refresh_from_db()
    return Response(submission_response(sub, request))


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsMerchant])
def submit_kyc(request):
    try:
        sub = KYCSubmission.objects.get(merchant=request.user)
    except KYCSubmission.DoesNotExist:
        return Response({'error': 'No submission found.'}, status=404)

    missing = [f for f in ['full_name','email','phone','business_name','business_type','monthly_volume_usd']
               if not getattr(sub, f)]
    if missing:
        return Response({'error': f"Missing required fields: {', '.join(missing)}"}, status=400)

    required_docs = {'pan', 'aadhaar', 'bank_statement'}
    uploaded_docs = set(sub.documents.values_list('doc_type', flat=True))
    missing_docs  = required_docs - uploaded_docs
    if missing_docs:
        return Response({'error': f"Missing required documents: {', '.join(missing_docs)}"}, status=400)

    try:
        sub.transition_to(SM.SUBMITTED)
    except SM.InvalidTransition as e:
        return Response({'error': str(e)}, status=400)

    NotificationLog.log(request.user, 'kyc_submitted', {'submission_id': sub.id})
    return Response(submission_response(sub, request))


# ── DOCUMENT UPLOAD ───────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated, IsMerchant])
def upload_document(request):
    try:
        sub = KYCSubmission.objects.get(merchant=request.user)
    except KYCSubmission.DoesNotExist:
        return Response({'error': 'No submission found.'}, status=404)

    if sub.status not in (SM.DRAFT, SM.MORE_INFO_REQUESTED):
        return Response({'error': 'Cannot upload documents after submission.'}, status=400)

    serializer = DocumentUploadSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({'errors': serializer.errors}, status=400)

    uploaded_file = serializer.validated_data['file']
    doc_type      = serializer.validated_data['doc_type']
    mime_type, _  = mimetypes.guess_type(uploaded_file.name)

    # Delete old document of same type if it exists
    old = Document.objects.filter(submission=sub, doc_type=doc_type).first()
    if old:
        try:
            old.file.delete(save=False)
        except Exception:
            pass
        old.delete()

    doc = Document.objects.create(
        submission=sub,
        doc_type=doc_type,
        file=uploaded_file,
        original_filename=uploaded_file.name,
        file_size=uploaded_file.size,
        mime_type=mime_type or 'application/octet-stream',
    )
    return Response(DocumentSerializer(doc, context={'request': request}).data, status=201)


# ── REVIEWER ──────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsReviewer])
def reviewer_queue(request):
    status_filter = request.query_params.get('status', None)
    qs = KYCSubmission.objects.select_related('merchant').prefetch_related('documents').order_by('submitted_at')

    if status_filter:
        qs = qs.filter(status=status_filter)
    else:
        qs = qs.filter(status__in=[SM.SUBMITTED, SM.UNDER_REVIEW, SM.MORE_INFO_REQUESTED])

    submissions    = list(qs)
    now            = timezone.now()
    seven_days_ago = now - timedelta(days=7)

    waiting_times = [
        (now - s.submitted_at).total_seconds() / 3600
        for s in submissions if s.submitted_at
    ]
    avg_wait_hours = round(sum(waiting_times) / len(waiting_times), 1) if waiting_times else 0

    recent_decided = KYCSubmission.objects.filter(
        decided_at__gte=seven_days_ago, status__in=[SM.APPROVED, SM.REJECTED]
    )
    total_decided  = recent_decided.count()
    approved_count = recent_decided.filter(status=SM.APPROVED).count()

    return Response({
        'metrics': {
            'total_in_queue':   len(submissions),
            'at_risk_count':    sum(1 for s in submissions if s.is_sla_at_risk),
            'avg_wait_hours':   avg_wait_hours,
            'approval_rate_7d': round(approved_count / total_decided * 100, 1) if total_decided else None,
            'approved_last_7d': approved_count,
            'decided_last_7d':  total_decided,
        },
        'submissions': ReviewerDashboardSerializer(submissions, many=True).data,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsReviewer])
def reviewer_submission_detail(request, pk):
    try:
        sub = KYCSubmission.objects.prefetch_related('documents').select_related('merchant').get(pk=pk)
    except KYCSubmission.DoesNotExist:
        return Response({'error': 'Submission not found.'}, status=404)
    # Pass request so document URLs are absolute
    return Response(submission_response(sub, request))


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsReviewer])
def reviewer_transition(request, pk):
    try:
        sub = KYCSubmission.objects.select_related('merchant').get(pk=pk)
    except KYCSubmission.DoesNotExist:
        return Response({'error': 'Submission not found.'}, status=404)

    serializer = StateTransitionSerializer(data=request.data, context={'submission': sub})
    if not serializer.is_valid():
        return Response({'errors': serializer.errors}, status=400)

    new_status = serializer.validated_data['new_status']
    note       = serializer.validated_data.get('note', '')

    try:
        sub.transition_to(new_status, reviewer=request.user, note=note)
    except SM.InvalidTransition as e:
        return Response({'error': str(e)}, status=400)

    event_map = {
        SM.APPROVED: 'kyc_approved', SM.REJECTED: 'kyc_rejected',
        SM.MORE_INFO_REQUESTED: 'kyc_more_info_requested',
        SM.UNDER_REVIEW: 'kyc_under_review',
    }
    NotificationLog.log(
        sub.merchant,
        event_map.get(new_status, f'kyc_{new_status}'),
        {'submission_id': sub.id, 'reviewer': request.user.username, 'note': note}
    )
    sub.refresh_from_db()
    return Response(submission_response(sub, request))


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsReviewer])
def all_submissions(request):
    status_filter = request.query_params.get('status', None)
    qs = KYCSubmission.objects.select_related('merchant').prefetch_related('documents').order_by('-created_at')
    if status_filter:
        qs = qs.filter(status=status_filter)
    return Response(KYCSubmissionSerializer(qs, many=True, context={'request': request}).data)


@api_view(['GET'])
def my_notifications(request):
    logs = NotificationLog.objects.filter(merchant=request.user)[:50]
    return Response(NotificationLogSerializer(logs, many=True).data)
