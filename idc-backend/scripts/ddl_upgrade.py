import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
	sys.path.append(str(ROOT_DIR))

from sqlalchemy import text
from database import get_engine

STATEMENTS = [
	# transactions new columns
	"""
	ALTER TABLE transactions 
	ADD COLUMN IF NOT EXISTS client_po_number TEXT,
	ADD COLUMN IF NOT EXISTS supplier_po_number TEXT,
	ADD COLUMN IF NOT EXISTS client_po_amount NUMERIC,
	ADD COLUMN IF NOT EXISTS supplier_po_amount NUMERIC,
	ADD COLUMN IF NOT EXISTS quickbooks_invoice_status VARCHAR,
	ADD COLUMN IF NOT EXISTS quickbooks_realm_fingerprint VARCHAR(64),
	ADD COLUMN IF NOT EXISTS quickbooks_last_synced_at TIMESTAMP WITHOUT TIME ZONE;
	""",
	# documents binary storage columns
	"""
	ALTER TABLE documents
	ADD COLUMN IF NOT EXISTS mime_type TEXT,
	ADD COLUMN IF NOT EXISTS size_bytes INTEGER,
	ADD COLUMN IF NOT EXISTS content BYTEA;
	""",
    # supplier_quotes table
    """
    CREATE TABLE IF NOT EXISTS supplier_quotes (
        id SERIAL PRIMARY KEY,
        transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        amount NUMERIC NOT NULL,
        currency VARCHAR NULL,
        lead_time_days INTEGER NULL,
        notes TEXT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
    );
    """,
    # associated_costs table
    """
    CREATE TABLE IF NOT EXISTS associated_costs (
        id SERIAL PRIMARY KEY,
        transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        description VARCHAR NOT NULL,
        amount NUMERIC NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'due',
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
    );
    """,
	# lookup indexes for common transaction detail/dashboard paths
	"""
	CREATE INDEX IF NOT EXISTS ix_transactions_client_id ON transactions (client_id);
	CREATE INDEX IF NOT EXISTS ix_transactions_date_received_id ON transactions (date_received DESC, id DESC);
	CREATE INDEX IF NOT EXISTS ix_transaction_suppliers_transaction_id ON transaction_suppliers (transaction_id);
	CREATE INDEX IF NOT EXISTS ix_transaction_suppliers_supplier_id ON transaction_suppliers (supplier_id);
	DELETE FROM transaction_suppliers duplicate
	USING transaction_suppliers canonical
	WHERE duplicate.id > canonical.id
		AND duplicate.transaction_id = canonical.transaction_id
		AND duplicate.supplier_id = canonical.supplier_id;
	CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_suppliers_transaction_supplier
		ON transaction_suppliers (transaction_id, supplier_id);
	CREATE INDEX IF NOT EXISTS ix_documents_transaction_id ON documents (transaction_id);
	CREATE INDEX IF NOT EXISTS ix_shipments_transaction_id ON shipments (transaction_id);
	CREATE INDEX IF NOT EXISTS ix_activity_logs_transaction_id ON activity_logs (transaction_id);
	CREATE INDEX IF NOT EXISTS ix_supplier_quotes_transaction_id ON supplier_quotes (transaction_id);
	CREATE INDEX IF NOT EXISTS ix_supplier_quotes_supplier_id ON supplier_quotes (supplier_id);
	CREATE INDEX IF NOT EXISTS ix_associated_costs_transaction_id ON associated_costs (transaction_id);
	""",
	# revocable employee accounts and session lifecycle
	"""
	ALTER TABLE employees
	ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
	ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP WITHOUT TIME ZONE,
	ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITHOUT TIME ZONE,
	ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITHOUT TIME ZONE,
	ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
	ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

	UPDATE employees
	SET email = LOWER(TRIM(email)),
		role = CASE WHEN LOWER(role) = 'admin' THEN 'admin' ELSE 'employee' END,
		updated_at = COALESCE(updated_at, created_at, NOW());

	CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_email_lower ON employees (LOWER(email));
	""",
	"""
	CREATE TABLE IF NOT EXISTS auth_sessions (
		id SERIAL PRIMARY KEY,
		employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
		token_hash VARCHAR(64) NOT NULL,
		csrf_token_hash VARCHAR(64) NOT NULL,
		expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
		created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
		last_seen_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
		revoked_at TIMESTAMP WITHOUT TIME ZONE
	);
	CREATE UNIQUE INDEX IF NOT EXISTS ix_auth_sessions_token_hash ON auth_sessions (token_hash);
	CREATE INDEX IF NOT EXISTS ix_auth_sessions_employee_id ON auth_sessions (employee_id);
	CREATE INDEX IF NOT EXISTS ix_auth_sessions_expires_at ON auth_sessions (expires_at);
	""",
	"""
	CREATE TABLE IF NOT EXISTS account_audit_logs (
		id SERIAL PRIMARY KEY,
		actor_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
		target_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
		action VARCHAR NOT NULL,
		details TEXT,
		created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
	);
	CREATE INDEX IF NOT EXISTS ix_account_audit_logs_actor_id ON account_audit_logs (actor_employee_id);
	CREATE INDEX IF NOT EXISTS ix_account_audit_logs_target_id ON account_audit_logs (target_employee_id);
	CREATE INDEX IF NOT EXISTS ix_account_audit_logs_created_at ON account_audit_logs (created_at);
	""",
	"""
	DO $$
	BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM pg_constraint WHERE conname = 'ck_employees_role'
		) THEN
			ALTER TABLE employees
			ADD CONSTRAINT ck_employees_role CHECK (role IN ('admin', 'employee'));
		END IF;
	END $$;
	""",
	# persisted client and supplier contact records
	"""
	ALTER TABLE clients
	ADD COLUMN IF NOT EXISTS contact_name VARCHAR,
	ADD COLUMN IF NOT EXISTS email VARCHAR,
	ADD COLUMN IF NOT EXISTS phone VARCHAR,
	ADD COLUMN IF NOT EXISTS address TEXT,
	ADD COLUMN IF NOT EXISTS notes TEXT;

	ALTER TABLE suppliers
	ADD COLUMN IF NOT EXISTS contact_name VARCHAR,
	ADD COLUMN IF NOT EXISTS email VARCHAR,
	ADD COLUMN IF NOT EXISTS phone VARCHAR,
	ADD COLUMN IF NOT EXISTS website VARCHAR,
	ADD COLUMN IF NOT EXISTS address TEXT,
	ADD COLUMN IF NOT EXISTS category VARCHAR,
		ADD COLUMN IF NOT EXISTS notes TEXT;
	""",
	# enforce the documented single-company QuickBooks credential model
	"""
	CREATE TABLE IF NOT EXISTS quickbooks_tokens (
		id SERIAL PRIMARY KEY,
		singleton_key SMALLINT NOT NULL DEFAULT 1,
		realm_id VARCHAR NOT NULL,
		access_token TEXT NOT NULL,
		refresh_token TEXT NOT NULL,
		token_expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
		refresh_expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
		created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
		updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
	);

	ALTER TABLE quickbooks_tokens
	ADD COLUMN IF NOT EXISTS singleton_key SMALLINT;

	UPDATE quickbooks_tokens
	SET singleton_key = 1
	WHERE singleton_key IS NULL;

	ALTER TABLE quickbooks_tokens
	ALTER COLUMN singleton_key SET DEFAULT 1,
	ALTER COLUMN singleton_key SET NOT NULL;

	CREATE UNIQUE INDEX IF NOT EXISTS uq_quickbooks_tokens_singleton
		ON quickbooks_tokens (singleton_key);

	DO $$
	BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM pg_constraint
			WHERE conname = 'ck_quickbooks_tokens_singleton_key'
		) THEN
			ALTER TABLE quickbooks_tokens
			ADD CONSTRAINT ck_quickbooks_tokens_singleton_key
			CHECK (singleton_key = 1);
		END IF;
	END $$;
	""",
	# realm-scoped QuickBooks mappings and durable idempotent invoice attempts
	"""
	CREATE TABLE IF NOT EXISTS quickbooks_customer_mappings (
		id SERIAL PRIMARY KEY,
		client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
		realm_fingerprint VARCHAR(64) NOT NULL,
		customer_id TEXT NOT NULL,
		created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
		CONSTRAINT uq_qb_customer_client_realm UNIQUE (client_id, realm_fingerprint)
	);
	CREATE INDEX IF NOT EXISTS ix_qb_customer_mappings_client_id
		ON quickbooks_customer_mappings (client_id);
	""",
	"""
	CREATE TABLE IF NOT EXISTS quickbooks_oauth_states (
		id SERIAL PRIMARY KEY,
		nonce_hash VARCHAR(64) NOT NULL,
		employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
		expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
		used_at TIMESTAMP WITHOUT TIME ZONE,
		created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
	);
	CREATE UNIQUE INDEX IF NOT EXISTS ix_quickbooks_oauth_states_nonce_hash
		ON quickbooks_oauth_states (nonce_hash);
	CREATE INDEX IF NOT EXISTS ix_quickbooks_oauth_states_expires_at
		ON quickbooks_oauth_states (expires_at);
	""",
	"""
	CREATE TABLE IF NOT EXISTS quickbooks_invoice_attempts (
		id SERIAL PRIMARY KEY,
		transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
		created_by_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
		realm_fingerprint VARCHAR(64) NOT NULL,
		request_id VARCHAR(50) NOT NULL,
		payload_hash VARCHAR(64) NOT NULL,
		payload_json TEXT NOT NULL,
		status VARCHAR NOT NULL DEFAULT 'pending',
		attempt_count INTEGER NOT NULL DEFAULT 0,
		invoice_id TEXT,
		invoice_number VARCHAR,
		total_amount NUMERIC,
		currency VARCHAR(8),
		last_error_code VARCHAR,
		created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
		completed_at TIMESTAMP WITHOUT TIME ZONE,
		CONSTRAINT uq_qb_invoice_attempt_transaction UNIQUE (transaction_id),
		CONSTRAINT uq_qb_invoice_attempt_request_id UNIQUE (request_id),
		CONSTRAINT ck_qb_invoice_attempt_status
			CHECK (status IN ('pending', 'succeeded', 'unknown', 'failed'))
	);
	CREATE INDEX IF NOT EXISTS ix_qb_invoice_attempts_status
		ON quickbooks_invoice_attempts (status);
	""",
]

def main():
	engine = get_engine()
	with engine.connect() as conn:
		for stmt in STATEMENTS:
			conn.execute(text(stmt))
		conn.commit()
	print("DDL upgrade completed.")

if __name__ == "__main__":
	main()
