"""
QuickBooks Online API Service Layer
Handles OAuth, token management, and invoice creation.
"""
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from intuitoauth.client import AuthClient
from intuitoauth.scopes import Scopes
from quickbooks import QuickBooks
from quickbooks.objects.customer import Customer
from quickbooks.objects.invoice import Invoice, InvoiceLine, SalesItemLine, SalesItemLineDetail
from quickbooks.objects.item import Item
from quickbooks.objects.attachable import Attachable, AttachableRef
from sqlalchemy.orm import Session
from models import QuickBooksToken, Client, Transaction
import base64

# QuickBooks OAuth Configuration
QB_CLIENT_ID = os.getenv("QB_CLIENT_ID")
QB_CLIENT_SECRET = os.getenv("QB_CLIENT_SECRET")
QB_REDIRECT_URI = os.getenv("QB_REDIRECT_URI", "https://idc-app.onrender.com/quickbooks/callback")
QB_ENVIRONMENT = os.getenv("QB_ENVIRONMENT", "production")  # or "sandbox"


class QuickBooksService:
	"""Service for interacting with QuickBooks Online API"""

	def __init__(self, session: Session):
		self.session = session
		self.auth_client = AuthClient(
			client_id=QB_CLIENT_ID,
			client_secret=QB_CLIENT_SECRET,
			redirect_uri=QB_REDIRECT_URI,
			environment=QB_ENVIRONMENT,
		)

	def get_authorization_url(self, state: str = "random_state") -> str:
		"""
		Generate OAuth2 authorization URL for user to connect QuickBooks.
		User will be redirected to this URL to authorize the app.
		"""
		scopes = [Scopes.ACCOUNTING]
		return self.auth_client.get_authorization_url(scopes, state)

	def exchange_code_for_tokens(self, auth_code: str, realm_id: str) -> Dict[str, Any]:
		"""
		Exchange authorization code for access and refresh tokens.
		Called after user authorizes the app and is redirected back.
		"""
		self.auth_client.get_bearer_token(auth_code, realm_id=realm_id)

		# Store tokens in database
		token = self.session.query(QuickBooksToken).first()
		if not token:
			token = QuickBooksToken()

		token.realm_id = realm_id
		token.access_token = self.auth_client.access_token
		token.refresh_token = self.auth_client.refresh_token
		token.token_expires_at = datetime.utcnow() + timedelta(seconds=3600)  # 1 hour
		token.refresh_expires_at = datetime.utcnow() + timedelta(days=100)  # 100 days
		token.updated_at = datetime.utcnow()

		self.session.add(token)
		self.session.commit()

		return {
			"realm_id": realm_id,
			"expires_at": token.token_expires_at.isoformat(),
		}

	def get_client(self) -> Optional[QuickBooks]:
		"""
		Get authenticated QuickBooks client.
		Automatically refreshes token if expired.
		"""
		token = self.session.query(QuickBooksToken).first()
		if not token:
			return None

		# Check if token is expired and refresh if needed
		if datetime.utcnow() >= token.token_expires_at:
			self._refresh_token(token)

		client = QuickBooks(
			auth_client=self.auth_client,
			refresh_token=token.refresh_token,
			company_id=token.realm_id,
		)
		client.access_token = token.access_token
		return client

	def _refresh_token(self, token: QuickBooksToken):
		"""Refresh expired access token"""
		self.auth_client.refresh(refresh_token=token.refresh_token)

		token.access_token = self.auth_client.access_token
		token.refresh_token = self.auth_client.refresh_token
		token.token_expires_at = datetime.utcnow() + timedelta(seconds=3600)
		token.updated_at = datetime.utcnow()

		self.session.commit()

	def is_connected(self) -> bool:
		"""Check if QuickBooks is connected and tokens are valid"""
		token = self.session.query(QuickBooksToken).first()
		if not token:
			return False

		# Check if refresh token is still valid
		return datetime.utcnow() < token.refresh_expires_at

	def find_or_create_customer(self, client: Client) -> str:
		"""
		Find existing QB customer by name or create a new one.
		Returns QuickBooks Customer ID.
		"""
		qb_client = self.get_client()
		if not qb_client:
			raise Exception("QuickBooks not connected")

		# Check if we already have a QB customer ID stored
		if client.quickbooks_customer_id:
			try:
				customer = Customer.get(client.quickbooks_customer_id, qb=qb_client)
				return customer.Id
			except Exception:
				# Customer not found, will create new one
				pass

		# Search for existing customer by name
		customers = Customer.query(f"SELECT * FROM Customer WHERE DisplayName = '{client.name}'", qb=qb_client)
		if customers:
			customer_id = customers[0].Id
			# Store the QB customer ID for future use
			client.quickbooks_customer_id = customer_id
			self.session.commit()
			return customer_id

		# Create new customer
		customer = Customer()
		customer.DisplayName = client.name
		customer.CompanyName = client.name
		customer.save(qb=qb_client)

		# Store the QB customer ID
		client.quickbooks_customer_id = customer.Id
		self.session.commit()

		return customer.Id

	def create_invoice(
		self,
		transaction: Transaction,
		line_items: list,
		notes: str = "",
		attach_documents: bool = False
	) -> Dict[str, Any]:
		"""
		Create an invoice in QuickBooks for a transaction.

		Args:
			transaction: Transaction object with all financial details
			line_items: List of dicts with {'description': str, 'amount': float, 'quantity': int}
			notes: Additional notes to include in invoice
			attach_documents: Whether to attach PDFs to the invoice

		Returns:
			Dict with invoice_id and invoice_number
		"""
		qb_client = self.get_client()
		if not qb_client:
			raise Exception("QuickBooks not connected")

		# Find or create customer
		customer_id = self.find_or_create_customer(transaction.client)

		# Create invoice
		invoice = Invoice()
		invoice.CustomerRef = {"value": customer_id}

		# Add line items
		line_num = 1
		for item in line_items:
			line = SalesItemLine()
			line.LineNum = line_num
			line.Description = item['description']
			line.Amount = item['amount']

			# Create/use a service item for the line
			detail = SalesItemLineDetail()
			detail.Qty = item.get('quantity', 1)
			detail.UnitPrice = item['amount'] / item.get('quantity', 1)

			# Use a generic "Services" item or create one
			# For simplicity, we'll set ItemRef to a service item
			# You may need to create a default service item in QB first
			detail.ItemRef = self._get_or_create_service_item(qb_client, "Services")

			line.SalesItemLineDetail = detail
			invoice.Line.append(line)
			line_num += 1

		# Add customer memo / notes
		if notes:
			invoice.CustomerMemo = {"value": notes}

		# Set invoice date
		invoice.TxnDate = datetime.now().strftime("%Y-%m-%d")

		# Save invoice
		invoice.save(qb=qb_client)

		# Attach documents if requested (PDFs from transaction)
		if attach_documents:
			self._attach_documents(qb_client, invoice, transaction)

		# Update transaction with QB invoice info
		transaction.quickbooks_invoice_id = invoice.Id
		transaction.quickbooks_invoice_number = invoice.DocNumber
		transaction.invoiced_at = datetime.utcnow()
		self.session.commit()

		return {
			"invoice_id": invoice.Id,
			"invoice_number": invoice.DocNumber,
			"total": str(invoice.TotalAmt),
		}

	def _get_or_create_service_item(self, qb_client: QuickBooks, item_name: str) -> Dict[str, str]:
		"""Get or create a service item for invoice line items"""
		# Try to find existing item
		items = Item.query(f"SELECT * FROM Item WHERE Name = '{item_name}' AND Type = 'Service'", qb=qb_client)
		if items:
			return {"value": items[0].Id, "name": item_name}

		# Create new service item
		item = Item()
		item.Name = item_name
		item.Type = "Service"
		item.IncomeAccountRef = {"value": "1"}  # Sales income account (default)
		item.save(qb=qb_client)

		return {"value": item.Id, "name": item_name}

	def _attach_documents(self, qb_client: QuickBooks, invoice: Invoice, transaction: Transaction):
		"""Attach PDFs from transaction to QB invoice"""
		# Get client PO and supplier PO documents
		po_docs = [doc for doc in transaction.documents if doc.category in ['client-po', 'supplier-po']]

		for doc in po_docs:
			if doc.content:
				try:
					attachable = Attachable()
					attachable.FileName = doc.name
					attachable.ContentType = doc.mime_type or "application/pdf"

					# Attach to invoice
					ref = AttachableRef()
					ref.EntityRef = {"value": invoice.Id, "type": "Invoice"}
					attachable.AttachableRef = [ref]

					# Encode file content as base64
					attachable.FileAccessUri = None
					attachable._FilePath = None
					attachable.FileName = doc.name

					# Note: Attachable upload requires special handling
					# You may need to use QB's upload endpoint separately
					# This is a simplified version
					attachable.save(qb=qb_client)
				except Exception as e:
					# Log error but don't fail invoice creation
					print(f"Failed to attach document {doc.name}: {e}")

	def disconnect(self):
		"""Disconnect QuickBooks by removing tokens"""
		token = self.session.query(QuickBooksToken).first()
		if token:
			self.session.delete(token)
			self.session.commit()
