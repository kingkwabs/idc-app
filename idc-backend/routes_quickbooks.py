"""
QuickBooks OAuth and Invoice Management Routes
"""
import hashlib
import hmac
import json
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from flask import Blueprint, Response, request, jsonify
from decimal import Decimal
from sqlalchemy import or_, select

from auth_util import create_access_token, require_admin, verify_token
from database import db_session
from models import (
	ActivityLog,
	AssociatedCost,
	Employee,
	QuickBooksOAuthState,
	QuickBooksInvoiceAttempt,
	Supplier,
	SupplierQuote,
	Transaction,
)
from quickbooks_service import (
	QuickBooksConfigurationError,
	QuickBooksInvoiceAttemptConflict,
	QuickBooksNotConnectedError,
	QuickBooksService,
)
from schemas import QuickBooksInvoiceCreateRequest, QuickBooksInvoicePreviewRequest

bp = Blueprint('quickbooks', __name__, url_prefix='/quickbooks')
logger = logging.getLogger(__name__)
QB_OAUTH_STATE_PURPOSE = "quickbooks_oauth"
QB_OAUTH_STATE_TTL_SECONDS = 10 * 60


def _utcnow() -> datetime:
	return datetime.now(timezone.utc).replace(tzinfo=None)


def _to_decimal(value) -> Decimal:
	if value is None:
		return Decimal("0")
	return Decimal(str(value))


def _decimal_to_float(value: Decimal) -> float:
	return float(value.quantize(Decimal("0.01")))


def _create_oauth_state(session, user_id: str) -> str:
	nonce = secrets.token_urlsafe(32)
	now = _utcnow()
	retention_cutoff = now - timedelta(days=1)
	session.query(QuickBooksOAuthState).filter(
		or_(
			QuickBooksOAuthState.expires_at < retention_cutoff,
			QuickBooksOAuthState.used_at < retention_cutoff,
		)
	).delete(synchronize_session=False)
	session.add(QuickBooksOAuthState(
		nonce_hash=hashlib.sha256(nonce.encode("utf-8")).hexdigest(),
		employee_id=int(user_id),
		expires_at=now + timedelta(seconds=QB_OAUTH_STATE_TTL_SECONDS),
	))
	session.flush()
	return create_access_token(
		sub=str(user_id),
		ttl_seconds=QB_OAUTH_STATE_TTL_SECONDS,
		extra_claims={
			"purpose": QB_OAUTH_STATE_PURPOSE,
			"nonce": nonce,
			"user_id": str(user_id),
		},
	)


def _verify_oauth_state(state: str) -> dict:
	payload = verify_token(state)
	if payload.get("purpose") != QB_OAUTH_STATE_PURPOSE:
		raise ValueError("invalid_state_purpose")
	if not payload.get("nonce"):
		raise ValueError("missing_state_nonce")
	if not payload.get("sub") or payload.get("user_id") != payload.get("sub"):
		raise ValueError("invalid_state_user")
	return payload


def _consume_oauth_state(session, state: str) -> dict:
	payload = _verify_oauth_state(state)
	now = _utcnow()
	nonce_hash = hashlib.sha256(payload["nonce"].encode("utf-8")).hexdigest()
	try:
		employee_id = int(payload["sub"])
	except (TypeError, ValueError) as exc:
		raise ValueError("invalid_state_user") from exc

	stored_state = session.execute(
		select(QuickBooksOAuthState)
		.where(
			QuickBooksOAuthState.nonce_hash == nonce_hash,
			QuickBooksOAuthState.employee_id == employee_id,
			QuickBooksOAuthState.used_at.is_(None),
			QuickBooksOAuthState.expires_at > now,
		)
		.with_for_update()
	).scalar_one_or_none()
	if stored_state is None:
		raise ValueError("invalid_or_used_state")
	employee = session.execute(
		select(Employee)
		.where(Employee.id == employee_id)
		.with_for_update()
	).scalar_one_or_none()
	if employee is None or not employee.is_active or employee.role != "admin":
		raise ValueError("oauth_actor_no_longer_authorized")

	stored_state.used_at = now
	# Consume before token exchange; a failed upstream call must not make the
	# callback replayable.
	session.commit()
	return payload


