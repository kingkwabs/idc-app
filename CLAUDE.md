# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IDC Energy Database is a transaction management system for tracking client RFQs, purchase orders, suppliers, and shipments. The system consists of:

- **Backend**: Flask REST API (Python) with PostgreSQL on AWS RDS
- **Frontend**: React + TypeScript + Vite SPA with Tailwind CSS and shadcn/ui components
- **Deployment**: Backend on Render, Frontend on Vercel

## Architecture

### Backend (`idc-backend/`)

Flask application with blueprint-based routing:

- `app.py`: Main Flask app, registers all blueprints, CORS enabled
- `database.py`: AWS Secrets Manager integration for DB credentials, SQLAlchemy engine management
- `models.py`: SQLAlchemy ORM models (Transaction, Client, Supplier, Employee, Document, ShipmentInfo, ActivityLog, SupplierQuote, AssociatedCost)
- `schemas.py`: Pydantic models for request/response validation
- `routes_*.py`: Blueprint modules for different resources
  - `routes_auth.py`: JWT-based authentication
  - `routes_transactions.py`: Transaction CRUD
  - `routes_transaction_extras.py`: Documents, shipments, activities, supplier quotes, costs
  - `routes_clients.py`: Client management
  - `routes_suppliers.py`: Supplier management
- `auth_util.py`: JWT token generation/validation, password hashing with bcrypt
- `scripts/`: Database migration and management utilities

**Database**: PostgreSQL via AWS RDS Aurora Serverless, credentials fetched from AWS Secrets Manager. Connection uses `postgresql+psycopg2://` with SQLAlchemy.

### Frontend (`idc-operations-hub/`)

React SPA with:

- React Router for navigation (`/`, `/transactions/:id`, `/clients`, `/suppliers`)
- Component structure:
  - `App.tsx`: Main app with routing, authentication check via localStorage JWT
  - `components/`: Feature components (TransactionsTable, TransactionDetail, ClientsPage, SuppliersPage, etc.)
  - `components/ui/`: shadcn/ui component library (buttons, dialogs, tables, forms, etc.)
  - `lib/`: Utility functions
- Authentication: JWT stored in localStorage, login redirects if token missing
- API calls to backend via `VITE_API_BASE` environment variable

## Development Commands

### Backend

```bash
cd idc-backend

# Install dependencies
pip install -r requirements.txt

# Run development server (port 5001)
python app.py

# Run with gunicorn (production-like)
gunicorn app:app -b 0.0.0.0:5001

# Run tests
pytest
```

**Environment variables** (`.env` file):
- `DB_SECRET_NAME`: AWS Secrets Manager secret name
- `DB_CLUSTER_ARN`: RDS cluster ARN
- `AWS_REGION`: AWS region (eu-north-1)
- `AWS_ACCESS_KEY_ID`: AWS credentials
- `AWS_SECRET_ACCESS_KEY`: AWS credentials
- `JWT_SECRET`: Secret for JWT signing
- `APP_USER`: Admin username
- `APP_PASS`: Admin password

### Frontend

```bash
cd idc-operations-hub

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint
npm run lint
```

**Environment variables** (`.env` file):
- `VITE_API_BASE`: Backend API URL (e.g., https://your-backend.onrender.com)

## Database Scripts

Located in `idc-backend/scripts/`:

- `add_employee.py`: Add new employee to database
- `migrate_employees.py`: Migrate employee data
- `migrate_past_data.py`: Import historical data from Excel
- `normalize_statuses.py`: Standardize transaction status values
- `ddl_upgrade.py`: Database schema upgrades

Run scripts with: `python scripts/<script_name>.py`

## Key Models

- **Transaction**: Core entity with client_id, RFQ/PO numbers, amounts, status
- **Client**: Customer entity, has many transactions
- **Supplier**: Vendor entity, linked to transactions via TransactionSupplierLink
- **Employee**: User authentication, JWT-based login
- **Document**: File attachments for transactions (stored as LargeBinary)
- **ShipmentInfo**: Tracking, lead times, ETA dates
- **ActivityLog**: Audit trail for transaction changes
- **SupplierQuote**: Multiple supplier quotes per transaction
- **AssociatedCost**: Additional costs per transaction

## Deployment

See `DEPLOY.md` for full deployment instructions.

- Backend: Deployed via `render.yaml` configuration
- Frontend: Vercel deployment with environment variable `VITE_API_BASE`
- Health check endpoint: `/health` (backend)
