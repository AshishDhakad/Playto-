from django.urls import path
from . import views

urlpatterns = [
    # Auth
    path('auth/register/', views.register),
    path('auth/login/', views.login),
    path('auth/me/', views.me),

    # Merchant
    path('merchant/submission/', views.my_submission),
    path('merchant/submission/update/', views.update_submission),
    path('merchant/submission/submit/', views.submit_kyc),
    path('merchant/submission/upload/', views.upload_document),
    path('merchant/notifications/', views.my_notifications),

    # Reviewer
    path('reviewer/queue/', views.reviewer_queue),
    path('reviewer/submissions/', views.all_submissions),
    path('reviewer/submissions/<int:pk>/', views.reviewer_submission_detail),
    path('reviewer/submissions/<int:pk>/transition/', views.reviewer_transition),
]