def _frontend_connection_redirect(connection: str):
	frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
	response = Response(status=302)
	response.headers["Location"] = f"{frontend_url}/quickbooks?connection={connection}"
	return response


def _build_customer_notes(transaction: Transaction, custom_notes: str) -> str:
	notes_parts = []
	if transaction.rfq_number:
		notes_parts.append(f"RFQ: {transaction.rfq_number}")
	if transaction.client_po_number:
		notes_parts.append(f"Client PO: {transaction.client_po_number}")
	if custom_notes and custom_notes.strip():
		notes_parts.append(custom_notes.strip())
	return " | ".join(notes_parts)


def _build_invoice_plan(
	session,
	transaction: Transaction,
	selected_quote_id: int | None = None,
	billable_cost_ids: list[int] | None = None,
	custom_notes: str = "",
) -> dict:
	"""
	Build the exact customer-facing invoice payload and internal margin context.
	Supplier quotes and normal associated costs stay internal unless explicitly selected.
	"""
	errors = []
	warnings = []
	line_items = []
	billable_cost_ids = billable_cost_ids or []
	billable_cost_id_set = set(billable_cost_ids)

	client_billable_amount = _to_decimal(transaction.client_po_amount)
	client_billable_source = "client_po_amount"
	invoice_currency = (transaction.client_quote_currency or "USD").strip().upper()
	if invoice_currency != "USD":
		errors.append(
			"QuickBooks invoice creation supports USD transactions only in v1."
		)
	if client_billable_amount <= 0 and transaction.client_quote_amount is not None:
		client_billable_amount = _to_decimal(transaction.client_quote_amount)
		client_billable_source = "client_quote_amount"

	if client_billable_amount <= 0:
		errors.append("Add a client PO amount before creating a QuickBooks invoice.")
	else:
		invoice_description = (transaction.item_description or "Services Rendered").strip() or "Services Rendered"
		if len(invoice_description) > 4000:
			errors.append(
				"Shorten the transaction description to 4,000 characters or fewer before invoicing."
			)
		else:
			line_items.append({
				"description": invoice_description,
				"amount": _decimal_to_float(client_billable_amount),
				"quantity": 1,
				"source": "client_billable_amount",
				"reference": client_billable_source,
				"billable": True,
			})

	selected_supplier_quote = None
	selected_supplier_quote_total = Decimal("0")
	selected_supplier_quote_comparable = False
	parsed_quote_id = selected_quote_id
	if parsed_quote_id is not None:
		quote = session.get(SupplierQuote, parsed_quote_id)
		if quote is None or quote.transaction_id != transaction.id:
			errors.append("Selected supplier quote was not found for this transaction.")
		else:
			supplier = session.get(Supplier, quote.supplier_id)
			selected_supplier_quote_total = _to_decimal(quote.amount)
			quote_currency = (quote.currency or "USD").strip().upper()
			selected_supplier_quote_comparable = quote_currency == invoice_currency
			selected_supplier_quote = {
				"id": quote.id,
				"supplier_id": quote.supplier_id,
				"supplier_name": supplier.name if supplier else None,
				"amount": _decimal_to_float(selected_supplier_quote_total),
				"currency": quote_currency,
				"lead_time_days": quote.lead_time_days,
			}

	associated_costs = session.query(AssociatedCost).filter(
		AssociatedCost.transaction_id == transaction.id
	).all()
	costs_by_id = {cost.id: cost for cost in associated_costs}
	missing_cost_ids = sorted(billable_cost_id_set.difference(costs_by_id.keys()))
	if missing_cost_ids:
		errors.append(f"Associated cost ids not found for this transaction: {missing_cost_ids}")

	billable_costs_total = Decimal("0")
	for cost_id in billable_cost_ids:
		cost = costs_by_id.get(cost_id)
		if not cost:
			continue
		cost_amount = _to_decimal(cost.amount)
		if cost_amount <= 0:
			errors.append(f"Associated cost {cost.id} must be greater than zero before billing.")
			continue
		cost_description = str(cost.description or "").strip()
		if not cost_description or len(cost_description) > 4000:
			errors.append(
				f"Associated cost {cost.id} needs a description between 1 and 4,000 characters."
			)
			continue
		billable_costs_total += cost_amount
		line_items.append({
			"description": cost_description,
			"amount": _decimal_to_float(cost_amount),
			"quantity": 1,
			"source": "associated_cost",
			"cost_id": cost.id,
			"billable": True,
		})

	internal_associated_costs_total = sum((_to_decimal(cost.amount) for cost in associated_costs), Decimal("0"))
	internal_supplier_po_amount = _to_decimal(transaction.supplier_po_amount)
	internal_supplier_cost_basis = (
		selected_supplier_quote_total
		if selected_supplier_quote and selected_supplier_quote_comparable
		else internal_supplier_po_amount
	)
	invoice_total = sum((_to_decimal(item["amount"]) for item in line_items), Decimal("0"))
	estimated_margin = invoice_total - internal_supplier_cost_basis - internal_associated_costs_total
	already_invoiced = bool(transaction.quickbooks_invoice_id)

	if associated_costs and not billable_cost_ids:
		warnings.append("Associated costs are internal by default. Select only the costs that should be billed to the client.")
	if selected_supplier_quote:
		warnings.append("Selected supplier quote is used for internal margin context only and will not appear on the customer invoice.")
		if not selected_supplier_quote_comparable:
			warnings.append(
				f"The selected supplier quote is {selected_supplier_quote['currency']}, so the USD supplier PO amount is used for estimated margin instead."
			)
	if transaction.supplier_po_number:
		warnings.append("Supplier PO details are kept off the customer-facing QuickBooks memo.")
	if already_invoiced:
		warnings.append(f"This transaction already has QuickBooks Invoice #{transaction.quickbooks_invoice_number}.")

	customer_notes = _build_customer_notes(transaction, custom_notes)
	if len(customer_notes) > 1000:
		errors.append(
			"The combined RFQ, client PO, and customer memo must be 1,000 characters or fewer."
		)

	can_create = not already_invoiced and not errors and len(line_items) > 0
	totals = {
		"client_billable_amount": _decimal_to_float(client_billable_amount),
		"billable_costs_total": _decimal_to_float(billable_costs_total),
		"invoice_total": _decimal_to_float(invoice_total),
		"internal_supplier_quote_total": _decimal_to_float(selected_supplier_quote_total),
		"internal_supplier_po_amount": _decimal_to_float(internal_supplier_po_amount),
		"internal_supplier_cost_basis": _decimal_to_float(internal_supplier_cost_basis),
		"internal_associated_costs_total": _decimal_to_float(internal_associated_costs_total),
		"estimated_margin": _decimal_to_float(estimated_margin),
	}

	preview_basis = {
		"billable_cost_ids": billable_cost_ids,
		"customer_name": transaction.client.name if transaction.client else None,
		"currency": invoice_currency,
		"line_items": line_items,
		"notes": customer_notes,
		"selected_quote_id": parsed_quote_id,
		"totals": totals,
		"transaction_id": transaction.id,
	}
	preview_hash = hashlib.sha256(
		json.dumps(
			preview_basis,
			sort_keys=True,
			separators=(",", ":"),
			ensure_ascii=True,
		).encode("utf-8")
	).hexdigest()

	return {
		"transaction_id": transaction.id,
		"currency": invoice_currency,
		"preview_hash": preview_hash,
		"can_create": can_create,
		"already_invoiced": already_invoiced,
		"invoice_id": transaction.quickbooks_invoice_id,
		"invoice_number": transaction.quickbooks_invoice_number,
		"invoice_customer_name": transaction.client.name if transaction.client else None,
		"line_items": line_items,
		"billable_cost_ids": billable_cost_ids,
		"selected_supplier_quote": selected_supplier_quote,
		"totals": totals,
		"notes": preview_basis["notes"],
		"errors": errors,
		"warnings": warnings,
	}


