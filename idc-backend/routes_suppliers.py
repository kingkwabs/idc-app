from flask import Blueprint, jsonify, request
from pydantic import ValidationError
from sqlalchemy import func, not_, select

from database import db_session
from models import Supplier, SupplierQuote, Transaction, TransactionSupplierLink
from schemas import SupplierCreate, SupplierOut, SupplierUpdate
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
		if session.query(Supplier.id).filter(func.lower(Supplier.name) == payload.name.lower()).first():
			return jsonify({"error": "supplier_exists"}), 409
		supplier = Supplier(**payload.model_dump(mode="json"))
		session.add(supplier)
		session.flush()
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
			existing = session.query(Supplier.id).filter(
				func.lower(Supplier.name) == updates["name"].lower(),
				Supplier.id != supplier_id,
			).first()
			if existing:
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
	with db_session() as session:
		statement = (
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
			} for row in session.execute(statement).all()],
		})
