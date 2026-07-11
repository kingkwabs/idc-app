"""QuickBooks Online OAuth, credential lifecycle, and invoice operations."""

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Optional

from intuitlib.client import AuthClient
from intuitlib.enums import Scopes
from quickbooks import QuickBooks
from quickbooks.exceptions import ObjectNotFoundException, QuickbooksException
from quickbooks.objects.customer import Customer
from quickbooks.objects.detailline import SalesItemLine, SalesItemLineDetail
from quickbooks.objects.invoice import Invoice
from quickbooks.objects.item import Item
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import (
	Client,
	QuickBooksCustomerMapping,
	QuickBooksInvoiceAttempt,
	QuickBooksToken,
	Transaction,
)
from qb_token_crypto import QBTokenCrypto

_DEFAULT_ACCESS_TOKEN_SECONDS = 3600
_DEFAULT_REFRESH_TOKEN_SECONDS = 100 * 24 * 60 * 60
_TOKEN_REFRESH_LEEWAY = timedelta(minutes=2)


class QuickBooksServiceError(RuntimeError):
	"""Base error for safe, expected QuickBooks service failures."""


class QuickBooksConfigurationError(QuickBooksServiceError):
	"""Raised when required QuickBooks configuration is missing or invalid."""


class QuickBooksNotConnectedError(QuickBooksServiceError):
	"""Raised when an operation requires an active QuickBooks connection."""


class QuickBooksAttachmentsDisabledError(QuickBooksServiceError):
	"""Raised when a caller attempts an unsupported v1 attachment upload."""


class QuickBooksInvoiceAttemptConflict(QuickBooksServiceError):
	"""Raised when a retry does not match its durable approved operation."""


class QuickBooksCompanyConflictError(QuickBooksServiceError):
	"""Raised when a live connection would be replaced by another company."""


@dataclass(frozen=True)
class _TokenCredentials:
	realm_id: str
	access_token: str
	refresh_token: str


def _positive_seconds(value: Any, default: int) -> int:
	try:
		seconds = int(value)
	except (TypeError, ValueError):
		return default
	return seconds if seconds > 0 else default


def _escape_qbo_literal(value: str) -> str:
	"""Escape a string embedded in a quoted QuickBooks query literal."""
	return str(value).replace("\\", "\\\\").replace("'", "\\'")


def _invoice_request_id(transaction_id: int) -> str:
	"""Return a deterministic Intuit request id no longer than 50 characters."""
	readable = f"idc-invoice-v1-transaction-{transaction_id}"
	if len(readable) <= 50:
		return readable
	digest = hashlib.sha256(str(transaction_id).encode("ascii")).hexdigest()[:32]
	return f"idc-invoice-v1-{digest}"


def _realm_fingerprint(realm_id: str) -> str:
	return hashlib.sha256(realm_id.encode("utf-8")).hexdigest()


def _money_string(value: Any) -> str:
	try:
		return format(Decimal(str(value)).quantize(Decimal("0.01")), "f")
	except (InvalidOperation, TypeError, ValueError) as exc:
		raise QuickBooksServiceError("Invoice line amount must be numeric") from exc


def _utcnow() -> datetime:
	return datetime.now(timezone.utc).replace(tzinfo=None)


