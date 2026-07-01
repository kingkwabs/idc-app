"""
QuickBooks OAuth and Invoice Management Routes
"""
import logging
from flask import Blueprint, request, jsonify, redirect
from datetime import datetime
from decimal import Decimal

from auth_util import create_access_token, require_admin, verify_token
from database import db_session
from models import Transaction, SupplierQuote, AssociatedCost, Supplier, ActivityLog
from quickbooks_service import QuickBooksService

bp = Blueprint('quickbooks', __name__, url_prefix='/quickbooks')
logger = logging.getLogger(__name__)
QB_OAUTH_STATE_PURPOSE = "quickbooks_oauth"
QB_OAUTH_STATE_TTL_SECONDS = 10 * 60


def _to_decimal(value) -> Decimal:
	if value is None:
		return Decimal("0")
	return Decimal(str(value))


def _decimal_to_float(value: Decimal) -> float:
	return float(value.quantize(Decimal("0.01")))


def _parse_optional_int(value, field_name: str, errors: list[str]):
	if value in (None, ""):
		return None
	try:
		return int(value)
	except (TypeError, ValueError):
		errors.append(f"{field_name} must be a valid integer")
		return None


def _parse_billable_cost_ids(value, errors: list[str]) -> list[int]:
	if value in (None, ""):
		return []
	if not isinstance(value, list):
		errors.append("billable_cost_ids must be an array of associated cost ids")
		return []

	ids = []
	for raw_id in value:
		try:
			ids.append(int(raw_id))
		except (TypeError, ValueError):
			errors.append("billable_cost_ids must only contain valid integers")
			return []

	return sorted(set(ids))


def _create_oauth_state(user_id: str) -> str:
	return create_access_token(
		sub=str(user_id),
		ttl_seconds=QB_OAUTH_STATE_TTL_SECONDS,
		extra_claims={"purpose": QB_OAUTH_STATE_PURPOSE},
	)