@bp.get('/auth/connect')
@require_admin
def connect_quickbooks(current_user):
	"""
	Initiate QuickBooks OAuth flow.
	Redirects admin to QuickBooks authorization page.
	"""
	with db_session() as session:
		qb_service = QuickBooksService(session)
		state = _create_oauth_state(session, current_user['id'])
		auth_url = qb_service.get_authorization_url(state)
		return jsonify({"authorization_url": auth_url})


@bp.get('/callback')
def quickbooks_callback():
	"""
	OAuth callback endpoint.
	QuickBooks redirects here after user authorizes the app.
	"""
	code = request.args.get('code')
	realm_id = request.args.get('realmId')
	state = request.args.get('state')
	error = request.args.get('error')

	if not state:
		logger.warning("QuickBooks OAuth callback rejected without state")
		return _frontend_connection_redirect("error")

	with db_session() as session:
		try:
			_consume_oauth_state(session, state)
		except Exception:
			session.rollback()
			logger.warning("QuickBooks OAuth callback rejected with invalid state")
			return _frontend_connection_redirect("error")

		if error:
			logger.warning("QuickBooks OAuth authorization was not completed")
			return _frontend_connection_redirect("error")

		if not code or not realm_id:
			logger.warning("QuickBooks OAuth callback omitted required parameters")
			return _frontend_connection_redirect("error")

		try:
			qb_service = QuickBooksService(session)
			qb_service.exchange_code_for_tokens(code, realm_id)
		except Exception as exc:
			logger.error(
				"QuickBooks OAuth token exchange failed error_type=%s",
				type(exc).__name__,
			)
			return _frontend_connection_redirect("error")
		return _frontend_connection_redirect("success")


