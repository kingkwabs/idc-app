# IDC Energy Deployment Guide

## Release security gate

Before any production push, both repository scans must pass:

```bash
cd idc-backend
python scripts/check_repository_secrets.py
python scripts/check_repository_secrets.py --history
```

The history scan intentionally blocks deployment when a credential was committed and later deleted. Rotate or revoke the credential first, remove the file from every reachable Git commit, have collaborators re-clone after the force-push, and rerun the scan. Never treat deletion from the latest commit as revocation.

## Backend on Render

Deploy from the repository root with `render.yaml`. The service uses `idc-backend` as its root directory, installs `requirements-runtime.txt`, downloads the AWS RDS CA bundle, applies `scripts/ddl_upgrade.py` in Render's pre-deploy phase, and then starts Gunicorn.

The health endpoints are:

- `/live` for process liveness;
- `/health` for database readiness.

### Required Render secrets

Configure these as secret values, not committed files:

```text
DB_SECRET_NAME
DB_CLUSTER_ARN
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
JWT_SECRET
QB_CLIENT_ID
QB_CLIENT_SECRET
QB_TOKEN_ENCRYPTION_KEY
```

`DB_SECRET_NAME` should remain pointed at the stable application configuration secret, such as `app/transactions-db-config`. The backend follows `DB_CLUSTER_ARN` to the RDS-managed rotating credential secret, so Render does not need a new database password after each rotation.

The AWS identity used by Render needs only the permissions required to:

- read the stable application configuration secret;
- read the RDS-managed rotating secret;
- call `rds:DescribeDBClusters`.

Do not configure legacy `APP_USER` or `APP_PASS` values. Authentication uses employee rows, opaque server-side sessions, and administrator-created accounts.

### First administrator

Normal accounts must be created from **Administration > Employees**. On a new database with no usable administrator, open a Render shell and run the guarded bootstrap once:

```bash
export NEW_EMPLOYEE_NAME="Initial Administrator"
export NEW_EMPLOYEE_EMAIL="admin@idcenergy.co"
export NEW_EMPLOYEE_ROLE="admin"
read -rsp "Temporary password: " NEW_EMPLOYEE_PASSWORD && export NEW_EMPLOYEE_PASSWORD
python scripts/add_employee.py
unset NEW_EMPLOYEE_PASSWORD
```

The script uses the same rotating database credentials, validation, password policy, and Argon2 hashing as the application. It creates an admin that must change its temporary password at first sign-in and refuses to run when an active admin already exists. `ALLOW_ADDITIONAL_ADMIN_BOOTSTRAP=true` is an explicit emergency-recovery override; remove it immediately after use.

### Required Render configuration

The tracked `render.yaml` defines the non-secret production values, including:

```text
APP_ENV=production
FRONTEND_URL=https://www.idcenergy.co
CORS_ORIGINS=https://www.idcenergy.co,https://idcenergy.co
SESSION_COOKIE_SECURE=true
DB_SSLMODE=verify-full
QB_REDIRECT_URI=https://idc-app.onrender.com/quickbooks/callback
QB_ENVIRONMENT=production
QB_SERVICE_ITEM_NAME=Services
```

Confirm `QB_SERVICE_ITEM_NAME` matches the intended active QuickBooks `Service` item before deployment. Preserve the Fernet encryption key separately from the database backup.

The schema upgrade intentionally fails if it finds multiple legacy QuickBooks token rows. Reconcile those rows manually rather than allowing a deployment to guess which company credential should survive.

## Frontend on Vercel

Import `idc-operations-hub` as the Vercel project root. The production frontend calls same-origin `/api/*` paths; `vercel.json` proxies those requests to `https://idc-app.onrender.com`. This keeps authentication cookies first-party at `www.idcenergy.co`.

`VITE_API_BASE` is only used by the local Vite development server. It is intentionally ignored by production builds, where the same-origin proxy is required for cookie authentication.

After deployment, verify:

1. `https://www.idcenergy.co/privacy-policy` and `/eula` load without authentication.
2. An administrator can sign in and load Transactions, Clients, Suppliers, Employees, and QuickBooks.
3. A normal employee cannot load Employees or QuickBooks administration.
4. Browser responses set `Secure`, `HttpOnly` session cookies and mutations send `X-CSRF-Token`.
5. Render `/health` reports the database as connected.

## QuickBooks URLs

Register these exact production values with Intuit:

```text
Host domain: idcenergy.co
Launch URL: https://www.idcenergy.co/quickbooks
Connect/reconnect URL: https://www.idcenergy.co/quickbooks
Disconnect URL: https://www.idcenergy.co/quickbooks/disconnected
OAuth redirect URL: https://idc-app.onrender.com/quickbooks/callback
Privacy Policy: https://www.idcenergy.co/privacy-policy
EULA: https://www.idcenergy.co/eula
```

Complete `QUICKBOOKS_CHECKLIST.md` in sandbox before authorizing the production company or creating a live invoice.
