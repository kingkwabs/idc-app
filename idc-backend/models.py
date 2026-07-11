from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy import Boolean, CheckConstraint, Column, Integer, String, ForeignKey, Date, Numeric, Text, DateTime, LargeBinary, Index, UniqueConstraint
from datetime import datetime, timezone

Base = declarative_base()


def utc_now() -> datetime:
	return datetime.now(timezone.utc).replace(tzinfo=None)


class Employee(Base):
	"""Employee identity and account lifecycle state."""
	__tablename__ = "employees"

	id = Column(Integer, primary_key=True)
	name = Column(String, nullable=False)
	email = Column(String, unique=True, nullable=False)
	password_hash = Column(String, nullable=False)
	role = Column(String, nullable=False)
	created_at = Column(DateTime, default=utc_now)
	updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
	password_changed_at = Column(DateTime, nullable=True)
	last_login_at = Column(DateTime, nullable=True)
	locked_until = Column(DateTime, nullable=True)
	failed_login_attempts = Column(Integer, nullable=False, default=0)
	is_active = Column(Boolean, nullable=False, default=True)
	must_change_password = Column(Boolean, nullable=False, default=False)
	# Placeholders for future QuickBooks/payroll/invoice fields
	quickbooks_employee_id = Column(String, nullable=True)
	payroll_info = Column(String, nullable=True)
	invoice_mapping = Column(String, nullable=True)

	sessions = relationship("AuthSession", back_populates="employee", cascade="all, delete-orphan")


class AuthSession(Base):
	"""Revocable opaque login session; raw credentials are never persisted."""
	__tablename__ = "auth_sessions"
	__table_args__ = (
		Index("ix_auth_sessions_token_hash", "token_hash", unique=True),
		Index("ix_auth_sessions_employee_id", "employee_id"),
		Index("ix_auth_sessions_expires_at", "expires_at"),
	)

	id = Column(Integer, primary_key=True)
	employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
	token_hash = Column(String(64), nullable=False)
	csrf_token_hash = Column(String(64), nullable=False)
	expires_at = Column(DateTime, nullable=False)
	created_at = Column(DateTime, default=utc_now, nullable=False)
	last_seen_at = Column(DateTime, default=utc_now, nullable=False)
	revoked_at = Column(DateTime, nullable=True)

	employee = relationship("Employee", back_populates="sessions")


