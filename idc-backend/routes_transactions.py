from datetime import date

from flask import Blueprint, g, request, jsonify
from sqlalchemy import select, delete, func, case, extract
from database import db_session
from models import (
	ActivityLog,
	AssociatedCost,
	Client,
	Document,
	QuickBooksInvoiceAttempt,
	ShipmentInfo,
	SupplierQuote,
	Transaction,
	TransactionSupplierLink,
)
from schemas import TransactionCreate, TransactionOut, TransactionUpdate
from auth_util import require_admin
from workflow import TERMINAL_TRANSACTION_STATUSES

bp = Blueprint('transactions', __name__, url_prefix='/api/transactions')
MAX_PAGE_SIZE = 100


def _transaction_payload(transaction: Transaction) -> dict:
	return TransactionOut.model_validate(transaction).model_dump(mode="json")


@bp.post('')
def create_transaction():
	payload = request.get_json() or {}
	data = TransactionCreate(**payload)
	with db_session() as session:
		if session.get(Client, data.client_id) is None:
			return jsonify({"error": "client_not_found"}), 404
		trx = Transaction(
			client_id=data.client_id,
			rfq_number=data.rfq_number,
			date_received=data.date_received,
			item_description=data.item_description,
			client_quote_amount=data.client_quote_amount,
			client_quote_currency=data.client_quote_currency,
		)
		session.add(trx)
		session.flush()  # assign id
		return jsonify(_transaction_payload(trx)), 201


@bp.get('')
def list_transactions():
	try:
		page = int(request.args.get('page', 1))
		size = int(request.args.get('size', 20))
	except (TypeError, ValueError):
		return jsonify({"error": "page_and_size_must_be_integers"}), 400
	if page < 1 or size < 1 or size > MAX_PAGE_SIZE:
		return jsonify({"error": f"page must be positive and size must be between 1 and {MAX_PAGE_SIZE}"}), 400

	client_term = request.args.get("client", "").strip().lower()
	status_term = request.args.get("status", "").strip().lower()
	year_term = request.args.get("year", "").strip().lower()
	sort_key = request.args.get("sort", "date").strip().lower()
	direction = request.args.get("direction", "desc").strip().lower()
	if sort_key not in {"date", "amount", "client"} or direction not in {"asc", "desc"}:
		return jsonify({"error": "invalid_transaction_sort"}), 400

	year_range = None
	if year_term and year_term != "undated":
		try:
			year = int(year_term)
		except ValueError:
			return jsonify({"error": "invalid_transaction_year"}), 400
		if year < 1 or year > 9998:
			return jsonify({"error": "invalid_transaction_year"}), 400
		year_range = (date(year, 1, 1), date(year + 1, 1, 1))

	offset = (page - 1) * size
	with db_session() as session:
		filters = []
		if client_term:
			filters.append(func.lower(Client.name).contains(client_term))
		if status_term:
			filters.append(func.lower(func.coalesce(Transaction.status, "")).contains(status_term))
		if year_term == "undated":
			filters.append(Transaction.date_received.is_(None))
		elif year_range is not None:
			filters.extend([
				Transaction.date_received >= year_range[0],
				Transaction.date_received < year_range[1],
			])

		amount = func.coalesce(Transaction.client_po_amount, Transaction.client_quote_amount, 0)
		sort_column = {
			"date": Transaction.date_received,
			"amount": amount,
			"client": func.lower(Client.name),
		}[sort_key]
		ordered = sort_column.asc().nullslast() if direction == "asc" else sort_column.desc().nullslast()

		stmt = (
			select(Transaction)
			.join(Client, Transaction.client_id == Client.id)
			.where(*filters)
			.order_by(ordered, Transaction.id.asc() if direction == "asc" else Transaction.id.desc())
			.offset(offset)
			.limit(size)
		)
		total_stmt = (
			select(func.count(Transaction.id))
			.join(Client, Transaction.client_id == Client.id)
			.where(*filters)
		)
		items = session.execute(stmt).scalars().all()
		total = session.scalar(total_stmt) or 0
		data = [_transaction_payload(item) for item in items]
		return jsonify({"items": data, "page": page, "size": size, "total": int(total)})


