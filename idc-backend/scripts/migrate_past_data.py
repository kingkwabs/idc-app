import os
import sys
from pathlib import Path
from typing import Dict, Optional

# Ensure project root is on sys.path for local imports
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
	sys.path.append(str(ROOT_DIR))

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

# Local imports
from database import db_session
from models import Client, Supplier, Transaction

CLIENT_COL = "LOCATION"
SUPPLIER_COL = "OEM/SUPPLIER"
RFQ_COL = "RFQ NUMBER"
DATE_RECEIVED_COL = "DATE RECEIVED"
ITEM_DESC_COL = "ITEM DESCRIPTION"
STATUS_COL = "ORDER STATUS"
IDC_AMOUNT_COL = "IDC AMT $"


def to_str_or_none(value) -> Optional[str]:
	if pd.isna(value):
		return None
	return str(value)


def to_date_or_none(value):
	if pd.isna(value):
		return None
	if isinstance(value, pd.Timestamp):
		return value.date()
	return value


def get_or_create_client(session: Session, name: str) -> int:
	obj = session.execute(select(Client).where(Client.name == name)).scalars().first()
	if obj:
		return obj.id
	obj = Client(name=name)
	session.add(obj)
	session.flush()
	return obj.id


def get_or_create_supplier(session: Session, name: str) -> int:
	obj = session.execute(select(Supplier).where(Supplier.name == name)).scalars().first()
	if obj:
		return obj.id
	obj = Supplier(name=name)
	session.add(obj)
	session.flush()
	return obj.id


def migrate():
	configured_path = os.getenv("PAST_DATA_PATH")
	if not configured_path:
		raise SystemExit("Set PAST_DATA_PATH to the private workbook before running this importer.")
	excel_path = Path(configured_path).expanduser().resolve()
	if not excel_path.is_file():
		raise SystemExit(f"Excel file not found: {excel_path}")

	print("Reading spreadsheet data...")
	df = pd.read_excel(excel_path)
	print(f"Rows loaded: {len(df)}")

	inserted_count = 0
	skipped_count = 0

	with db_session() as session:
		print("Preloading unique clients and suppliers...")
		client_map: Dict[str, int] = {}
		supplier_map: Dict[str, int] = {}

		for name in df[CLIENT_COL].dropna().unique():
			client_map[str(name)] = get_or_create_client(session, str(name))

		for name in df[SUPPLIER_COL].dropna().unique():
			supplier_map[str(name)] = get_or_create_supplier(session, str(name))

		print(f"Clients: {len(client_map)} | Suppliers: {len(supplier_map)}")

		print("Migrating transactions...")
		for _, row in df.iterrows():
			client_name = to_str_or_none(row.get(CLIENT_COL))
			if not client_name:
				continue
			client_id = client_map.get(client_name)
			rfq_num = to_str_or_none(row.get(RFQ_COL))

			# Idempotency: client + rfq_number uniqueness
			if client_id and rfq_num:
				existing = session.execute(
					select(Transaction.id).where(
						Transaction.client_id == client_id,
						Transaction.rfq_number == rfq_num,
					)
				).first()
				if existing:
					skipped_count += 1
					continue

			trx = Transaction(
				client_id=client_id,
				rfq_number=rfq_num,
				date_received=to_date_or_none(row.get(DATE_RECEIVED_COL)),
				item_description=to_str_or_none(row.get(ITEM_DESC_COL)),
				status=to_str_or_none(row.get(STATUS_COL)),
				client_quote_amount=(None if pd.isna(row.get(IDC_AMOUNT_COL)) else float(row.get(IDC_AMOUNT_COL))),
				client_quote_currency="USD",
			)
			session.add(trx)
			inserted_count += 1

	print("\n--- Data Migration Summary ---")
	print(f"New transactions inserted: {inserted_count}")
	print(f"Existing transactions skipped: {skipped_count}")
	print("Data migration complete!")


if __name__ == "__main__":
	try:
		migrate()
	except Exception as e:
		print(f"Migration failed: {e}")
		raise
