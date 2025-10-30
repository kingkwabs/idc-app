from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy import Column, Integer, String, ForeignKey, Date, Numeric, Text, DateTime, LargeBinary
from datetime import datetime

Base = declarative_base()


class Employee(Base):
	"""
	Employee model for authentication and access control.
	Includes placeholders for future QuickBooks/payroll/invoice integration.
	"""
	__tablename__ = "employees"

	id = Column(Integer, primary_key=True)
	name = Column(String, nullable=False)
	email = Column(String, unique=True, nullable=False)
	password_hash = Column(String, nullable=False)
	role = Column(String, nullable=False)
	created_at = Column(DateTime, default=datetime.utcnow)
	# Placeholders for future QuickBooks/payroll/invoice fields
	quickbooks_employee_id = Column(String, nullable=True)
	payroll_info = Column(String, nullable=True)
	invoice_mapping = Column(String, nullable=True)


class Client(Base):
	__tablename__ = "clients"

	id = Column(Integer, primary_key=True)
	name = Column(String, unique=True, nullable=False)
	# QuickBooks integration
	quickbooks_customer_id = Column(String, nullable=True)  # QB Customer ID

	transactions = relationship("Transaction", back_populates="client")


class Supplier(Base):
	__tablename__ = "suppliers"

	id = Column(Integer, primary_key=True)
	name = Column(String, unique=True, nullable=False)


class Transaction(Base):
	__tablename__ = "transactions"

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
	invoiced_at = Column(DateTime, nullable=True)  # When invoice was created

	client = relationship("Client", back_populates="transactions")
	documents = relationship("Document", back_populates="transaction")
	shipment_info = relationship("ShipmentInfo", back_populates="transaction", uselist=False)
	activities = relationship("ActivityLog", back_populates="transaction")


class TransactionSupplierLink(Base):
	__tablename__ = "transaction_suppliers"

	id = Column(Integer, primary_key=True)
	transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
	supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)


class Document(Base):
	__tablename__ = "documents"

	id = Column(Integer, primary_key=True)
	transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
	category = Column(String, nullable=False)  # client-po, supplier-po, invoice, other
	name = Column(String, nullable=False)
	mime_type = Column(String, nullable=True)
	size_bytes = Column(Integer, nullable=True)
	content = Column(LargeBinary, nullable=True)
	uploaded_by = Column(String, nullable=True)
	uploaded_at = Column(DateTime, default=datetime.utcnow)

	transaction = relationship("Transaction", back_populates="documents")


class ShipmentInfo(Base):
	__tablename__ = "shipments"

	id = Column(Integer, primary_key=True)
	transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
	lead_time_days = Column(Integer, nullable=True)
	tracking_number = Column(String, nullable=True)
	shipped_date = Column(Date, nullable=True)
	eta_date = Column(Date, nullable=True)

	transaction = relationship("Transaction", back_populates="shipment_info")


class ActivityLog(Base):
	__tablename__ = "activity_logs"

	id = Column(Integer, primary_key=True)
	transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
	action = Column(String, nullable=False)
	details = Column(Text, nullable=True)
	created_at = Column(DateTime, default=datetime.utcnow)

	transaction = relationship("Transaction", back_populates="activities") 


class SupplierQuote(Base):
	__tablename__ = "supplier_quotes"

	id = Column(Integer, primary_key=True)
	transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
	supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
	amount = Column(Numeric, nullable=False)
	currency = Column(String, nullable=True)
	lead_time_days = Column(Integer, nullable=True)
	notes = Column(Text, nullable=True)
	created_at = Column(DateTime, default=datetime.utcnow)


class AssociatedCost(Base):
	__tablename__ = "associated_costs"

	id = Column(Integer, primary_key=True)
	transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
	description = Column(String, nullable=False)
	amount = Column(Numeric, nullable=False)
	status = Column(String, nullable=False, default="due")  # paid, due, overdue
	created_at = Column(DateTime, default=datetime.utcnow)


class QuickBooksToken(Base):
	"""
	Store QuickBooks OAuth tokens for API access.
	Only one active token set per company (singleton pattern).
	"""
	__tablename__ = "quickbooks_tokens"

	id = Column(Integer, primary_key=True)
	realm_id = Column(String, nullable=False)  # QB Company ID
	access_token = Column(Text, nullable=False)
	refresh_token = Column(Text, nullable=False)
	token_expires_at = Column(DateTime, nullable=False)  # When access token expires
	refresh_expires_at = Column(DateTime, nullable=False)  # When refresh token expires
	created_at = Column(DateTime, default=datetime.utcnow)
	updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)