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

## 3.1) Permanent Product Image Storage (Important)
Why images disappeared:
- Your backend is on Render free web service.
- Local uploads in `backend/media/` are stored on ephemeral filesystem.
- After rebuild/redeploy/restart, those files can be lost.
- DB rows still exist, but file URLs return 404, so frontend shows placeholders.

Permanent fix:
- Use object storage for media files (S3-compatible): AWS S3 / Cloudflare R2 / Backblaze B2.
- Keep static files on WhiteNoise, media on bucket.

Backend env vars for permanent media:
- `USE_S3_MEDIA=True`
- `AWS_ACCESS_KEY_ID=<key>`
- `AWS_SECRET_ACCESS_KEY=<secret>`
- `AWS_STORAGE_BUCKET_NAME=<bucket>`
- `AWS_S3_REGION_NAME=<region>` (optional for some providers)
- `AWS_S3_ENDPOINT_URL=<endpoint>` (required for R2/B2; optional for AWS)
- `AWS_S3_CUSTOM_DOMAIN=<cdn-domain>` (optional)
- `S3_MEDIA_URL=<optional full media base url>`
- `AWS_MEDIA_LOCATION=media` (optional)

Frontend env vars:
- `NEXT_PUBLIC_API_BASE_URL=https://king-kush-stores.onrender.com/api`
- `NEXT_PUBLIC_MEDIA_BASE_URL=<your media host base>` (optional but recommended)

After setting env vars:
```bash
python manage.py migrate --noinput
python manage.py collectstatic --noinput
```

Note:
- Existing missing files from old ephemeral storage cannot be recovered unless you had a backup.
- Re-upload current product images once object storage is enabled.

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
