from flask import Blueprint, g, request, jsonify, send_file
from pydantic import ValidationError
from sqlalchemy import select
from database import db_session
from models import Transaction, Supplier, TransactionSupplierLink, Document, ShipmentInfo, ActivityLog, SupplierQuote, AssociatedCost
from io import BytesIO
import base64
import binascii
import os
from werkzeug.utils import secure_filename
from schemas import (
	ActivityCreate,
	AssociatedCostCreate,
	AssociatedCostUpdate,
	ShipmentUpdate,
	SupplierLinkCreate,
	SupplierQuoteCreate,
	TransactionReferencesUpdate,
)

bp = Blueprint('transaction_extras', __name__, url_prefix='/api/transactions')

MAX_DOCUMENT_BYTES = int(os.getenv("MAX_DOCUMENT_BYTES", str(8 * 1024 * 1024)))
ALLOWED_DOCUMENT_CATEGORIES = {"client-po", "supplier-po", "invoice", "other"}
ALLOWED_DOCUMENT_MIME_TYPES = {
	"application/pdf": (b"%PDF-",),
	"image/png": (b"\x89PNG\r\n\x1a\n",),
	"image/jpeg": (b"\xff\xd8\xff",),
}
WORKFLOW_ORDER = (
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
)
SHIPMENT_STATUS = "shipment-clearance-delivery"


def _validation_error(exc: ValidationError):
	return jsonify({
		"error": "invalid_input",
		"details": [
			{"field": ".".join(str(part) for part in error["loc"]), "message": error["msg"]}
			for error in exc.errors()
		],
	}), 400


