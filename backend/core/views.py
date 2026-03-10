from django.db import connection
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    database_status = "ok"
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        database_status = "error"

    return Response(
        {
            "status": "ok" if database_status == "ok" else "degraded",
            "service": "king-kush-api",
            "timestamp": timezone.now().isoformat(),
            "components": {
                "database": database_status,
            },
        }
    )
