"""
QuickBooks OAuth and Invoice Management Routes
"""
from flask import Blueprint, request, jsonify, redirect
from datetime import datetime
from decimal import Decimal
from sqlalchemy import select

from auth_util import require_admin
from database import db_session
from models import Transaction, SupplierQuote, AssociatedCost, Supplier, ActivityLog
from quickbooks_service import QuickBooksService

bp = Blueprint('quickbooks', __name__, url_prefix='/quickbooks')


@bp.get('/auth/connect')
@require_admin
async def connect_quickbooks(current_user):
	"""
	Initiate QuickBooks OAuth flow.
	Redirects admin to QuickBooks authorization page.
	"""
	async with db_session() as session:
		qb_service = QuickBooksService(session)
		# Generate a state token for CSRF protection
		state = f"user_{current_user['id']}"
		auth_url = qb_service.get_authorization_url(state)
		return jsonify({"authorization_url": auth_url})


@bp.get('/callback')
async def quickbooks_callback():
	"""
	OAuth callback endpoint.
	QuickBooks redirects here after user authorizes the app.
	"""
	code = request.args.get('code')
	realm_id = request.args.get('realmId')
	state = request.args.get('state')
	error = request.args.get('error')

	if error:
		return jsonify({"error": error, "description": request.args.get('error_description')}), 400

	if not code or not realm_id:
		return jsonify({"error": "missing_parameters"}), 400

	async with db_session() as session:
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
async def quickbooks_status(current_user):
	"""
	Check QuickBooks connection status.
	Returns whether QB is connected and token expiration info.
	"""
	async with db_session() as session:
		qb_service = QuickBooksService(session)
		is_connected = qb_service.is_connected()

		if not is_connected:
			return jsonify({"connected": False})

		# Get token info
		from models import QuickBooksToken
		result = await session.execute(select(QuickBooksToken))
		token = result.scalars().first()

		return jsonify({
			"connected": True,
			"realm_id": token.realm_id,
			"token_expires_at": token.token_expires_at.isoformat(),
			"refresh_expires_at": token.refresh_expires_at.isoformat(),
		})


@bp.post('/disconnect')
@require_admin
async def disconnect_quickbooks(current_user):
	"""
	Disconnect QuickBooks by removing stored tokens.
	"""
	async with db_session() as session:
		qb_service = QuickBooksService(session)
		qb_service.disconnect()
		return jsonify({"message": "QuickBooks disconnected successfully"})


@bp.post('/transactions/<int:transaction_id>/create-invoice')
@require_admin
async def create_invoice(current_user, transaction_id):
	"""
	Create an invoice in QuickBooks for a transaction.

	Expects JSON body with:
	{
		"selected_quote_id": int (optional),
		"include_associated_costs": bool (default true),
		"custom_notes": str (optional)
	}
	"""
	data = request.get_json() or {}
	selected_quote_id = data.get('selected_quote_id')
	include_costs = data.get('include_associated_costs', True)
	custom_notes = data.get('custom_notes', '')

	async with db_session() as session:
		# Get transaction with all relationships
		result = await session.execute(select(Transaction).filter(Transaction.id == transaction_id))
		transaction = result.scalars().first()
		if not transaction:
			return jsonify({"error": "transaction_not_found"}), 404

		# Check if already invoiced
		if transaction.quickbooks_invoice_id:
			return jsonify({
				"error": "already_invoiced",
				"invoice_id": transaction.quickbooks_invoice_id,
				"invoice_number": transaction.quickbooks_invoice_number
			}), 400

		# Build line items for invoice
		line_items = []

		# Add selected supplier quote or use supplier PO amount
		if selected_quote_id:
			result = await session.execute(select(SupplierQuote).filter(SupplierQuote.id == selected_quote_id))
			quote = result.scalars().first()
			if quote:
				result = await session.execute(select(Supplier).filter(Supplier.id == quote.supplier_id))
				supplier = result.scalars().first()
				line_items.append({
					"description": f"Supplier: {supplier.name if supplier else 'Unknown'} - {transaction.item_description or 'Services'}",
					"amount": float(quote.amount),
					"quantity": 1
				})

		# Add client PO amount as main line item if no quote selected
		if not line_items and transaction.client_po_amount:
			line_items.append({
				"description": transaction.item_description or "Services Rendered",
				"amount": float(transaction.client_po_amount),
				"quantity": 1
			})

		# Add associated costs as separate line items
		if include_costs:
			result = await session.execute(select(AssociatedCost).filter(
				AssociatedCost.transaction_id == transaction_id
			))
			costs = result.scalars().all()

			for cost in costs:
				line_items.append({
					"description": cost.description,
					"amount": float(cost.amount),
					"quantity": 1
				})

		# Build invoice notes
		notes_parts = []
		if transaction.rfq_number:
			notes_parts.append(f"RFQ: {transaction.rfq_number}")
		if transaction.client_po_number:
			notes_parts.append(f"Client PO: {transaction.client_po_number}")
		if transaction.supplier_po_number:
			notes_parts.append(f"Supplier PO: {transaction.supplier_po_number}")
		if custom_notes:
			notes_parts.append(custom_notes)

		notes = " | ".join(notes_parts)

		# Create invoice via QuickBooks service
		try:
			qb_service = QuickBooksService(session)
			result = qb_service.create_invoice(
				transaction=transaction,
				line_items=line_items,
				notes=notes,
				attach_documents=True  # Attach PDFs
			)

			# Log activity
			session.add(ActivityLog(
				transaction_id=transaction_id,
				action="invoice-created",
				details=f"QB Invoice #{result['invoice_number']} created"
			))
			await session.commit()

			return jsonify({
				"message": "Invoice created successfully",
				"invoice_id": result['invoice_id'],
				"invoice_number": result['invoice_number'],
				"total": result['total']
			}), 201

		except Exception as e:
			return jsonify({"error": "invoice_creation_failed", "details": str(e)}), 500