def _verify_oauth_state(state: str) -> dict:
	payload = verify_token(state)
	if payload.get("purpose") != QB_OAUTH_STATE_PURPOSE:
		raise ValueError("invalid_state_purpose")
	return payload


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
	selected_quote_id=None,
	billable_cost_ids=None,
	custom_notes: str = "",
	extra_errors=None,
) -> dict:
	"""
	Build the exact customer-facing invoice payload and internal margin context.
	Supplier quotes and normal associated costs stay internal unless explicitly selected.
	"""
	errors = list(extra_errors or [])
	warnings = []
	line_items = []
	billable_cost_ids = billable_cost_ids or []
	billable_cost_id_set = set(billable_cost_ids)

	client_billable_amount = _to_decimal(transaction.client_po_amount)
	client_billable_source = "client_po_amount"
	if client_billable_amount <= 0 and transaction.client_quote_amount is not None:
		client_billable_amount = _to_decimal(transaction.client_quote_amount)
		client_billable_source = "client_quote_amount"

	if client_billable_amount <= 0:
		errors.append("Add a client PO amount before creating a QuickBooks invoice.")
	else:
		line_items.append({
			"description": transaction.item_description or "Services Rendered",
			"amount": _decimal_to_float(client_billable_amount),
			"quantity": 1,
			"source": "client_billable_amount",
			"reference": client_billable_source,
			"billable": True,
		})

	selected_supplier_quote = None
	selected_supplier_quote_total = Decimal("0")
	parsed_quote_id = _parse_optional_int(selected_quote_id, "selected_quote_id", errors)
	if parsed_quote_id is not None:
		quote = session.get(SupplierQuote, parsed_quote_id)
		if quote is None or quote.transaction_id != transaction.id:
			errors.append("Selected supplier quote was not found for this transaction.")
		else:
			supplier = session.get(Supplier, quote.supplier_id)
			selected_supplier_quote_total = _to_decimal(quote.amount)
			selected_supplier_quote = {
				"id": quote.id,
				"supplier_id": quote.supplier_id,
				"supplier_name": supplier.name if supplier else None,
				"amount": _decimal_to_float(selected_supplier_quote_total),
				"currency": quote.currency or "USD",
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
		billable_costs_total += cost_amount
		line_items.append({
			"description": cost.description,
			"amount": _decimal_to_float(cost_amount),
			"quantity": 1,
			"source": "associated_cost",
			"cost_id": cost.id,
			"billable": True,
		})

	internal_associated_costs_total = sum((_to_decimal(cost.amount) for cost in associated_costs), Decimal("0"))
	internal_supplier_po_amount = _to_decimal(transaction.supplier_po_amount)
	internal_supplier_cost_basis = selected_supplier_quote_total if selected_supplier_quote else internal_supplier_po_amount
	invoice_total = sum((_to_decimal(item["amount"]) for item in line_items), Decimal("0"))
	estimated_margin = invoice_total - internal_supplier_cost_basis - internal_associated_costs_total
	already_invoiced = bool(transaction.quickbooks_invoice_id)

	if associated_costs and not billable_cost_ids:
		warnings.append("Associated costs are internal by default. Select only the costs that should be billed to the client.")
	if selected_supplier_quote:
		warnings.append("Selected supplier quote is used for internal margin context only and will not appear on the customer invoice.")
	if transaction.supplier_po_number:
		warnings.append("Supplier PO details are kept off the customer-facing QuickBooks memo.")
	if already_invoiced:
		warnings.append(f"This transaction already has QuickBooks Invoice #{transaction.quickbooks_invoice_number}.")

	can_create = not already_invoiced and not errors and len(line_items) > 0

	return {
		"transaction_id": transaction.id,
		"can_create": can_create,
		"already_invoiced": already_invoiced,
		"invoice_id": transaction.quickbooks_invoice_id,
		"invoice_number": transaction.quickbooks_invoice_number,
		"invoice_customer_name": transaction.client.name if transaction.client else None,
		"line_items": line_items,
		"billable_cost_ids": billable_cost_ids,
		"selected_supplier_quote": selected_supplier_quote,
		"totals": {
			"client_billable_amount": _decimal_to_float(client_billable_amount),
			"billable_costs_total": _decimal_to_float(billable_costs_total),
			"invoice_total": _decimal_to_float(invoice_total),
			"internal_supplier_quote_total": _decimal_to_float(selected_supplier_quote_total),
			"internal_supplier_po_amount": _decimal_to_float(internal_supplier_po_amount),
			"internal_supplier_cost_basis": _decimal_to_float(internal_supplier_cost_basis),
			"internal_associated_costs_total": _decimal_to_float(internal_associated_costs_total),
			"estimated_margin": _decimal_to_float(estimated_margin),
		},
		"notes": _build_customer_notes(transaction, custom_notes),
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
		state = _create_oauth_state(current_user['id'])
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
		return jsonify({"error": "missing_state"}), 400

	try:
		_verify_oauth_state(state)
	except Exception:
		return jsonify({"error": "invalid_state"}), 400

	if error:
		return jsonify({"error": error, "description": request.args.get('error_description')}), 400

	if not code or not realm_id:
		return jsonify({"error": "missing_parameters"}), 400

	with db_session() as session:
		qb_service = QuickBooksService(session)
		try:
			result = qb_service.exchange_code_for_tokens(code, realm_id)
			# Show success page
			return """
			<html>
				<head><title>QuickBooks Connected</title></head>
				<body style="font-family: sans-serif; text-align: center; padding: 50px;">
					<h1 style="color: #2ca01c;">✓ QuickBooks Connected Successfully!</h1>
					<p>Your QuickBooks account has been linked to IDC Energy Database.</p>
					<p>You can close this window and return to your application.</p>
				</body>
			</html>
			"""
		except Exception as e:
			logger.exception("QuickBooks OAuth token exchange failed", extra={"realm_id": realm_id})
			return f"""
			<html>
				<head><title>QuickBooks Connection Failed</title></head>
				<body style="font-family: sans-serif; text-align: center; padding: 50px;">
					<h1 style="color: #c01c1c;">✗ Connection Failed</h1>
					<p>Error: {str(e)}</p>
					<p>Please try again or contact support.</p>
				</body>
			</html>
			""", 500


@bp.get('/status')
@require_admin
def quickbooks_status(current_user):
	"""
	Check QuickBooks connection status.
	Returns whether QB is connected and token expiration info.
	"""
	with db_session() as session:
		qb_service = QuickBooksService(session)
		is_connected = qb_service.is_connected()

		if not is_connected:
			return jsonify({"connected": False})

		# Get token info
		from models import QuickBooksToken
		token = session.query(QuickBooksToken).first()

		return jsonify({
			"connected": True,
			"realm_id": token.realm_id,
			"token_expires_at": token.token_expires_at.isoformat(),
			"refresh_expires_at": token.refresh_expires_at.isoformat(),
		})


@bp.post('/disconnect')
@require_admin
def disconnect_quickbooks(current_user):
	"""
	Disconnect QuickBooks by removing stored tokens.
	"""
	with db_session() as session:
		qb_service = QuickBooksService(session)
		qb_service.disconnect()
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
	data = request.get_json() or {}
	parse_errors = []
	selected_quote_id = data.get("selected_quote_id")
	billable_cost_ids = _parse_billable_cost_ids(data.get("billable_cost_ids"), parse_errors)
	custom_notes = data.get("custom_notes", "")

	with db_session() as session:
		transaction = session.get(Transaction, transaction_id)
		if not transaction:
			return jsonify({"error": "transaction_not_found"}), 404

		invoice_plan = _build_invoice_plan(
			session=session,
			transaction=transaction,
			selected_quote_id=selected_quote_id,
			billable_cost_ids=billable_cost_ids,
			custom_notes=custom_notes,
			extra_errors=parse_errors,
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

		# Create invoice via QuickBooks service
		try:
			qb_service = QuickBooksService(session)
			result = qb_service.create_invoice(
				transaction=transaction,
				line_items=invoice_plan["line_items"],
				notes=invoice_plan["notes"],
				attach_documents=True
			)

			# Log activity
			session.add(ActivityLog(
				transaction_id=transaction_id,
				action="invoice-created",
				details=f"QB Invoice #{result['invoice_number']} created"
			))
			session.commit()

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
			}), 201

		except Exception as e:
			logger.exception("QuickBooks invoice creation failed", extra={"transaction_id": transaction_id})
			return jsonify({"error": "invoice_creation_failed", "details": str(e)}), 500


@bp.post('/transactions/<int:transaction_id>/invoice-preview')
@require_admin
def preview_invoice(current_user, transaction_id):
	"""
	Preview the exact QuickBooks invoice payload before creating it.
	Supplier quotes and unselected associated costs are returned as internal context only.
	"""
	data = request.get_json() or {}
	parse_errors = []
	selected_quote_id = data.get("selected_quote_id")
	billable_cost_ids = _parse_billable_cost_ids(data.get("billable_cost_ids"), parse_errors)
	custom_notes = data.get("custom_notes", "")

	with db_session() as session:
		transaction = session.get(Transaction, transaction_id)
		if not transaction:
			return jsonify({"error": "transaction_not_found"}), 404

		return jsonify(_build_invoice_plan(
			session=session,
			transaction=transaction,
			selected_quote_id=selected_quote_id,
			billable_cost_ids=billable_cost_ids,
			custom_notes=custom_notes,
			extra_errors=parse_errors,
		))