@bp.get('/years')
def get_transaction_years():
	year_column = extract("year", Transaction.date_received)
	with db_session() as session:
		rows = session.execute(
			select(
				year_column.label("year"),
				func.count(Transaction.id).label("count"),
			).group_by(year_column)
		).all()

	items = [
		{"year": int(row.year), "count": int(row.count)}
		for row in rows
		if row.year is not None
	]
	items.sort(key=lambda item: item["year"], reverse=True)
	undated_count = sum(int(row.count) for row in rows if row.year is None)
	if undated_count:
		items.append({"year": None, "count": undated_count})
	return jsonify({"items": items, "total": sum(item["count"] for item in items)})


@bp.get('/summary')
def get_transactions_summary():
	status_text = func.coalesce(func.lower(Transaction.status), "")
	inactive_status = status_text.in_(TERMINAL_TRANSACTION_STATUSES)
	revenue_amount = func.coalesce(Transaction.client_po_amount, Transaction.client_quote_amount, 0)
	with db_session() as session:
		stmt = select(
			func.coalesce(func.sum(case((inactive_status, 0), else_=1)), 0).label("active_count"),
			func.coalesce(func.sum(revenue_amount), 0).label("total_revenue"),
		)
		row = session.execute(stmt).one()
		return jsonify({
			"active_count": int(row.active_count or 0),
			"total_revenue": float(row.total_revenue or 0),
		})


@bp.get('/<int:trx_id>')
def get_transaction(trx_id: int):
	with db_session() as session:
		obj = session.get(Transaction, trx_id)
		if obj is None:
			return jsonify({"error": "Not found"}), 404
		return jsonify(_transaction_payload(obj))


@bp.patch('/<int:trx_id>')
def update_transaction(trx_id: int):
	payload = request.get_json() or {}
	data = TransactionUpdate(**payload)
	with db_session() as session:
		obj = session.get(Transaction, trx_id)
		if obj is None:
			return jsonify({"error": "Not found"}), 404
		old_status = obj.status
		updates = data.model_dump(exclude_unset=True, exclude={"status_reason"})
		for field, value in updates.items():
			setattr(obj, field, value)
		if "status" in updates and updates["status"] != old_status:
			current_user = getattr(g, "current_user", {}) or {}
			reason = (data.status_reason or "Workflow advanced through the application.").strip()
			details = f"{old_status or 'unset'} -> {updates['status']}; {reason}"
			if current_user.get("name"):
				details += f"; by {current_user['name']}"
			session.add(ActivityLog(
				transaction_id=trx_id,
				action="status-updated",
				details=details,
			))
		return jsonify(_transaction_payload(obj))


@bp.delete('/<int:trx_id>')
@require_admin
def delete_transaction(current_user, trx_id: int):
	with db_session() as session:
		obj = session.execute(
			select(Transaction).where(Transaction.id == trx_id).with_for_update()
		).scalar_one_or_none()
		if obj is None:
			return jsonify({"error": "Not found"}), 404
		invoice_attempt = session.execute(
			select(QuickBooksInvoiceAttempt)
			.where(QuickBooksInvoiceAttempt.transaction_id == trx_id)
			.with_for_update()
		).scalar_one_or_none()
		protected_attempt = invoice_attempt is not None and (
			invoice_attempt.invoice_id is not None
			or invoice_attempt.status in {"pending", "succeeded", "unknown"}
		)
		if (
			obj.quickbooks_invoice_id
			or obj.invoiced_at
			or obj.quickbooks_invoice_status in {"pending", "succeeded", "unknown"}
			or protected_attempt
		):
			return jsonify({
				"error": "transaction_has_quickbooks_invoice_history",
				"details": "Transactions with pending or recorded QuickBooks invoice history must be retained for reconciliation and audit. Cancel the workflow instead.",
			}), 409
		# Delete related rows first
		session.execute(delete(Document).where(Document.transaction_id == trx_id))
		session.execute(delete(ShipmentInfo).where(ShipmentInfo.transaction_id == trx_id))
		session.execute(delete(ActivityLog).where(ActivityLog.transaction_id == trx_id))
		session.execute(delete(TransactionSupplierLink).where(TransactionSupplierLink.transaction_id == trx_id))
		session.execute(delete(SupplierQuote).where(SupplierQuote.transaction_id == trx_id))
		session.execute(delete(AssociatedCost).where(AssociatedCost.transaction_id == trx_id))
		session.execute(delete(QuickBooksInvoiceAttempt).where(QuickBooksInvoiceAttempt.transaction_id == trx_id))
		# Then delete transaction
		session.delete(obj)
		return ('', 204)
