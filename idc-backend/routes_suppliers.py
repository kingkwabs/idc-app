from flask import Blueprint, jsonify
from sqlalchemy import select, func, or_, not_
from database import db_session
from models import Supplier, SupplierQuote, TransactionSupplierLink, Transaction

bp = Blueprint('suppliers', __name__, url_prefix='/api/suppliers')

@bp.get('')
def list_suppliers():
	with db_session() as session:
		items = session.execute(select(Supplier)).scalars().all()
		return jsonify({"items": [{"id": s.id, "name": s.name} for s in items]})


@bp.get('/summary')
def get_supplier_summary():
	status_text = func.coalesce(func.lower(Transaction.status), "")
	inactive_status = or_(
		status_text.like("%deliver%"),
		status_text.like("%cancel%"),
		status_text == "loans-cleared",
	)
	with db_session() as session:
		total_suppliers = session.scalar(select(func.count(Supplier.id))) or 0
		engaged_suppliers = session.scalar(
			select(func.count(func.distinct(TransactionSupplierLink.supplier_id)))
			.join(Transaction, TransactionSupplierLink.transaction_id == Transaction.id)
			.where(not_(inactive_status))
		) or 0
		total_spend = session.scalar(
			select(func.coalesce(func.sum(Transaction.supplier_po_amount), 0))
		) or 0

		return jsonify({
			"total_suppliers": int(total_suppliers),
			"engaged_suppliers": int(engaged_suppliers),
			"total_spend": float(total_spend),
		})


@bp.get('/metrics')
def list_supplier_metrics():
	with db_session() as session:
		stmt = (
			select(
				Supplier.id,
				Supplier.name,
				func.count(SupplierQuote.id).label("quote_count"),
				func.max(SupplierQuote.created_at).label("last_quoted"),
			)
			.outerjoin(SupplierQuote, SupplierQuote.supplier_id == Supplier.id)
			.group_by(Supplier.id, Supplier.name)
			.order_by(Supplier.name)
		)
		return jsonify({
			"items": [{
				"id": row.id,
				"name": row.name,
				"quotes": int(row.quote_count or 0),
				"last_quoted": row.last_quoted.isoformat() if row.last_quoted else None,
			} for row in session.execute(stmt).all()]
		})
