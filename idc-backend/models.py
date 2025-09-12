from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy import Column, Integer, String, ForeignKey, Date, Numeric, Text, DateTime, LargeBinary
from datetime import datetime

Base = declarative_base()


class Client(Base):
	__tablename__ = "clients"

	id = Column(Integer, primary_key=True)
	name = Column(String, unique=True, nullable=False)

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