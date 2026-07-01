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
	ADD COLUMN IF NOT EXISTS supplier_po_amount NUMERIC;
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
	CREATE INDEX IF NOT EXISTS ix_transaction_suppliers_transaction_id ON transaction_suppliers (transaction_id);
	CREATE INDEX IF NOT EXISTS ix_transaction_suppliers_supplier_id ON transaction_suppliers (supplier_id);
	CREATE INDEX IF NOT EXISTS ix_documents_transaction_id ON documents (transaction_id);
	CREATE INDEX IF NOT EXISTS ix_shipments_transaction_id ON shipments (transaction_id);
	CREATE INDEX IF NOT EXISTS ix_activity_logs_transaction_id ON activity_logs (transaction_id);
	CREATE INDEX IF NOT EXISTS ix_supplier_quotes_transaction_id ON supplier_quotes (transaction_id);
	CREATE INDEX IF NOT EXISTS ix_supplier_quotes_supplier_id ON supplier_quotes (supplier_id);
	CREATE INDEX IF NOT EXISTS ix_associated_costs_transaction_id ON associated_costs (transaction_id);
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
