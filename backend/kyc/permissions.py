from rest_framework.permissions import BasePermission


class IsMerchant(BasePermission):
    message = 'Only merchants can perform this action.'

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_merchant


class IsReviewer(BasePermission):
    message = 'Only reviewers can perform this action.'

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_reviewer


class IsOwnerOrReviewer(BasePermission):
    """Object-level: merchant sees only own submission; reviewer sees all."""
    def has_object_permission(self, request, view, obj):
        if request.user.is_reviewer:
            return True
        return obj.merchant == request.user
