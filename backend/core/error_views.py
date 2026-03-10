from django.http import JsonResponse
from django.shortcuts import render


def _prefers_json(request):
    accept_header = request.headers.get("Accept", "")
    return request.path.startswith("/api/") or "application/json" in accept_header.lower()


def bad_request(request, exception):
    if _prefers_json(request):
        return JsonResponse({"detail": "Bad request."}, status=400)
    return render(request, "errors/400.html", status=400)


def permission_denied(request, exception):
    if _prefers_json(request):
        return JsonResponse({"detail": "Permission denied."}, status=403)
    return render(request, "errors/403.html", status=403)


def page_not_found(request, exception):
    if _prefers_json(request):
        return JsonResponse({"detail": "Not found."}, status=404)
    return render(request, "errors/404.html", status=404)


def server_error(request):
    if _prefers_json(request):
        return JsonResponse({"detail": "An internal server error occurred."}, status=500)
    return render(request, "errors/500.html", status=500)
