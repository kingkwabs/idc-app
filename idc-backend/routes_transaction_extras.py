from flask import Blueprint, request, jsonify, send_file
from sqlalchemy import select
from database import db_session
from models import Transaction, Supplier, TransactionSupplierLink, Document, ShipmentInfo, ActivityLog, SupplierQuote, AssociatedCost
from datetime import datetime
from io import BytesIO
import base64

bp = Blueprint('transaction_extras', __name__, url_prefix='/api/transactions')


@bp.get('/suppliers')
def get_bulk_transaction_suppliers():
	ids_param = request.args.get('ids', '')
	try:
		transaction_ids = sorted({int(raw_id) for raw_id in ids_param.split(',') if raw_id.strip()})
	except ValueError:
		return jsonify({"error": "ids must be a comma-separated list of transaction ids"}), 400

	if not transaction_ids:
		return jsonify({"items": []})

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
	payload = request.get_json() or {}
	supplier_id = payload.get('supplier_id')
	if not supplier_id:
		return jsonify({"error": "supplier_id required"}), 400
	with db_session() as session:
		# ensure transaction and supplier exist
		trx = session.get(Transaction, trx_id)
		sup = session.get(Supplier, supplier_id)
		if trx is None or sup is None:
			return jsonify({"error": "Not found"}), 404
		link = TransactionSupplierLink(transaction_id=trx_id, supplier_id=supplier_id)
		session.add(link)
		session.add(ActivityLog(transaction_id=trx_id, action="supplier-linked", details=f"Linked supplier {sup.name}"))
		return jsonify({"ok": True}), 201


@bp.get('/<int:trx_id>/documents')
def list_documents(trx_id: int):
	with db_session() as session:
		docs = session.execute(select(Document).where(Document.transaction_id == trx_id).order_by(Document.uploaded_at.desc())).scalars().all()
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
	category = payload.get('category')
	name = payload.get('name')
	uploaded_by = payload.get('uploaded_by')
	mime_type = payload.get('mime_type')
	size_bytes = payload.get('size_bytes')
	content_b64 = payload.get('content_base64')
	if not category or not name:
		return jsonify({"error": "category and name required"}), 400
	with db_session() as session:
		trx = session.get(Transaction, trx_id)
		if trx is None:
			return jsonify({"error": "Not found"}), 404
		binary = base64.b64decode(content_b64) if content_b64 else None
		doc = Document(transaction_id=trx_id, category=category, name=name, uploaded_by=uploaded_by, mime_type=mime_type, size_bytes=size_bytes, content=binary)
		session.add(doc)
		session.flush()
		session.add(ActivityLog(transaction_id=trx_id, action="document-uploaded", details=f"{category}: {name}"))
		return jsonify({"id": doc.id}), 201

@bp.get('/<int:trx_id>/documents/<int:doc_id>/download')
def download_document(trx_id: int, doc_id: int):
	with db_session() as session:
		doc = session.get(Document, doc_id)
		if doc is None or doc.transaction_id != trx_id or not doc.content:
			return jsonify({"error": "Not found"}), 404
		return send_file(BytesIO(doc.content), mimetype=doc.mime_type or 'application/octet-stream', as_attachment=True, download_name=doc.name)

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
	payload = request.get_json() or {}
	supplier_id = payload.get('supplier_id')
	amount = payload.get('amount')
	currency = payload.get('currency')
	lead_time_days = payload.get('lead_time_days')
	notes = payload.get('notes')
	if not supplier_id or amount is None:
		return jsonify({"error": "supplier_id and amount required"}), 400
	with db_session() as session:
		trx = session.get(Transaction, trx_id)
		sup = session.get(Supplier, supplier_id)
		if trx is None or sup is None:
			return jsonify({"error": "Not found"}), 404
		quote = SupplierQuote(transaction_id=trx_id, supplier_id=supplier_id, amount=amount, currency=currency, lead_time_days=lead_time_days, notes=notes)
		session.add(quote)
		session.flush()
		session.add(ActivityLog(transaction_id=trx_id, action="supplier-quote-added", details=f"{sup.name}: {amount} {currency or ''}"))
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
	payload = request.get_json() or {}
	description = payload.get('description')
	amount = payload.get('amount')
	status = payload.get('status') or 'due'
	if not description or amount is None:
		return jsonify({"error": "description and amount required"}), 400
	with db_session() as session:
		trx = session.get(Transaction, trx_id)
		if trx is None:
			return jsonify({"error": "Not found"}), 404
		cost = AssociatedCost(transaction_id=trx_id, description=description, amount=amount, status=status)
		session.add(cost)
		session.flush()
		session.add(ActivityLog(transaction_id=trx_id, action="cost-added", details=f"{description}: {amount}"))
		return jsonify({"id": cost.id}), 201


@bp.patch('/<int:trx_id>/costs/<int:cost_id>')
def update_cost(trx_id: int, cost_id: int):
	payload = request.get_json() or {}
	with db_session() as session:
		c = session.get(AssociatedCost, cost_id)
		if c is None or c.transaction_id != trx_id:
			return jsonify({"error": "Not found"}), 404
		desc = payload.get('description')
		amount = payload.get('amount')
		status = payload.get('status')
		if desc is not None:
			c.description = desc
		if amount is not None:
			c.amount = amount
		if status is not None:
			c.status = status
		session.add(c)
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
	payload = request.get_json() or {}
	with db_session() as session:
		trx = session.get(Transaction, trx_id)
		if trx is None:
			return jsonify({"error": "Not found"}), 404
		rfq = payload.get('rfq_number')
		client_po = payload.get('client_po_number')
		supplier_po = payload.get('supplier_po_number')
		if rfq is not None:
			trx.rfq_number = rfq
		if client_po is not None:
			trx.client_po_number = client_po
		if supplier_po is not None:
			trx.supplier_po_number = supplier_po
		session.add(trx)
		session.add(ActivityLog(transaction_id=trx_id, action="refs-updated", details=f"rfq:{rfq or ''}, cpo:{client_po or ''}, spo:{supplier_po or ''}"))
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
	payload = request.get_json() or {}
	with db_session() as session:
		info = session.execute(select(ShipmentInfo).where(ShipmentInfo.transaction_id == trx_id)).scalars().first()
		if not info:
			info = ShipmentInfo(transaction_id=trx_id)
			session.add(info)
		info.lead_time_days = payload.get('lead_time_days')
		info.tracking_number = payload.get('tracking_number')
		# parse dates as YYYY-MM-DD
		shipped = payload.get('shipped_date')
		eta = payload.get('eta_date')
		if shipped:
			info.shipped_date = datetime.fromisoformat(shipped).date()
		if eta:
			info.eta_date = datetime.fromisoformat(eta).date()
		session.add(info)
		session.add(ActivityLog(transaction_id=trx_id, action="shipment-updated", details=f"Tracking {info.tracking_number or ''}"))
		return jsonify({"ok": True})


@bp.get('/<int:trx_id>/activity')
def list_activity(trx_id: int):
	with db_session() as session:
		items = session.execute(select(ActivityLog).where(ActivityLog.transaction_id == trx_id).order_by(ActivityLog.created_at.desc())).scalars().all()
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
	payload = request.get_json() or {}
	action = payload.get('action')
	details = payload.get('details')
	if not action:
		return jsonify({"error": "action required"}), 400
	with db_session() as session:
		session.add(ActivityLog(transaction_id=trx_id, action=action, details=details))
		return jsonify({"ok": True}), 201