class AccountAuditLog(Base):
	"""Security-focused audit trail for account administration."""
	__tablename__ = "account_audit_logs"
	__table_args__ = (
		Index("ix_account_audit_logs_actor_id", "actor_employee_id"),
		Index("ix_account_audit_logs_target_id", "target_employee_id"),
		Index("ix_account_audit_logs_created_at", "created_at"),
	)

	id = Column(Integer, primary_key=True)
	actor_employee_id = Column(Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
	target_employee_id = Column(Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
	action = Column(String, nullable=False)
	details = Column(Text, nullable=True)
	created_at = Column(DateTime, default=utc_now, nullable=False)


class Client(Base):
	__tablename__ = "clients"

	id = Column(Integer, primary_key=True)
	name = Column(String, unique=True, nullable=False)
	contact_name = Column(String, nullable=True)
	email = Column(String, nullable=True)
	phone = Column(String, nullable=True)
	address = Column(Text, nullable=True)
	notes = Column(Text, nullable=True)
	# QuickBooks integration
	quickbooks_customer_id = Column(String, nullable=True)  # QB Customer ID

	transactions = relationship("Transaction", back_populates="client")


class Supplier(Base):
	__tablename__ = "suppliers"

	id = Column(Integer, primary_key=True)
	name = Column(String, unique=True, nullable=False)
	contact_name = Column(String, nullable=True)
	email = Column(String, nullable=True)
	phone = Column(String, nullable=True)
	website = Column(String, nullable=True)
	address = Column(Text, nullable=True)
	category = Column(String, nullable=True)
	notes = Column(Text, nullable=True)


class Transaction(Base):
	__tablename__ = "transactions"
	__table_args__ = (
		Index("ix_transactions_client_id", "client_id"),
	)

	id = Column(Integer, primary_key=True)
	client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
	rfq_number = Column(String, nullable=True)
	client_po_number = Column(String, nullable=True)
	supplier_po_number = Column(String, nullable=True)
	date_received = Column(Date, nullable=True)
	item_description = Column(Text, nullable=True)
	status = Column(String, nullable=True)
	client_quote_amount = Column(Numeric, nullable=True)  # legacy
	client_po_amount = Column(Numeric, nullable=True)
	supplier_po_amount = Column(Numeric, nullable=True)
	client_quote_currency = Column(String, nullable=True)
	# QuickBooks integration
	quickbooks_invoice_id = Column(String, nullable=True)  # QB Invoice ID
	quickbooks_invoice_number = Column(String, nullable=True)  # QB Invoice Number (display)
	quickbooks_invoice_status = Column(String, nullable=True)
	quickbooks_realm_fingerprint = Column(String(64), nullable=True)
	quickbooks_last_synced_at = Column(DateTime, nullable=True)
	invoiced_at = Column(DateTime, nullable=True)  # When invoice was created

	client = relationship("Client", back_populates="transactions")
	documents = relationship("Document", back_populates="transaction")
	shipment_info = relationship("ShipmentInfo", back_populates="transaction", uselist=False)
	activities = relationship("ActivityLog", back_populates="transaction")


class TransactionSupplierLink(Base):
	__tablename__ = "transaction_suppliers"
	__table_args__ = (
		UniqueConstraint(
			"transaction_id",
			"supplier_id",
			name="uq_transaction_suppliers_transaction_supplier",
		),
		Index("ix_transaction_suppliers_transaction_id", "transaction_id"),
		Index("ix_transaction_suppliers_supplier_id", "supplier_id"),
	)

	id = Column(Integer, primary_key=True)
	transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
	supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)


class Document(Base):
	__tablename__ = "documents"
	__table_args__ = (
		Index("ix_documents_transaction_id", "transaction_id"),
	)

	id = Column(Integer, primary_key=True)
	transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
	category = Column(String, nullable=False)  # client-po, supplier-po, invoice, other
	name = Column(String, nullable=False)
	mime_type = Column(String, nullable=True)
	size_bytes = Column(Integer, nullable=True)
	content = Column(LargeBinary, nullable=True)
	uploaded_by = Column(String, nullable=True)
	uploaded_at = Column(DateTime, default=utc_now)

	transaction = relationship("Transaction", back_populates="documents")


class ShipmentInfo(Base):
	__tablename__ = "shipments"
	__table_args__ = (
		Index("ix_shipments_transaction_id", "transaction_id"),
	)

	id = Column(Integer, primary_key=True)
	transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
	lead_time_days = Column(Integer, nullable=True)
	tracking_number = Column(String, nullable=True)
	shipped_date = Column(Date, nullable=True)
	eta_date = Column(Date, nullable=True)

	transaction = relationship("Transaction", back_populates="shipment_info")


class ActivityLog(Base):
	__tablename__ = "activity_logs"
	__table_args__ = (
		Index("ix_activity_logs_transaction_id", "transaction_id"),
	)

	id = Column(Integer, primary_key=True)
	transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
	action = Column(String, nullable=False)
	details = Column(Text, nullable=True)
	created_at = Column(DateTime, default=utc_now)

	transaction = relationship("Transaction", back_populates="activities") 


class SupplierQuote(Base):
	__tablename__ = "supplier_quotes"
	__table_args__ = (
		Index("ix_supplier_quotes_transaction_id", "transaction_id"),
		Index("ix_supplier_quotes_supplier_id", "supplier_id"),
	)

	id = Column(Integer, primary_key=True)
	transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
	supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
	amount = Column(Numeric, nullable=False)
	currency = Column(String, nullable=True)
	lead_time_days = Column(Integer, nullable=True)
	notes = Column(Text, nullable=True)
	created_at = Column(DateTime, default=utc_now)


class AssociatedCost(Base):
	__tablename__ = "associated_costs"
	__table_args__ = (
		Index("ix_associated_costs_transaction_id", "transaction_id"),
	)

	id = Column(Integer, primary_key=True)
	transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
	description = Column(String, nullable=False)
	amount = Column(Numeric, nullable=False)
	status = Column(String, nullable=False, default="due")  # paid, due, overdue
	created_at = Column(DateTime, default=utc_now)


class QuickBooksToken(Base):
	"""
	Store QuickBooks OAuth tokens for API access.
	Only one active token set per company (singleton pattern).
	"""
	__tablename__ = "quickbooks_tokens"
	__table_args__ = (
		UniqueConstraint("singleton_key", name="uq_quickbooks_tokens_singleton"),
		CheckConstraint("singleton_key = 1", name="ck_quickbooks_tokens_singleton_key"),
	)

	id = Column(Integer, primary_key=True)
	singleton_key = Column(Integer, nullable=False, default=1)
	realm_id = Column(String, nullable=False)  # QB Company ID
	access_token = Column(Text, nullable=False)
	refresh_token = Column(Text, nullable=False)
	token_expires_at = Column(DateTime, nullable=False)  # When access token expires
	refresh_expires_at = Column(DateTime, nullable=False)  # When refresh token expires
	created_at = Column(DateTime, default=utc_now)
	updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class QuickBooksOAuthState(Base):
	"""Single-use nonce backing a signed QuickBooks OAuth state token."""
	__tablename__ = "quickbooks_oauth_states"
	__table_args__ = (
		Index("ix_quickbooks_oauth_states_nonce_hash", "nonce_hash", unique=True),
		Index("ix_quickbooks_oauth_states_expires_at", "expires_at"),
	)

	id = Column(Integer, primary_key=True)
	nonce_hash = Column(String(64), nullable=False)
	employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
	expires_at = Column(DateTime, nullable=False)
	used_at = Column(DateTime, nullable=True)
	created_at = Column(DateTime, default=utc_now, nullable=False)


class QuickBooksCustomerMapping(Base):
	"""Realm-scoped mapping from an IDC client to a QuickBooks customer."""
	__tablename__ = "quickbooks_customer_mappings"
	__table_args__ = (
		UniqueConstraint("client_id", "realm_fingerprint", name="uq_qb_customer_client_realm"),
		Index("ix_qb_customer_mappings_client_id", "client_id"),
	)

	id = Column(Integer, primary_key=True)
	client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
	realm_fingerprint = Column(String(64), nullable=False)
	customer_id = Column(Text, nullable=False)
	created_at = Column(DateTime, default=utc_now, nullable=False)
	updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)


class QuickBooksInvoiceAttempt(Base):
	"""Durable, retry-safe record of one approved invoice operation."""
	__tablename__ = "quickbooks_invoice_attempts"
	__table_args__ = (
		UniqueConstraint("transaction_id", name="uq_qb_invoice_attempt_transaction"),
		UniqueConstraint("request_id", name="uq_qb_invoice_attempt_request_id"),
		Index("ix_qb_invoice_attempts_status", "status"),
	)

	id = Column(Integer, primary_key=True)
	transaction_id = Column(Integer, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
	created_by_employee_id = Column(Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
	realm_fingerprint = Column(String(64), nullable=False)
	request_id = Column(String(50), nullable=False)
	payload_hash = Column(String(64), nullable=False)
	payload_json = Column(Text, nullable=False)
	status = Column(String, nullable=False, default="pending")
	attempt_count = Column(Integer, nullable=False, default=0)
	invoice_id = Column(Text, nullable=True)
	invoice_number = Column(String, nullable=True)
	total_amount = Column(Numeric, nullable=True)
	currency = Column(String(8), nullable=True)
	last_error_code = Column(String, nullable=True)
	created_at = Column(DateTime, default=utc_now, nullable=False)
	updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)
	completed_at = Column(DateTime, nullable=True)