def _decode_document(content_b64: str, mime_type: str):
	max_encoded_length = ((MAX_DOCUMENT_BYTES + 2) // 3) * 4 + 4
	if len(content_b64) > max_encoded_length:
		raise ValueError("document_too_large")
	try:
		content = base64.b64decode(content_b64, validate=True)
	except (binascii.Error, ValueError) as exc:
		raise ValueError("invalid_document_encoding") from exc
	if len(content) > MAX_DOCUMENT_BYTES:
		raise ValueError("document_too_large")
	signatures = ALLOWED_DOCUMENT_MIME_TYPES.get(mime_type)
	if not signatures or not any(content.startswith(signature) for signature in signatures):
		raise ValueError("document_type_mismatch")
	return content


@bp.get('/suppliers')
def get_bulk_transaction_suppliers():
	ids_param = request.args.get('ids', '')
	try:
		transaction_ids = sorted({int(raw_id) for raw_id in ids_param.split(',') if raw_id.strip()})
	except ValueError:
		return jsonify({"error": "ids must be a comma-separated list of transaction ids"}), 400

	if not transaction_ids:
		return jsonify({"items": []})
	if len(transaction_ids) > 100:
		return jsonify({"error": "a maximum of 100 transaction ids is allowed"}), 400

	with db_session() as session:
		stmt = (
			select(TransactionSupplierLink.transaction_id, Supplier.id, Supplier.name)
			.join(Supplier, TransactionSupplierLink.supplier_id == Supplier.id)
			.where(TransactionSupplierLink.transaction_id.in_(transaction_ids))
			.order_by(TransactionSupplierLink.transaction_id, Supplier.name)
		)
		grouped = {transaction_id: [] for transaction_id in transaction_ids}
		for transaction_id, supplier_id, supplier_name in session.execute(stmt).all():
			grouped.setdefault(transaction_id, []).append({"id": supplier_id, "name": supplier_name})

		return jsonify({
			"items": [
				{"transaction_id": transaction_id, "suppliers": suppliers}
				for transaction_id, suppliers in grouped.items()
			]
		})


@bp.get('/<int:trx_id>/suppliers')
def get_transaction_suppliers(trx_id: int):
	with db_session() as session:
		suppliers = session.execute(
			select(Supplier)
			.join(TransactionSupplierLink, TransactionSupplierLink.supplier_id == Supplier.id)
			.where(TransactionSupplierLink.transaction_id == trx_id)
			.order_by(Supplier.name)
		).scalars().all()
		return jsonify({"items": [{"id": s.id, "name": s.name} for s in suppliers]})


@bp.post('/<int:trx_id>/suppliers')
def add_transaction_supplier(trx_id: int):
	try:
		payload = SupplierLinkCreate(**(request.get_json(silent=True) or {}))
	except ValidationError as exc:
		return _validation_error(exc)
	with db_session() as session:
		trx = session.execute(
			select(Transaction).where(Transaction.id == trx_id).with_for_update()
		).scalar_one_or_none()
		sup = session.get(Supplier, payload.supplier_id)
		if trx is None or sup is None:
			return jsonify({"error": "Not found"}), 404
		existing = session.scalar(select(TransactionSupplierLink.id).where(
			TransactionSupplierLink.transaction_id == trx_id,
			TransactionSupplierLink.supplier_id == payload.supplier_id,
		))
		if existing:
			return jsonify({"ok": True, "already_linked": True})
		link = TransactionSupplierLink(transaction_id=trx_id, supplier_id=payload.supplier_id)
		session.add(link)
		session.add(ActivityLog(transaction_id=trx_id, action="supplier-linked", details=f"Linked supplier {sup.name}"))
		return jsonify({"ok": True}), 201


@bp.get('/<int:trx_id>/documents')
def list_documents(trx_id: int):
	with db_session() as session:
		docs = session.execute(
			select(
				Document.id,
				Document.category,
				Document.name,
				Document.uploaded_by,
				Document.uploaded_at,
				Document.mime_type,
				Document.size_bytes,
			)
			.where(Document.transaction_id == trx_id)
			.order_by(Document.uploaded_at.desc())
		).all()
		return jsonify({
			"items": [{
				"id": d.id,
				"category": d.category,
				"name": d.name,
				"uploaded_by": d.uploaded_by,
				"uploaded_at": d.uploaded_at.isoformat(),
				"mime_type": d.mime_type,
				"size_bytes": d.size_bytes,
			} for d in docs]
		})


@bp.post('/<int:trx_id>/documents')
def create_document(trx_id: int):
	payload = request.get_json() or {}
	category = str(payload.get('category') or '').strip().lower()
	name = secure_filename(str(payload.get('name') or '').strip())
	mime_type = str(payload.get('mime_type') or '').strip().lower()
	po_number = str(payload.get('po_number') or '').strip()
	content_b64 = payload.get('content_base64')
	if not category or not name:
		return jsonify({"error": "category and name required"}), 400
	if category not in ALLOWED_DOCUMENT_CATEGORIES:
		return jsonify({"error": "invalid_document_category"}), 400
	if len(name) > 255:
		return jsonify({"error": "document_name_too_long"}), 400
	if category in {"client-po", "supplier-po"} and not po_number:
		return jsonify({"error": "po_number_required"}), 400
	if len(po_number) > 160:
		return jsonify({"error": "po_number_too_long"}), 400
	if content_b64 and mime_type not in ALLOWED_DOCUMENT_MIME_TYPES:
		return jsonify({"error": "unsupported_document_type"}), 415
	try:
		binary = _decode_document(content_b64, mime_type) if content_b64 else None
	except ValueError as exc:
		error = str(exc)
		status = 413 if error == "document_too_large" else 400
		return jsonify({"error": error}), status
	current_user = getattr(g, "current_user", {}) or {}
	uploaded_by = current_user.get("name") or current_user.get("email")
	with db_session() as session:
		trx = session.get(Transaction, trx_id)
		if trx is None:
			return jsonify({"error": "Not found"}), 404
		if category == "client-po":
			trx.client_po_number = po_number
		elif category == "supplier-po":
			trx.supplier_po_number = po_number
		doc = Document(
			transaction_id=trx_id,
			category=category,
			name=name,
			uploaded_by=uploaded_by,
			mime_type=mime_type or None,
			size_bytes=len(binary) if binary is not None else None,
			content=binary,
		)
		session.add(doc)
		session.flush()
		session.add(ActivityLog(
			transaction_id=trx_id,
			action="document-uploaded",
			details=f"{category}: {name}; PO {po_number}" if po_number else f"{category}: {name}",
		))
		return jsonify({"id": doc.id}), 201

@bp.get('/<int:trx_id>/documents/<int:doc_id>/download')
def download_document(trx_id: int, doc_id: int):
	with db_session() as session:
		doc = session.get(Document, doc_id)
		if doc is None or doc.transaction_id != trx_id or not doc.content:
			return jsonify({"error": "Not found"}), 404
		response = send_file(
			BytesIO(doc.content),
			mimetype=doc.mime_type or 'application/octet-stream',
			as_attachment=True,
			download_name=doc.name,
		)
		response.headers["Cache-Control"] = "private, no-store"
		response.headers["Pragma"] = "no-cache"
		response.headers["X-Content-Type-Options"] = "nosniff"
		return response

@bp.delete('/<int:trx_id>/documents/<int:doc_id>')
def delete_document(trx_id: int, doc_id: int):
	with db_session() as session:
		doc = session.get(Document, doc_id)
		if doc is None or doc.transaction_id != trx_id:
			return jsonify({"error": "Not found"}), 404
		name = doc.name
		category = doc.category
		session.delete(doc)
		session.add(ActivityLog(transaction_id=trx_id, action="document-deleted", details=f"{category}: {name}"))
		return ('', 204)


@bp.get('/<int:trx_id>/quotes')
def list_supplier_quotes(trx_id: int):
	with db_session() as session:
		items = session.execute(select(SupplierQuote).where(SupplierQuote.transaction_id == trx_id).order_by(SupplierQuote.created_at.desc())).scalars().all()
		# map supplier names
		supplier_ids = list({q.supplier_id for q in items})
		suppliers = {}
		if supplier_ids:
			for s in session.execute(select(Supplier).where(Supplier.id.in_(supplier_ids))).scalars().all():
				suppliers[s.id] = s.name
		return jsonify({
			"items": [{
				"id": q.id,
				"supplier_id": q.supplier_id,
				"supplier_name": suppliers.get(q.supplier_id),
				"amount": float(q.amount),
				"currency": q.currency,
				"lead_time_days": q.lead_time_days,
				"notes": q.notes,
				"created_at": q.created_at.isoformat(),
			} for q in items]
		})


@bp.post('/<int:trx_id>/quotes')
def create_supplier_quote(trx_id: int):
	try:
		payload = SupplierQuoteCreate(**(request.get_json(silent=True) or {}))
	except ValidationError as exc:
		return _validation_error(exc)
	with db_session() as session:
		trx = session.get(Transaction, trx_id)
		sup = session.get(Supplier, payload.supplier_id)
		if trx is None or sup is None:
			return jsonify({"error": "Not found"}), 404
		linked = session.scalar(select(TransactionSupplierLink.id).where(
			TransactionSupplierLink.transaction_id == trx_id,
			TransactionSupplierLink.supplier_id == payload.supplier_id,
		))
		if not linked:
			return jsonify({"error": "supplier_not_linked"}), 409
		quote = SupplierQuote(
			transaction_id=trx_id,
			supplier_id=payload.supplier_id,
			amount=payload.amount,
			currency=payload.currency,
			lead_time_days=payload.lead_time_days,
			notes=payload.notes,
		)
		session.add(quote)
		session.flush()
		session.add(ActivityLog(transaction_id=trx_id, action="supplier-quote-added", details=f"{sup.name}: {payload.amount} {payload.currency}"))
		return jsonify({"id": quote.id}), 201


@bp.get('/<int:trx_id>/costs')
def list_costs(trx_id: int):
	with db_session() as session:
		items = session.execute(select(AssociatedCost).where(AssociatedCost.transaction_id == trx_id).order_by(AssociatedCost.created_at.desc())).scalars().all()
		return jsonify({
			"items": [{
				"id": c.id,
				"description": c.description,
				"amount": float(c.amount),
				"status": c.status,
				"created_at": c.created_at.isoformat(),
			} for c in items]
		})


@bp.post('/<int:trx_id>/costs')
def create_cost(trx_id: int):
	try:
		payload = AssociatedCostCreate(**(request.get_json(silent=True) or {}))
	except ValidationError as exc:
		return _validation_error(exc)
	with db_session() as session:
		trx = session.get(Transaction, trx_id)
		if trx is None:
			return jsonify({"error": "Not found"}), 404
		cost = AssociatedCost(
			transaction_id=trx_id,
			description=payload.description,
			amount=payload.amount,
			status=payload.status,
		)
		session.add(cost)
		session.flush()
		session.add(ActivityLog(transaction_id=trx_id, action="cost-added", details=f"{payload.description}: {payload.amount}"))
		return jsonify({"id": cost.id}), 201


@bp.patch('/<int:trx_id>/costs/<int:cost_id>')
def update_cost(trx_id: int, cost_id: int):
	try:
		payload = AssociatedCostUpdate(**(request.get_json(silent=True) or {}))
	except ValidationError as exc:
		return _validation_error(exc)
	with db_session() as session:
		c = session.get(AssociatedCost, cost_id)
		if c is None or c.transaction_id != trx_id:
			return jsonify({"error": "Not found"}), 404
		for field, value in payload.model_dump(exclude_unset=True).items():
			if value is None:
				return jsonify({"error": f"{field}_cannot_be_null"}), 400
			setattr(c, field, value)
		session.add(ActivityLog(transaction_id=trx_id, action="cost-updated", details=f"{c.description}"))
		return jsonify({"ok": True})


@bp.delete('/<int:trx_id>/costs/<int:cost_id>')
def delete_cost(trx_id: int, cost_id: int):
	with db_session() as session:
		c = session.get(AssociatedCost, cost_id)
		if c is None or c.transaction_id != trx_id:
			return jsonify({"error": "Not found"}), 404
		desc = c.description
		session.delete(c)
		session.add(ActivityLog(transaction_id=trx_id, action="cost-deleted", details=desc))
		return ('', 204)

@bp.patch('/<int:trx_id>/refs')
def update_refs(trx_id: int):
	try:
		payload = TransactionReferencesUpdate(**(request.get_json(silent=True) or {}))
	except ValidationError as exc:
		return _validation_error(exc)
	with db_session() as session:
		trx = session.get(Transaction, trx_id)
		if trx is None:
			return jsonify({"error": "Not found"}), 404
		updates = payload.model_dump(exclude_unset=True)
		for field, value in updates.items():
			setattr(trx, field, value)
		session.add(trx)
		session.add(ActivityLog(transaction_id=trx_id, action="refs-updated", details=", ".join(sorted(updates.keys()))))
		return jsonify({"ok": True})


@bp.get('/<int:trx_id>/shipment')
def get_shipment(trx_id: int):
	with db_session() as session:
		info = session.execute(select(ShipmentInfo).where(ShipmentInfo.transaction_id == trx_id)).scalars().first()
		if not info:
			return jsonify({}), 200
		return jsonify({
			"lead_time_days": info.lead_time_days,
			"tracking_number": info.tracking_number,
			"shipped_date": info.shipped_date.isoformat() if info.shipped_date else None,
			"eta_date": info.eta_date.isoformat() if info.eta_date else None,
		})


@bp.put('/<int:trx_id>/shipment')
def upsert_shipment(trx_id: int):
	try:
		payload = ShipmentUpdate(**(request.get_json(silent=True) or {}))
	except ValidationError as exc:
		return _validation_error(exc)
	with db_session() as session:
		trx = session.execute(
			select(Transaction).where(Transaction.id == trx_id).with_for_update()
		).scalar_one_or_none()
		if trx is None:
			return jsonify({"error": "Not found"}), 404
		if trx.status in {"cancelled", "on-hold"}:
			return jsonify({"error": "shipment_confirmation_blocked_by_status"}), 409
		info = session.execute(select(ShipmentInfo).where(ShipmentInfo.transaction_id == trx_id)).scalars().first()
		if not info:
			info = ShipmentInfo(transaction_id=trx_id)
			session.add(info)
		for field, value in payload.model_dump(exclude_unset=True).items():
			setattr(info, field, value)
		if info.shipped_date and info.eta_date and info.eta_date < info.shipped_date:
			return jsonify({"error": "eta_before_shipped_date"}), 400

		current_index = WORKFLOW_ORDER.index(trx.status) if trx.status in WORKFLOW_ORDER else -1
		shipment_index = WORKFLOW_ORDER.index(SHIPMENT_STATUS)
		if current_index < shipment_index and trx.status not in {"cancelled", "on-hold"}:
			trx.status = SHIPMENT_STATUS
		session.add(ActivityLog(
			transaction_id=trx_id,
			action="shipment-confirmed",
			details=f"Tracking {info.tracking_number or 'not provided'}; status {trx.status or 'unchanged'}",
		))
		return jsonify({"ok": True, "status": trx.status})


@bp.get('/<int:trx_id>/activity')
def list_activity(trx_id: int):
	with db_session() as session:
		items = session.execute(
			select(ActivityLog)
			.where(ActivityLog.transaction_id == trx_id)
			.order_by(ActivityLog.created_at.desc())
			.limit(200)
		).scalars().all()
		return jsonify({
			"items": [{
				"id": a.id,
				"action": a.action,
				"details": a.details,
				"created_at": a.created_at.isoformat(),
			} for a in items]
		})


@bp.post('/<int:trx_id>/activity')
def add_activity(trx_id: int):
	try:
		payload = ActivityCreate(**(request.get_json(silent=True) or {}))
	except ValidationError as exc:
		return _validation_error(exc)
	with db_session() as session:
		if session.get(Transaction, trx_id) is None:
			return jsonify({"error": "Not found"}), 404
		session.add(ActivityLog(transaction_id=trx_id, action=payload.action, details=payload.details))
		return jsonify({"ok": True}), 201
