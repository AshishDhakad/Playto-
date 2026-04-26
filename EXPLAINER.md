# EXPLAINER.md

## 1. The State Machine

**Where it lives:** `backend/kyc/models.py` — the `KYCStateMachine` class at the top of the file, before any model definition. It is the single source of truth. No transition logic exists anywhere else.

```python
class KYCStateMachine:
    DRAFT = 'draft'
    SUBMITTED = 'submitted'
    UNDER_REVIEW = 'under_review'
    APPROVED = 'approved'
    REJECTED = 'rejected'
    MORE_INFO_REQUESTED = 'more_info_requested'

    TRANSITIONS = {
        DRAFT:                  [SUBMITTED],
        SUBMITTED:              [UNDER_REVIEW],
        UNDER_REVIEW:           [APPROVED, REJECTED, MORE_INFO_REQUESTED],
        MORE_INFO_REQUESTED:    [SUBMITTED],
        APPROVED:               [],   # terminal
        REJECTED:               [],   # terminal
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
```

**How illegal transitions are prevented:** The `StateTransitionSerializer.validate()` method calls `SM.validate()` before any state change is saved. The model's `transition_to()` method also calls it as a second guard. If the transition is not in the `TRANSITIONS` dict for the current state, `InvalidTransition` is raised, the serializer catches it, and returns a `400` with a descriptive message like:

```json
{"errors": {"new_status": ["Cannot move from 'approved' to 'draft'. Allowed next states: none (terminal state)"]}}
```

The view layer has no transition logic — it just calls the serializer and delegates.

---

## 2. The Upload

**Validation code** in `backend/kyc/serializers.py`:

```python
def validate_upload_file(file):
    max_size = settings.MAX_UPLOAD_SIZE_BYTES  # 5 MB = 5 * 1024 * 1024

    # 1. Size check — before reading the whole file
    if file.size > max_size:
        raise serializers.ValidationError(
            f"File too large: {file.size / (1024*1024):.1f} MB. Maximum allowed: 5 MB."
        )

    # 2. Extension check — from the filename
    _, ext = os.path.splitext(file.name.lower())
    if ext not in settings.ALLOWED_UPLOAD_EXTENSIONS:  # ['.pdf', '.jpg', '.jpeg', '.png']
        raise serializers.ValidationError(
            f"Invalid file type '{ext}'. Accepted: PDF, JPG, PNG."
        )

    # 3. MIME type check — guessed from the extension, not trusted from client header
    guessed_mime, _ = mimetypes.guess_type(file.name)
    allowed_mimes = ['application/pdf', 'image/jpeg', 'image/png']
    if guessed_mime not in allowed_mimes:
        raise serializers.ValidationError(
            f"File MIME type '{guessed_mime}' is not allowed."
        )

    return file
```

**What happens with a 50 MB file:** The size check runs first. `file.size` reads the declared content length — Django's `InMemoryUploadedFile` sets this from the multipart header before fully buffering. A 50 MB file gets a `400` immediately:

```json
{"errors": {"file": ["File too large: 50.0 MB. Maximum allowed: 5 MB."]}}
```

Django's default `DATA_UPLOAD_MAX_MEMORY_SIZE` (2.5 MB) and `FILE_UPLOAD_MAX_MEMORY_SIZE` mean very large files are streamed to a temp file rather than held in RAM, so the server doesn't OOM before our check even runs. For production, this should be tuned lower and enforced at the nginx/load-balancer layer as well.

---

## 3. The Queue

**The query** in `backend/kyc/views.py`:

```python
qs = KYCSubmission.objects.select_related('merchant') \
    .prefetch_related('documents') \
    .filter(status__in=[SM.SUBMITTED, SM.UNDER_REVIEW, SM.MORE_INFO_REQUESTED]) \
    .order_by('submitted_at')
```

**SLA flag** is computed as a Python property on the model — not in the query:

```python
@property
def is_sla_at_risk(self) -> bool:
    if self.status not in (SM.SUBMITTED, SM.UNDER_REVIEW, SM.MORE_INFO_REQUESTED):
        return False
    reference_time = self.submitted_at or self.created_at
    return (timezone.now() - reference_time) > timedelta(hours=24)
```

**Why this way:**

- `select_related('merchant')` avoids N+1 on merchant usernames.
- `prefetch_related('documents')` avoids N+1 on document counts.
- `order_by('submitted_at')` gives oldest-first (FIFO), which is correct for a review queue — the longest-waiting merchant gets reviewed first.
- The SLA flag is a `@property`, not a database column. Storing it as a column means it goes stale the moment you write it. Computing it from `submitted_at` and `timezone.now()` means it is always accurate with zero extra queries. The trade-off is that you can't `filter(is_sla_at_risk=True)` in SQL — but for the dashboard use case, iterating Python objects is fine at this scale.

---

## 4. The Auth

**How merchant A is stopped from seeing merchant B's submission:**

Merchants only ever access their own submission through `/api/v1/merchant/submission/`. The view hardcodes `merchant=request.user` in the queryset:

```python
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsMerchant])
def my_submission(request):
    sub = KYCSubmission.objects.get(merchant=request.user)
    return Response(KYCSubmissionSerializer(sub).data)
```

There is no `pk` parameter in the URL for merchant endpoints — a merchant cannot even construct a URL to request another merchant's record. The reviewer detail endpoint (`/reviewer/submissions/<id>/`) is protected by `IsReviewer`, which checks `request.user.role == 'reviewer'`. If a merchant somehow calls it:

```python
class IsReviewer(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_reviewer
```

They get a `403 Forbidden` immediately, before the view function runs.

The `role` field is set server-side at registration. A client cannot escalate their own role — there is no endpoint that accepts a role field after account creation.

---

## 5. The AI Audit

**What the AI wrote (Copilot / Claude, during file upload validation):**

```python
# AI-generated version
def validate_file(self, file):
    content_type = file.content_type  # trusting the client header
    if content_type not in ['application/pdf', 'image/jpeg', 'image/png']:
        raise serializers.ValidationError("Invalid file type.")
    if file.size > 5242880:
        raise serializers.ValidationError("File too large.")
    return file
```

**What I caught:**

`file.content_type` is the `Content-Type` header sent by the client in the multipart request. A malicious user can send a PHP script with `Content-Type: image/jpeg` and this check would pass. This is a classic file upload bypass.

**What I replaced it with:**

```python
def validate_upload_file(file):
    # Size check first — fast, no disk IO
    if file.size > settings.MAX_UPLOAD_SIZE_BYTES:
        raise serializers.ValidationError(...)

    # Extension check — from filename, not client header
    _, ext = os.path.splitext(file.name.lower())
    if ext not in settings.ALLOWED_UPLOAD_EXTENSIONS:
        raise serializers.ValidationError(...)

    # MIME check — guessed from extension by Python's stdlib, not trusted from client
    guessed_mime, _ = mimetypes.guess_type(file.name)
    if guessed_mime not in allowed_mimes:
        raise serializers.ValidationError(...)
```

The extension check is server-side and ignores the client's declared content-type. The `mimetypes.guess_type` call uses Python's own mapping, not the client header. This is not bulletproof (a renamed `.exe` with a `.pdf` extension would pass), but it's the correct approach without `python-magic` — the right production fix is to use `python-magic` to inspect the file's actual bytes. I documented this in the code as a comment.

A second issue the AI introduced: it put the size check *after* reading file content in some versions. I moved it first so a 1 GB file fails immediately, before any disk IO.