class QuickBooksService:
	"""Service for interacting with one configured QuickBooks Online company."""

	def __init__(self, session: Session):
		self.session = session
		self.environment = os.getenv("QB_ENVIRONMENT", "production").strip().lower()
		self.token_crypto = QBTokenCrypto(environment=self.environment)
		self.service_item_name = os.getenv("QB_SERVICE_ITEM_NAME", "").strip()
		self.auth_client = AuthClient(
			client_id=os.getenv("QB_CLIENT_ID"),
			client_secret=os.getenv("QB_CLIENT_SECRET"),
			redirect_uri=os.getenv(
				"QB_REDIRECT_URI",
				"https://idc-app.onrender.com/quickbooks/callback",
			),
			environment=self.environment,
		)

	def get_authorization_url(self, state: str) -> str:
		"""Generate an Accounting-scope OAuth authorization URL."""
		return self.auth_client.get_authorization_url([Scopes.ACCOUNTING], state)

	def exchange_code_for_tokens(self, auth_code: str, realm_id: str) -> Dict[str, str]:
		"""Exchange an OAuth code and atomically replace stored credentials."""
		self.auth_client.get_bearer_token(auth_code, realm_id=realm_id)
		access_token = self.auth_client.access_token
		refresh_token = self.auth_client.refresh_token
		if not all((realm_id, access_token, refresh_token)):
			raise QuickBooksServiceError(
				"QuickBooks OAuth response did not include all required credentials"
			)

		now = _utcnow()
		token = self._lock_first_token()
		if token is not None and token.refresh_expires_at > now:
			existing_credentials, _ = self._read_credentials(token, migrate=False)
			if existing_credentials.realm_id != realm_id:
				try:
					self.auth_client.revoke(token=refresh_token)
				except Exception as exc:
					raise QuickBooksCompanyConflictError(
						"A different QuickBooks company is already connected and the new grant could not be revoked"
					) from exc
				raise QuickBooksCompanyConflictError(
					"Disconnect the current QuickBooks company before connecting another company"
				)
		if token is None:
			token = QuickBooksToken(singleton_key=1)
			self.session.add(token)

		token.realm_id = self.token_crypto.encrypt(realm_id)
		token.access_token = self.token_crypto.encrypt(access_token)
		token.refresh_token = self.token_crypto.encrypt(refresh_token)
		token.token_expires_at = now + timedelta(
			seconds=_positive_seconds(
				self.auth_client.expires_in,
				_DEFAULT_ACCESS_TOKEN_SECONDS,
			)
		)
		token.refresh_expires_at = now + timedelta(
			seconds=_positive_seconds(
				self.auth_client.x_refresh_token_expires_in,
				_DEFAULT_REFRESH_TOKEN_SECONDS,
			)
		)
		token.updated_at = now
		self.session.commit()

		return {"expires_at": token.token_expires_at.isoformat()}

	def get_client(self) -> Optional[QuickBooks]:
		"""Return a client, refreshing and migrating credentials when necessary."""
		token = self.session.execute(
			select(QuickBooksToken)
			.where(QuickBooksToken.singleton_key == 1)
			.order_by(QuickBooksToken.id)
		).scalars().first()
		if token is None:
			return None

		credentials, needs_migration = self._read_credentials(token, migrate=False)
		needs_refresh = _utcnow() + _TOKEN_REFRESH_LEEWAY >= token.token_expires_at
		if needs_migration or needs_refresh:
			token, credentials = self._prepare_locked_credentials(token.id)

		return self._build_client(credentials)

	def _prepare_locked_credentials(
		self,
		token_id: int,
	) -> tuple[QuickBooksToken, _TokenCredentials]:
		"""Migrate or refresh credentials while serializing changes to the token row."""
		token = self.session.execute(
			select(QuickBooksToken)
			.where(QuickBooksToken.id == token_id)
			.with_for_update()
			.execution_options(populate_existing=True)
		).scalar_one_or_none()
		if token is None:
			raise QuickBooksNotConnectedError("QuickBooks connection was removed")

		credentials, migrated = self._read_credentials(token, migrate=True)
		refreshed = False
		if _utcnow() + _TOKEN_REFRESH_LEEWAY >= token.token_expires_at:
			credentials = self._refresh_locked_token(token, credentials)
			refreshed = True

		if migrated or refreshed:
			self.session.commit()
		return token, credentials

	def _refresh_locked_token(
		self,
		token: QuickBooksToken,
		credentials: _TokenCredentials,
	) -> _TokenCredentials:
		"""Refresh a locked token row and persist Intuit's latest rotating token."""
		self.auth_client.refresh(refresh_token=credentials.refresh_token)
		access_token = self.auth_client.access_token
		refresh_token = self.auth_client.refresh_token
		if not access_token or not refresh_token:
			raise QuickBooksServiceError(
				"QuickBooks refresh response did not include rotating credentials"
			)

		now = _utcnow()
		token.access_token = self.token_crypto.encrypt(access_token)
		token.refresh_token = self.token_crypto.encrypt(refresh_token)
		token.realm_id = self.token_crypto.encrypt(credentials.realm_id)
		token.token_expires_at = now + timedelta(
			seconds=_positive_seconds(
				self.auth_client.expires_in,
				_DEFAULT_ACCESS_TOKEN_SECONDS,
			)
		)
		token.refresh_expires_at = now + timedelta(
			seconds=_positive_seconds(
				self.auth_client.x_refresh_token_expires_in,
				_DEFAULT_REFRESH_TOKEN_SECONDS,
			)
		)
		token.updated_at = now

		return _TokenCredentials(
			realm_id=credentials.realm_id,
			access_token=access_token,
			refresh_token=refresh_token,
		)

	def _read_credentials(
		self,
		token: QuickBooksToken,
		migrate: bool,
	) -> tuple[_TokenCredentials, bool]:
		stored_values = {
			"realm_id": token.realm_id,
			"access_token": token.access_token,
			"refresh_token": token.refresh_token,
		}
		plaintext = {
			name: self.token_crypto.decrypt(value)
			for name, value in stored_values.items()
		}
		needs_migration = self.token_crypto.enabled and any(
			not self.token_crypto.is_encrypted(value)
			for value in stored_values.values()
		)

		# Decrypt every field before changing any ORM value so a bad field cannot
		# leave a partially migrated credential set in the session.
		if migrate and needs_migration:
			for name, value in stored_values.items():
				if not self.token_crypto.is_encrypted(value):
					setattr(token, name, self.token_crypto.encrypt(plaintext[name]))

		return (
			_TokenCredentials(
				realm_id=plaintext["realm_id"],
				access_token=plaintext["access_token"],
				refresh_token=plaintext["refresh_token"],
			),
			needs_migration,
		)

	def _build_client(self, credentials: _TokenCredentials) -> QuickBooks:
		self.auth_client.realm_id = credentials.realm_id
		self.auth_client.access_token = credentials.access_token
		self.auth_client.refresh_token = credentials.refresh_token
		client = QuickBooks(
			auth_client=self.auth_client,
			refresh_token=credentials.refresh_token,
			company_id=credentials.realm_id,
		)
		client.access_token = credentials.access_token
		return client

	def _lock_first_token(self) -> Optional[QuickBooksToken]:
		return self.session.execute(
			select(QuickBooksToken)
			.where(QuickBooksToken.singleton_key == 1)
			.order_by(QuickBooksToken.id)
			.with_for_update()
		).scalars().first()

	def connection_status(self) -> Dict[str, Any]:
		"""Return connection metadata that contains no realm or credential values."""
		token = self.session.execute(
			select(QuickBooksToken)
			.where(QuickBooksToken.singleton_key == 1)
			.order_by(QuickBooksToken.id)
		).scalars().first()
		if token is None:
			return {"connected": False}

		_, needs_migration = self._read_credentials(token, migrate=False)
		if needs_migration:
			token, _ = self._prepare_locked_credentials(token.id)

		if _utcnow() >= token.refresh_expires_at:
			return {"connected": False}
		return {
			"connected": True,
			"token_expires_at": token.token_expires_at.isoformat(),
			"refresh_expires_at": token.refresh_expires_at.isoformat(),
		}

	def is_connected(self) -> bool:
		return bool(self.connection_status()["connected"])

	def find_or_create_customer(
		self,
		client: Client,
		qb_client: Optional[QuickBooks] = None,
		realm_fingerprint: Optional[str] = None,
	) -> str:
		"""Resolve a customer, treating only an explicit 610 response as stale."""
		qb_client = qb_client or self.get_client()
		if qb_client is None:
			raise QuickBooksNotConnectedError("QuickBooks is not connected")
		realm_fingerprint = realm_fingerprint or self.realm_fingerprint(qb_client)

		# Different transactions for the same client can be invoiced concurrently.
		# Lock the client so the unique realm mapping is created or repaired once.
		client = self.session.execute(
			select(Client)
			.where(Client.id == client.id)
			.with_for_update()
			.execution_options(populate_existing=True)
		).scalar_one()
		mapping = self.session.execute(
			select(QuickBooksCustomerMapping)
			.where(
				QuickBooksCustomerMapping.client_id == client.id,
				QuickBooksCustomerMapping.realm_fingerprint == realm_fingerprint,
			)
			.with_for_update()
		).scalar_one_or_none()

		if mapping is not None:
			try:
				customer = Customer.get(mapping.customer_id, qb=qb_client)
				return customer.Id
			except ObjectNotFoundException:
				pass

		escaped_name = _escape_qbo_literal(client.name)
		# The QBO SDK has no parameter API; literals are escaped before interpolation.
		customers = Customer.query(
			f"SELECT * FROM Customer WHERE DisplayName = '{escaped_name}'",  # nosec B608
			qb=qb_client,
		)
		if customers:
			customer_id = customers[0].Id
			self._store_customer_mapping(
				mapping,
				client.id,
				realm_fingerprint,
				customer_id,
			)
			self.session.flush()
			return customer_id

		customer = Customer()
		customer.DisplayName = client.name
		customer.CompanyName = client.name
		saved_customer = customer.save(qb=qb_client)
		self._store_customer_mapping(
			mapping,
			client.id,
			realm_fingerprint,
			saved_customer.Id,
		)
		self.session.flush()
		return saved_customer.Id

	def _store_customer_mapping(
		self,
		mapping: Optional[QuickBooksCustomerMapping],
		client_id: int,
		realm_fingerprint: str,
		customer_id: str,
	) -> None:
		if mapping is None:
			mapping = QuickBooksCustomerMapping(
				client_id=client_id,
				realm_fingerprint=realm_fingerprint,
				customer_id=customer_id,
			)
			self.session.add(mapping)
		else:
			mapping.customer_id = customer_id

	def realm_fingerprint(self, qb_client: QuickBooks) -> str:
		realm_id = str(getattr(qb_client, "company_id", "") or "")
		if not realm_id:
			raise QuickBooksServiceError("QuickBooks client has no company context")
		return _realm_fingerprint(realm_id)

	def create_invoice(
		self,
		transaction: Transaction,
		line_items: list,
		notes: str = "",
		attach_documents: bool = False,
		qb_client: Optional[QuickBooks] = None,
		created_by_employee_id: Optional[int] = None,
		currency: Optional[str] = None,
	) -> Dict[str, Any]:
		"""Create or safely retry a durable, idempotent customer invoice attempt."""
		if attach_documents:
			raise QuickBooksAttachmentsDisabledError(
				"QuickBooks invoice attachments are disabled for v1"
			)

		qb_client = qb_client or self.get_client()
		if qb_client is None:
			raise QuickBooksNotConnectedError("QuickBooks is not connected")
		transaction = self._lock_transaction(transaction.id)

		request_id = _invoice_request_id(transaction.id)
		realm_fingerprint = self.realm_fingerprint(qb_client)
		service_item_ref = self._get_service_item(qb_client)
		attempt = self._lock_invoice_attempt(transaction.id)
		if attempt is not None:
			if attempt.realm_fingerprint != realm_fingerprint:
				raise QuickBooksInvoiceAttemptConflict(
					"Invoice attempt belongs to a different QuickBooks company"
				)
			if attempt.status == "succeeded":
				self._apply_succeeded_attempt(transaction, attempt)
				self.session.commit()
				return self._attempt_result(attempt, created=False)

		txn_date = self._attempt_txn_date(attempt)
		payload_json = self._invoice_payload_json(
			transaction=transaction,
			line_items=line_items,
			notes=notes,
			currency=currency,
			txn_date=txn_date,
		)
		payload_hash = hashlib.sha256(payload_json.encode("utf-8")).hexdigest()

		if attempt is not None:
			if attempt.request_id != request_id or attempt.payload_hash != payload_hash:
				raise QuickBooksInvoiceAttemptConflict(
					"Invoice retry does not match the original approved payload"
				)
		else:
			attempt = QuickBooksInvoiceAttempt(
				transaction_id=transaction.id,
				created_by_employee_id=created_by_employee_id,
				realm_fingerprint=realm_fingerprint,
				request_id=request_id,
				payload_hash=payload_hash,
				payload_json=payload_json,
				status="pending",
				attempt_count=0,
				currency=(currency or None),
			)
			self.session.add(attempt)
			transaction.quickbooks_invoice_status = "pending"
			transaction.quickbooks_realm_fingerprint = realm_fingerprint
			self.session.flush()

			# Persist the idempotency record before any invoice request. Reacquiring
			# the transaction lock below ensures only one contender calls Intuit.
			self.session.commit()
			transaction = self._lock_transaction(transaction.id)
			attempt = self._lock_invoice_attempt(transaction.id)
			if attempt is None:
				raise QuickBooksServiceError("Durable invoice attempt was not persisted")
			if attempt.status == "succeeded":
				self._apply_succeeded_attempt(transaction, attempt)
				self.session.commit()
				return self._attempt_result(attempt, created=False)

		attempt.status = "pending"
		attempt.attempt_count += 1
		attempt.last_error_code = None
		transaction.quickbooks_invoice_status = "pending"
		transaction.quickbooks_realm_fingerprint = realm_fingerprint
		invoice_requested = False

		try:
			customer_id = self.find_or_create_customer(
				transaction.client,
				qb_client=qb_client,
				realm_fingerprint=realm_fingerprint,
			)
			invoice = self._build_invoice(
				customer_id=customer_id,
				service_item_ref=service_item_ref,
				line_items=line_items,
				notes=notes,
				txn_date=txn_date,
			)
			invoice_requested = True
			saved_invoice = invoice.save(qb=qb_client, request_id=request_id)
		except Exception as exc:
			status = self._failure_status(exc, invoice_requested)
			attempt.status = status
			attempt.last_error_code = self._safe_error_code(exc)
			transaction.quickbooks_invoice_status = status
			transaction.quickbooks_realm_fingerprint = realm_fingerprint
			try:
				self.session.commit()
			except Exception:
				self.session.rollback()
			raise

		now = _utcnow()
		attempt.status = "succeeded"
		attempt.invoice_id = saved_invoice.Id
		attempt.invoice_number = saved_invoice.DocNumber
		attempt.total_amount = self._optional_decimal(saved_invoice.TotalAmt)
		attempt.last_error_code = None
		attempt.completed_at = now
		transaction.quickbooks_invoice_id = saved_invoice.Id
		transaction.quickbooks_invoice_number = saved_invoice.DocNumber
		transaction.quickbooks_invoice_status = "succeeded"
		transaction.quickbooks_realm_fingerprint = realm_fingerprint
		transaction.quickbooks_last_synced_at = now
		transaction.invoiced_at = now
		self.session.commit()

		return self._attempt_result(attempt, created=True)

	def _build_invoice(
		self,
		customer_id: str,
		service_item_ref: Dict[str, str],
		line_items: list,
		notes: str,
		txn_date: str,
	) -> Invoice:
		invoice = Invoice()
		invoice.CustomerRef = {"value": customer_id}
		for line_num, item in enumerate(line_items, start=1):
			quantity = item.get("quantity", 1)
			if quantity <= 0:
				raise QuickBooksServiceError("Invoice line quantity must be greater than zero")

			line = SalesItemLine()
			line.LineNum = line_num
			line.Description = item["description"]
			line.Amount = item["amount"]
			detail = SalesItemLineDetail()
			detail.Qty = quantity
			detail.UnitPrice = item["amount"] / quantity
			detail.ItemRef = service_item_ref
			line.SalesItemLineDetail = detail
			invoice.Line.append(line)

		if notes:
			invoice.CustomerMemo = {"value": notes}
		invoice.TxnDate = txn_date
		return invoice

	def _invoice_payload_json(
		self,
		transaction: Transaction,
		line_items: list,
		notes: str,
		currency: Optional[str],
		txn_date: str,
	) -> str:
		canonical_lines = []
		for item in line_items:
			quantity = item.get("quantity", 1)
			if quantity <= 0:
				raise QuickBooksServiceError("Invoice line quantity must be greater than zero")
			canonical_lines.append({
				"amount": _money_string(item["amount"]),
				"description": str(item["description"]),
				"quantity": str(quantity),
			})

		payload = {
			"client_id": transaction.client_id,
			"currency": currency or None,
			"line_items": canonical_lines,
			"notes": notes,
			"service_item_name": self.service_item_name,
			"transaction_id": transaction.id,
			"txn_date": txn_date,
			"version": 1,
		}
		return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)

	@staticmethod
	def _attempt_txn_date(attempt: Optional[QuickBooksInvoiceAttempt]) -> str:
		if attempt is not None:
			try:
				value = json.loads(attempt.payload_json).get("txn_date")
			except (TypeError, ValueError, json.JSONDecodeError) as exc:
				raise QuickBooksInvoiceAttemptConflict(
					"Stored invoice attempt payload is invalid"
				) from exc
			if value:
				return str(value)
		return _utcnow().strftime("%Y-%m-%d")

	def _lock_invoice_attempt(self, transaction_id: int) -> Optional[QuickBooksInvoiceAttempt]:
		return self.session.execute(
			select(QuickBooksInvoiceAttempt)
			.where(QuickBooksInvoiceAttempt.transaction_id == transaction_id)
			.with_for_update()
			.execution_options(populate_existing=True)
		).scalar_one_or_none()

	def _lock_transaction(self, transaction_id: int) -> Transaction:
		transaction = self.session.execute(
			select(Transaction)
			.where(Transaction.id == transaction_id)
			.with_for_update()
			.execution_options(populate_existing=True)
		).scalar_one_or_none()
		if transaction is None:
			raise QuickBooksServiceError("Transaction was removed during invoice creation")
		return transaction

	@staticmethod
	def _failure_status(exc: Exception, invoice_requested: bool) -> str:
		if not invoice_requested or isinstance(exc, QuickbooksException):
			return "failed"
		return "unknown"

	@staticmethod
	def _safe_error_code(exc: Exception) -> str:
		error_code = getattr(exc, "error_code", None)
		return str(error_code) if error_code else type(exc).__name__[:100]

	@staticmethod
	def _optional_decimal(value: Any) -> Optional[Decimal]:
		try:
			return Decimal(str(value)) if value is not None else None
		except (InvalidOperation, TypeError, ValueError):
			return None

	@staticmethod
	def _apply_succeeded_attempt(
		transaction: Transaction,
		attempt: QuickBooksInvoiceAttempt,
	) -> None:
		now = _utcnow()
		transaction.quickbooks_invoice_id = attempt.invoice_id
		transaction.quickbooks_invoice_number = attempt.invoice_number
		transaction.quickbooks_invoice_status = "succeeded"
		transaction.quickbooks_realm_fingerprint = attempt.realm_fingerprint
		transaction.quickbooks_last_synced_at = now
		transaction.invoiced_at = transaction.invoiced_at or attempt.completed_at or now

	@staticmethod
	def _attempt_result(
		attempt: QuickBooksInvoiceAttempt,
		created: bool,
	) -> Dict[str, Any]:
		return {
			"invoice_id": attempt.invoice_id,
			"invoice_number": attempt.invoice_number,
			"total": _money_string(attempt.total_amount) if attempt.total_amount is not None else "",
			"created": created,
		}

	def _get_service_item(self, qb_client: QuickBooks) -> Dict[str, str]:
		"""Resolve the configured existing service item without creating QBO data."""
		if not self.service_item_name:
			raise QuickBooksConfigurationError(
				"QB_SERVICE_ITEM_NAME must name an existing QuickBooks service item"
			)
		if len(self.service_item_name) > 100:
			raise QuickBooksConfigurationError(
				"QB_SERVICE_ITEM_NAME must be 100 characters or fewer"
			)

		escaped_name = _escape_qbo_literal(self.service_item_name)
		# The QBO SDK has no parameter API; literals are escaped before interpolation.
		items = Item.query(
			f"SELECT * FROM Item WHERE Name = '{escaped_name}' AND Type = 'Service'",  # nosec B608
			qb=qb_client,
		)
		if not items:
			raise QuickBooksConfigurationError(
				"QB_SERVICE_ITEM_NAME was not found as a QuickBooks service item"
			)
		return {"value": items[0].Id, "name": self.service_item_name}

	def disconnect(self) -> bool:
		"""Revoke the remote grant before deleting the local credential row."""
		token = self._lock_first_token()
		if token is None:
			return False

		credentials, _ = self._read_credentials(token, migrate=False)
		self.auth_client.revoke(token=credentials.refresh_token)
		self.session.delete(token)
		self.session.commit()
		return True