@bp.get('/status')
@require_admin
def quickbooks_status(current_user):
	"""
	Check QuickBooks connection status.
	Returns whether QB is connected and token expiration info.
	"""
	with db_session() as session:
		qb_service = QuickBooksService(session)
		return jsonify(qb_service.connection_status())


@bp.post('/disconnect')
@require_admin
def disconnect_quickbooks(current_user):
	"""
	Disconnect QuickBooks by removing stored tokens.
	"""
	with db_session() as session:
		qb_service = QuickBooksService(session)
		try:
			qb_service.disconnect()
		except Exception as exc:
			logger.error(
				"QuickBooks remote revocation failed error_type=%s",
				type(exc).__name__,
			)
			return jsonify({"error": "quickbooks_disconnect_failed"}), 502
		return jsonify({"message": "QuickBooks disconnected successfully"})


@bp.post('/transactions/<int:transaction_id>/create-invoice')
@require_admin
def create_invoice(current_user, transaction_id):
	"""
	Create an invoice in QuickBooks for a transaction.

	Expects JSON body with:
	{
		"selected_quote_id": int (optional),
		"billable_cost_ids": [int] (optional),
		"custom_notes": str (optional)
	}
	"""
	invoice_request = QuickBooksInvoiceCreateRequest.model_validate(
		request.get_json(silent=True) or {}
	)
	submitted_preview_hash = invoice_request.preview_hash or ""

	with db_session() as session:
		# Avoid constructing an upstream client for an unknown local transaction.
		transaction = session.get(Transaction, transaction_id)
		if not transaction:
			return jsonify({"error": "transaction_not_found"}), 404

		# Token refresh can commit a rotating refresh token, so it must happen
		# before the transaction row enters the invoice critical section.
		try:
			qb_service = QuickBooksService(session)
			qb_client = qb_service.get_client()
			if qb_client is None:
				raise QuickBooksNotConnectedError("QuickBooks is not connected")
		except Exception as exc:
			logger.error(
				"QuickBooks client initialization failed error_type=%s",
				type(exc).__name__,
				extra={"transaction_id": transaction_id},
			)
			return jsonify({"error": "quickbooks_not_available"}), 503

		transaction = session.execute(
			select(Transaction)
			.where(Transaction.id == transaction_id)
			.with_for_update()
			.execution_options(populate_existing=True)
		).scalar_one_or_none()
		if not transaction:
			return jsonify({"error": "transaction_not_found"}), 404

		invoice_plan = _build_invoice_plan(
			session=session,
			transaction=transaction,
			selected_quote_id=invoice_request.selected_quote_id,
			billable_cost_ids=invoice_request.billable_cost_ids,
			custom_notes=invoice_request.custom_notes,
		)

		if invoice_plan["already_invoiced"]:
			return jsonify({
				"error": "already_invoiced",
				"invoice_id": transaction.quickbooks_invoice_id,
				"invoice_number": transaction.quickbooks_invoice_number,
				"invoice_preview": invoice_plan,
			}), 400

		if not invoice_plan["can_create"]:
			return jsonify({
				"error": "invoice_validation_failed",
				"errors": invoice_plan["errors"],
				"warnings": invoice_plan["warnings"],
				"invoice_preview": invoice_plan,
			}), 400

		if not submitted_preview_hash:
			return jsonify({
				"error": "invoice_preview_required",
				"invoice_preview": invoice_plan,
			}), 400
		if not hmac.compare_digest(submitted_preview_hash, invoice_plan["preview_hash"]):
			return jsonify({
				"error": "invoice_preview_stale",
				"invoice_preview": invoice_plan,
			}), 409

		# Create invoice via QuickBooks service
		try:
			result = qb_service.create_invoice(
				transaction=transaction,
				line_items=invoice_plan["line_items"],
				notes=invoice_plan["notes"],
				attach_documents=False,
				qb_client=qb_client,
				created_by_employee_id=current_user['id'],
				currency=invoice_plan["currency"],
			)

			if result["created"]:
				try:
					session.add(ActivityLog(
						transaction_id=transaction_id,
						action="invoice-created",
						details=f"QB Invoice #{result['invoice_number']} created"
					))
					session.commit()
				except Exception as exc:
					session.rollback()
					logger.error(
						"QuickBooks invoice activity logging failed error_type=%s",
						type(exc).__name__,
						extra={"transaction_id": transaction_id},
					)

			invoice_plan["can_create"] = False
			invoice_plan["already_invoiced"] = True
			invoice_plan["invoice_id"] = result["invoice_id"]
			invoice_plan["invoice_number"] = result["invoice_number"]
			invoice_plan["warnings"] = [
				f"QuickBooks Invoice #{result['invoice_number']} has been created for this transaction.",
				*invoice_plan["warnings"],
			]

			return jsonify({
				"message": "Invoice created successfully",
				"invoice_id": result['invoice_id'],
				"invoice_number": result['invoice_number'],
				"total": result['total'],
				"invoice_preview": invoice_plan,
			}), 201 if result["created"] else 200

		except QuickBooksInvoiceAttemptConflict:
			session.rollback()
			logger.warning(
				"QuickBooks invoice retry conflicted with durable attempt",
				extra={"transaction_id": transaction_id},
			)
			return jsonify({"error": "invoice_attempt_conflict"}), 409
		except QuickBooksConfigurationError as exc:
			session.rollback()
			logger.error(
				"QuickBooks invoice configuration failed error_type=%s",
				type(exc).__name__,
				extra={"transaction_id": transaction_id},
			)
			return jsonify({"error": "invoice_configuration_error"}), 503
		except Exception as exc:
			session.rollback()
			attempt_status = session.query(QuickBooksInvoiceAttempt.status).filter(
				QuickBooksInvoiceAttempt.transaction_id == transaction_id
			).scalar()
			logger.error(
				"QuickBooks invoice creation failed error_type=%s attempt_status=%s",
				type(exc).__name__,
				attempt_status or "not_recorded",
				extra={"transaction_id": transaction_id},
			)
			if attempt_status == "unknown":
				return jsonify({"error": "invoice_outcome_unknown"}), 502
			if attempt_status == "failed":
				return jsonify({"error": "invoice_creation_failed"}), 502
			return jsonify({"error": "invoice_creation_failed"}), 500


@bp.post('/transactions/<int:transaction_id>/invoice-preview')
@require_admin
def preview_invoice(current_user, transaction_id):
	"""
	Preview the exact QuickBooks invoice payload before creating it.
	Supplier quotes and unselected associated costs are returned as internal context only.
	"""
	invoice_request = QuickBooksInvoicePreviewRequest.model_validate(
		request.get_json(silent=True) or {}
	)

	with db_session() as session:
		transaction = session.get(Transaction, transaction_id)
		if not transaction:
			return jsonify({"error": "transaction_not_found"}), 404

		return jsonify(_build_invoice_plan(
			session=session,
			transaction=transaction,
			selected_quote_id=invoice_request.selected_quote_id,
			billable_cost_ids=invoice_request.billable_cost_ids,
			custom_notes=invoice_request.custom_notes,
		))
