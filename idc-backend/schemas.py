from typing import Optional
from pydantic import BaseModel, Field
from datetime import date


# Employee schemas
from datetime import datetime


class EmployeeBase(BaseModel):
	"""
	Base schema for Employee, including fields for future QuickBooks/payroll/invoice integration.
	"""
	name: str
	email: str
	role: str
	# Placeholders for future QuickBooks/payroll/invoice fields
	quickbooks_employee_id: Optional[str] = None
	payroll_info: Optional[str] = None
	invoice_mapping: Optional[str] = None


class EmployeeCreate(EmployeeBase):
	"""
	Schema for creating a new employee (includes password).
	"""
	password: str


class EmployeeOut(EmployeeBase):
	"""
	Output schema for Employee, including id and created_at.
	"""
	id: int
	created_at: datetime

	class Config:
		from_attributes = True


class EmployeeJWTClaims(BaseModel):
	"""
	JWT claims for Employee tokens. Extendable for QuickBooks fields.
	"""
	id: int
	name: str
	email: str
	role: str
	# Add more fields as needed for JWT payload


class TransactionCreate(BaseModel):
	client_id: int
	rfq_number: Optional[str] = None
	date_received: Optional[date] = None
	item_description: Optional[str] = Field(None, max_length=5000)
	client_quote_amount: Optional[float] = None
	client_quote_currency: Optional[str] = Field(None, max_length=8)


class TransactionUpdate(BaseModel):
	item_description: Optional[str] = Field(None, max_length=5000)
	status: Optional[str] = None
	client_quote_amount: Optional[float] = None
	client_quote_currency: Optional[str] = Field(None, max_length=8)
	client_po_amount: Optional[float] = None
	supplier_po_amount: Optional[float] = None


class TransactionOut(BaseModel):
	id: int
	client_id: int
	rfq_number: Optional[str]
	client_po_number: Optional[str]
	supplier_po_number: Optional[str]
	client_po_amount: Optional[float]
	supplier_po_amount: Optional[float]
	date_received: Optional[date]
	item_description: Optional[str]
	status: Optional[str]
	client_quote_amount: Optional[float]
	client_quote_currency: Optional[str]

	class Config:
		from_attributes = True


class ClientOut(BaseModel):
	id: int
	name: str

	class Config:
		from_attributes = True 