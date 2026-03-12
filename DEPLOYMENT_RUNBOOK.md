# King-Kush Deployment Runbook

## 1) Environment Model
- `local`: development on your machine.
- `staging`: pre-production validation environment.
- `production`: public live environment.

Use separate environment variables and database instances for each.

## 2) Backend Deploy (Django)
Recommended free/low-cost start:
- Render / Railway / Fly.io for backend service.
- PostgreSQL managed DB for staging and production.

Required environment variables:
- `ENVIRONMENT=production`
- `SECRET_KEY`
- `DEBUG=False`
- `ALLOWED_HOSTS=<your-domain>`
- `CORS_ALLOWED_ORIGINS=<frontend-domain>`
- `CSRF_TRUSTED_ORIGINS=<frontend-domain>`
- `MARKETPLACE_COMMISSION_RATE`
- `MARKETPLACE_MPESA_ACCOUNT_REFERENCE`
- `MARKETPLACE_PAYOUT_MODE`
- `MARKETPLACE_EARNINGS_RELEASE_POLICY`
- `MARKETPLACE_STOCK_RESERVATION_MINUTES`
- `MPESA_ENVIRONMENT=production`
- `MPESA_ENABLE_LIVE=True`
- M-Pesa live keys (`MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_STK_CALLBACK_URL`)
- `SECURE_SSL_REDIRECT=True`
- `SESSION_COOKIE_SECURE=True`
- `CSRF_COOKIE_SECURE=True`

Deployment commands:
```bash
python manage.py migrate --noinput
python manage.py collectstatic --noinput
```

## 3) Frontend Deploy (Next.js)
Recommended free start:
- Vercel for frontend.

Set API base URL env vars to your deployed backend domain.

## 4) CI Pipeline
CI is defined in:
- `.github/workflows/ci.yml`

It runs:
- Backend `manage.py check`
- Backend migrations + tests (`orders.tests`, `users.tests`)
- Frontend lint

## 5) Monitoring and Health
Backend health endpoint:
- `GET /api/health/`

Pre-launch smoke script:
- `python scripts/prelaunch_smoke_check.py`
- Optional strict admin readiness gate:
  - `python scripts/prelaunch_smoke_check.py --admin-token <JWT> --strict-readiness`

## 6) Release Gate (Before Go-Live)
Run all:
```bash
backend\venv\Scripts\python.exe backend\manage.py check
backend\venv\Scripts\python.exe backend\manage.py test orders.tests users.tests
cd frontend && npm run lint
python scripts/prelaunch_smoke_check.py --backend-url <staging-backend> --frontend-url <staging-frontend>
```

Then verify:
- `/admin/readiness` shows no hard blockers.
- Payment flow works end-to-end.
- Order stock reservation expiry/release works.
- `/api/health/` returns `status=ok`.

## 7) Rollback
- Keep previous deploy artifact active for instant rollback.
- Revert to previous Git commit and redeploy.
- Re-run smoke checks after rollback.

## 8) Automated Database Backups
Workflow file:
- `.github/workflows/db-backup.yml`

What it does:
- Runs daily at `00:30 UTC` and on manual trigger.
- Creates a PostgreSQL custom-format dump with `pg_dump`.
- Uploads backup as a GitHub Actions artifact (30-day retention).

Required GitHub Secret:
- `BACKUP_DATABASE_URL` (full Postgres connection URL for production DB)

Restore example:
```bash
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "<TARGET_DATABASE_URL>" king-kush-<timestamp>.dump
```
