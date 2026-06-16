# Development Deployment Guide

## Backend on Render

- Use the root `render.yaml` (rootDir `idc-backend`).
- Health check path: `/health`
- Start command: `gunicorn app:app -b 0.0.0.0:$PORT`

### Environment Variables (Render)

Set these in the Render dashboard:

- DB_SECRET_NAME: AWS Secrets Manager secret name
- DB_CLUSTER_ARN: RDS Cluster ARN
- AWS_REGION: eu-north-1
- AWS_ACCESS_KEY_ID: Key with SecretsManager:GetSecretValue + RDS:Describe\*
- AWS_SECRET_ACCESS_KEY: Matching secret value
- JWT_SECRET: Strong random string
- APP_USER: Admin username for login
- APP_PASS: Admin password for login

### Database Secrets

Render should keep `DB_SECRET_NAME` pointed at the stable app config secret, for example:

- `app/transactions-db-config`

The backend follows `DB_CLUSTER_ARN` to the RDS cluster and reads the cluster's active RDS-managed rotating secret automatically. This keeps Render configuration stable when the database password rotates.

The AWS key used by Render must be allowed to:

- Read the stable app config secret.
- Read the RDS-managed rotating secret named like `rds!cluster-...`.
- Call `rds:DescribeDBClusters`.

If you need to opt out of the RDS-managed credential secret, set `DB_USE_CLUSTER_MASTER_SECRET=false`.

After deploy, note BACKEND_URL (https).

## Frontend on Vercel

- Import the `idc-operations-hub` folder.
- Framework: Vite + React
- Environment Variables:
  - VITE_API_BASE = BACKEND_URL from Render

Deploy and note FRONTEND_URL.

## QuickBooks Dev URLs (placeholders)

- Host domain: FRONTEND_URL domain (no protocol)
- Launch URL: FRONTEND_URL
- Disconnect URL: FRONTEND_URL + `/settings`
- OAuth Redirect URL (later): BACKEND_URL + `/api/qbo/callback`

Update after both apps are live.
