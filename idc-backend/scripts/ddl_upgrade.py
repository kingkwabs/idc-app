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