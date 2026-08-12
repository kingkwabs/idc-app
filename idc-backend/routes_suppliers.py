from flask import Blueprint, jsonify, request
from pydantic import ValidationError
from sqlalchemy import case, func, not_, select

from database import db_session
from models import Client, Supplier, SupplierQuote, Transaction, TransactionSupplierLink
from schemas import SupplierCreate, SupplierOut, SupplierUpdate
from supplier_service import SupplierNameConflictError, create_supplier_record, supplier_name_exists
from workflow import TERMINAL_TRANSACTION_STATUSES

bp = Blueprint("suppliers", __name__, url_prefix="/api/suppliers")


def _validation_error(exc: ValidationError):
	return jsonify({
		"error": "invalid_input",
		"details": [
			{"field": ".".join(str(part) for part in error["loc"]), "message": error["msg"]}
			for error in exc.errors()
		],
	}), 400


@bp.get("")
def list_suppliers():
	with db_session() as session:
		items = session.execute(select(Supplier).order_by(Supplier.name)).scalars().all()
		return jsonify({
			"items": [SupplierOut.model_validate(item).model_dump(mode="json") for item in items],
		})


@bp.post("")
def create_supplier():
	try:
		payload = SupplierCreate(**(request.get_json(silent=True) or {}))
	except ValidationError as exc:
		return _validation_error(exc)
	with db_session() as session:
		try:
			supplier = create_supplier_record(session, payload)
		except SupplierNameConflictError:
			return jsonify({"error": "supplier_exists"}), 409
		return jsonify(SupplierOut.model_validate(supplier).model_dump(mode="json")), 201


@bp.put("/<int:supplier_id>")
def update_supplier(supplier_id: int):
	try:
		payload = SupplierUpdate(**(request.get_json(silent=True) or {}))
	except ValidationError as exc:
		return _validation_error(exc)
	with db_session() as session:
		supplier = session.get(Supplier, supplier_id)
		if supplier is None:
			return jsonify({"error": "supplier_not_found"}), 404
		updates = payload.model_dump(mode="json", exclude_unset=True)
		if "name" in updates:
			if updates["name"] is None:
				return jsonify({"error": "supplier_name_required"}), 400
			if supplier_name_exists(session, updates["name"], exclude_supplier_id=supplier_id):
				return jsonify({"error": "supplier_exists"}), 409
		for field, value in updates.items():
			setattr(supplier, field, value)
		session.flush()
		return jsonify(SupplierOut.model_validate(supplier).model_dump(mode="json"))


@bp.get("/summary")
def get_supplier_summary():
	status_text = func.coalesce(func.lower(Transaction.status), "")
	inactive_status = status_text.in_(TERMINAL_TRANSACTION_STATUSES)
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


@bp.get("/metrics")
def list_supplier_metrics():
	status_text = func.coalesce(func.lower(Transaction.status), "")
	active_status = not_(status_text.in_(TERMINAL_TRANSACTION_STATUSES))
	with db_session() as session:
		quote_metrics = (
			select(
				SupplierQuote.supplier_id.label("supplier_id"),
				func.count(SupplierQuote.id).label("quote_count"),
				func.max(SupplierQuote.created_at).label("last_quoted"),
			)
			.group_by(SupplierQuote.supplier_id)
			.subquery()
		)
		sourcing_activity = (
			select(
				TransactionSupplierLink.supplier_id.label("supplier_id"),
				TransactionSupplierLink.transaction_id.label("transaction_id"),
			)
			.union(
				select(
					SupplierQuote.supplier_id.label("supplier_id"),
					SupplierQuote.transaction_id.label("transaction_id"),
				)
			)
			.subquery()
		)
		sourcing_metrics = (
			select(
				sourcing_activity.c.supplier_id,
				func.count(sourcing_activity.c.transaction_id).label("sourcing_records"),
				func.coalesce(func.sum(case((active_status, 1), else_=0)), 0).label("active_transactions"),
			)
			.join(Transaction, Transaction.id == sourcing_activity.c.transaction_id)
			.group_by(sourcing_activity.c.supplier_id)
			.subquery()
		)
		statement = (
			select(
				Supplier.id,
				Supplier.name,
				func.coalesce(sourcing_metrics.c.sourcing_records, 0).label("sourcing_records"),
				func.coalesce(sourcing_metrics.c.active_transactions, 0).label("active_transactions"),
				func.coalesce(quote_metrics.c.quote_count, 0).label("quote_count"),
				quote_metrics.c.last_quoted,
			)
			.outerjoin(sourcing_metrics, sourcing_metrics.c.supplier_id == Supplier.id)
			.outerjoin(quote_metrics, quote_metrics.c.supplier_id == Supplier.id)
			.order_by(Supplier.name)
		)
		return jsonify({
			"items": [{
				"id": row.id,
				"name": row.name,
				"sourcing_records": int(row.sourcing_records or 0),
				"active_transactions": int(row.active_transactions or 0),
				"quotes": int(row.quote_count or 0),
				"last_quoted": row.last_quoted.isoformat() if row.last_quoted else None,
			} for row in session.execute(statement).all()],
		})


@bp.get("/<int:supplier_id>")
def get_supplier_overview(supplier_id: int):
	with db_session() as session:
		supplier = session.get(Supplier, supplier_id)
		if supplier is None:
			return jsonify({"error": "supplier_not_found"}), 404

		linked_transaction_ids = select(TransactionSupplierLink.transaction_id).where(
			TransactionSupplierLink.supplier_id == supplier_id
		)
		quoted_transaction_ids = select(SupplierQuote.transaction_id).where(
			SupplierQuote.supplier_id == supplier_id
		)
		activity_transaction_ids = linked_transaction_ids.union(quoted_transaction_ids)
		transaction_rows = session.execute(
			select(Transaction, Client.name.label("client_name"))
			.join(Client, Client.id == Transaction.client_id)
			.where(Transaction.id.in_(activity_transaction_ids))
			.order_by(
				Transaction.date_received.is_(None),
				Transaction.date_received.desc(),
				Transaction.id.desc(),
			)
		).all()
		quotes = session.execute(
			select(SupplierQuote)
			.where(SupplierQuote.supplier_id == supplier_id)
			.order_by(SupplierQuote.created_at.desc(), SupplierQuote.id.desc())
		).scalars().all()

		quotes_by_transaction: dict[int, list[dict]] = {}
		for quote in quotes:
			quotes_by_transaction.setdefault(quote.transaction_id, []).append({
				"id": quote.id,
				"amount": float(quote.amount),
				"currency": quote.currency,
				"lead_time_days": quote.lead_time_days,
				"notes": quote.notes,
				"created_at": quote.created_at.isoformat(),
			})

		items = [{
			"transaction_id": transaction.id,
			"client_id": transaction.client_id,
			"client_name": client_name,
			"rfq_number": transaction.rfq_number,
			"date_received": transaction.date_received.isoformat() if transaction.date_received else None,
			"item_description": transaction.item_description,
			"status": transaction.status,
			"quotes": quotes_by_transaction.get(transaction.id, []),
		} for transaction, client_name in transaction_rows]
		active_transactions = sum(
			1
			for item in items
			if (item["status"] or "").lower() not in TERMINAL_TRANSACTION_STATUSES
		)

		return jsonify({
			"supplier": SupplierOut.model_validate(supplier).model_dump(mode="json"),
			"summary": {
				"sourcing_records": len(items),
				"active_transactions": active_transactions,
				"quotes": len(quotes),
			},
			"items": items,
		})
