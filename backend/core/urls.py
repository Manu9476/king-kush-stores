# backend/backend/urls.py
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings             # <-- This lets us read your settings file
from django.views.static import serve as static_serve
from urllib.parse import urlsplit
from .views import api_root, health_check

urlpatterns = [
    path('', api_root, name='api-root'),
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='api-health-check'),
    path('api/products/', include('products.urls')), # Connects your products app
    path('api/users/', include('users.urls')),
    path('api/orders/', include('orders.urls')),
    path('api/chatbot/', include('chatbot.urls')),
    path('api/careers/', include('careers.urls')),
    path('api/support/', include('support.urls')),
    path('api/content/', include('content.urls')),
    path('api/advertising/', include('advertising.urls')),
    path('api/promotions/', include('promotions.urls')),
    path('api/pickup/', include('pickup.urls')),
    path('api/receipts/', include('receipts.urls')),
]

handler400 = "core.error_views.bad_request"
handler403 = "core.error_views.permission_denied"
handler404 = "core.error_views.page_not_found"
handler500 = "core.error_views.server_error"

# Serve uploaded media files (product/vendor/ads images) for this deployment.
# Note: for higher-scale production, move media to object storage (e.g. S3/Cloudinary).
if settings.MEDIA_URL and not urlsplit(settings.MEDIA_URL).netloc:
    media_prefix = settings.MEDIA_URL.lstrip("/")
    urlpatterns += [
        re_path(
            rf"^{media_prefix}(?P<path>.*)$",
            static_serve,
            {"document_root": settings.MEDIA_ROOT},
        )
    ]
