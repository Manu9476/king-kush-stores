#!/usr/bin/env python
"""
Pre-launch smoke checks for King-Kush.

Usage examples:
  python scripts/prelaunch_smoke_check.py
  python scripts/prelaunch_smoke_check.py --backend-url http://staging-api.example.com --frontend-url http://staging.example.com
  python scripts/prelaunch_smoke_check.py --admin-token <JWT> --strict-readiness
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from typing import Any
from urllib import error, request


@dataclass
class CheckResult:
    name: str
    passed: bool
    detail: str


def fetch_json(url: str, token: str = "") -> tuple[int, Any]:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = request.Request(url, headers=headers, method="GET")
    with request.urlopen(req, timeout=15) as response:
        body = response.read().decode("utf-8")
        payload = json.loads(body) if body else {}
        return response.status, payload


def run_checks(args: argparse.Namespace) -> list[CheckResult]:
    results: list[CheckResult] = []

    # 1) Backend health
    health_url = f"{args.backend_url.rstrip('/')}/api/health/"
    try:
        status_code, payload = fetch_json(health_url)
        is_ok = status_code == 200 and payload.get("status") in {"ok", "degraded"}
        results.append(
            CheckResult(
                name="Backend health",
                passed=is_ok,
                detail=f"status={status_code}, api_status={payload.get('status')}, db={payload.get('components', {}).get('database')}",
            )
        )
    except Exception as exc:
        results.append(CheckResult(name="Backend health", passed=False, detail=str(exc)))

    # 2) Public product feed
    products_url = f"{args.backend_url.rstrip('/')}/api/products/products/"
    try:
        status_code, payload = fetch_json(products_url)
        is_list = isinstance(payload, list)
        results.append(
            CheckResult(
                name="Products endpoint",
                passed=status_code == 200 and is_list,
                detail=f"status={status_code}, products_count={len(payload) if is_list else 'n/a'}",
            )
        )
    except Exception as exc:
        results.append(CheckResult(name="Products endpoint", passed=False, detail=str(exc)))

    # 3) Frontend reachability
    if not args.skip_frontend:
        frontend_url = args.frontend_url.rstrip("/")
        req = request.Request(frontend_url, method="GET")
        try:
            with request.urlopen(req, timeout=15) as response:
                ok = 200 <= response.status < 500
                results.append(
                    CheckResult(
                        name="Frontend reachable",
                        passed=ok,
                        detail=f"status={response.status}",
                    )
                )
        except Exception as exc:
            results.append(CheckResult(name="Frontend reachable", passed=False, detail=str(exc)))

    # 4) Optional readiness gate
    if args.admin_token:
        readiness_url = f"{args.backend_url.rstrip('/')}/api/users/admin/production-readiness/"
        try:
            status_code, payload = fetch_json(readiness_url, token=args.admin_token)
            fail_count = int(payload.get("summary", {}).get("fail_count", 0))
            blocked = bool(payload.get("summary", {}).get("is_launch_blocked", fail_count > 0))
            passed = status_code == 200 and (not args.strict_readiness or not blocked)
            detail = f"status={status_code}, fail_count={fail_count}, launch_blocked={blocked}"
            results.append(CheckResult(name="Admin readiness", passed=passed, detail=detail))
        except Exception as exc:
            results.append(CheckResult(name="Admin readiness", passed=False, detail=str(exc)))

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Run King-Kush pre-launch smoke checks.")
    parser.add_argument("--backend-url", default="http://127.0.0.1:8000", help="Backend base URL")
    parser.add_argument("--frontend-url", default="http://127.0.0.1:3000", help="Frontend base URL")
    parser.add_argument("--skip-frontend", action="store_true", help="Skip frontend reachability check")
    parser.add_argument("--admin-token", default="", help="Optional admin JWT token for readiness check")
    parser.add_argument(
        "--strict-readiness",
        action="store_true",
        help="Fail smoke test if readiness endpoint reports launch blockers",
    )
    args = parser.parse_args()

    results = run_checks(args)
    has_failures = False
    for result in results:
        status_text = "PASS" if result.passed else "FAIL"
        print(f"[{status_text}] {result.name}: {result.detail}")
        if not result.passed:
            has_failures = True

    return 1 if has_failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
