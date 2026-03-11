# backend/backend/urls.py
from django.contrib import admin
from django.urls import path, include
from django.conf import settings             # <-- This lets us read your settings file
from django.conf.urls.static import static   # <-- This lets us serve image files
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
    path('api/advertising/', include('advertising.urls')),
    path('api/promotions/', include('promotions.urls')),
    path('api/pickup/', include('pickup.urls')),
    path('api/receipts/', include('receipts.urls')),
]

handler400 = "core.error_views.bad_request"
handler403 = "core.error_views.permission_denied"
handler404 = "core.error_views.page_not_found"
handler500 = "core.error_views.server_error"

# Serve uploaded media files (product/vendor/ads images).
# In this deployment, media URLs must remain accessible in both debug and production.
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
