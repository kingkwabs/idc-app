import sys
from pathlib import Path

# Ensure project root on path
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
	sys.path.append(str(ROOT_DIR))

from typing import Optional
from sqlalchemy import select
from database import db_session
from models import Transaction

# Canonical status IDs (from ProgressTracker)
CANONICAL = {
	"rfq-from-client",
	"rfqs-to-suppliers",
	"receive-supplier-quotes",
	"prepare-proposal",
	"director-approval",
	"proposal-sent-client",
	"client-draft-po",
	"po-to-suppliers",
	"client-confirmed-po",
	"commercial-arrangements",
	"leadtime-shipping-arrangement",
	"shipment-clearance-delivery",
	"delivery-docs-submitted",
	"payment-received",
	"loans-cleared",
	"cancelled",
	"on-hold",
}


def map_status(raw: Optional[str]) -> str:
	if not raw:
		return "rfq-from-client"
	s = raw.strip().lower()
	# Terminal/non-active states
	if "cancel" in s:
		return "cancelled"
	if "loan" in s and ("clear" in s or "settle" in s):
		return "loans-cleared"
	if "paid" in s or "payment" in s:
		return "payment-received"
	# Delivery/shipping
	if "delivery" in s or "delivered" in s:
		return "shipment-clearance-delivery"
	if "shipping arrangement" in s or "leadtime" in s or "arrangement" in s:
		return "leadtime-shipping-arrangement"
	if "ship" in s or "clearance" in s:
		return "shipment-clearance-delivery"
	if "docs" in s or "documents" in s:
		return "delivery-docs-submitted"
	# Purchase orders
	if "po" in s:
		if "supplier" in s:
			return "po-to-suppliers"
		if "confirm" in s or "received" in s:
			return "client-confirmed-po"
		if "pending" in s or "await" in s or "draft" in s:
			return "client-draft-po"
		# Default PO context
		return "client-draft-po"
	# Proposal/approval
	if "approval" in s or "approve" in s:
		return "director-approval"
	if "proposal" in s and "sent" in s:
		return "proposal-sent-client"
	if "proposal" in s:
		return "prepare-proposal"
	# Quotes/RFQ
	if "quotation" in s or "quote" in s:
		return "receive-supplier-quotes"
	if "rfq" in s and ("receive" in s or "received" in s):
		return "rfq-from-client"
	if "rfq" in s:
		return "rfqs-to-suppliers"
	# Commercial/general progress catch-alls
	if "commercial" in s:
		return "commercial-arrangements"
	if "progress" in s or "processing" in s or "work" in s:
		return "commercial-arrangements"
	# Fallback
	return "rfq-from-client"


def normalize():
	updated = 0
	skipped = 0
	with db_session() as session:
		items = session.execute(select(Transaction)).scalars().all()
		for trx in items:
			new_status = map_status(trx.status)
			if new_status not in CANONICAL:
				skipped += 1
				continue
			if trx.status != new_status:
				trx.status = new_status
				updated += 1
				session.add(trx)
	print(f"Statuses normalized. Updated: {updated} | Unchanged/Skipped: {skipped}")


if __name__ == "__main__":
	normalize() 