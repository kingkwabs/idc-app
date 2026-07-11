from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


WorkflowStatus = Literal[
	"rfq-from-client",
	"rfqs-to-suppliers",
	"receive-supplier-quotes",
	"prepare-proposal",
	"director-approval",
	"proposal-sent-client",
	"client-draft-po",
	"po-to-suppliers",
	"client-confirmed-po",
	"commercial-arrangements",
	"leadtime-shipping-arrangement",
	"shipment-clearance-delivery",
	"delivery-docs-submitted",
	"payment-received",
	"loans-cleared",
	"on-hold",
	"cancelled",
]

PositiveStrictId = Annotated[int, Field(strict=True, gt=0)]


class EmployeeBase(BaseModel):
	name: str = Field(min_length=2, max_length=120)
	email: EmailStr
	role: Literal["admin", "employee"] = "employee"

	@field_validator("name")
	@classmethod
	def normalize_name(cls, value: str) -> str:
		value = " ".join(value.split())
		if len(value) < 2:
			raise ValueError("name is required")
		return value


class EmployeeCreate(EmployeeBase):
	password: str = Field(min_length=12, max_length=128)


class EmployeeOut(EmployeeBase):
	model_config = ConfigDict(from_attributes=True)

	id: int
	created_at: datetime
	updated_at: Optional[datetime] = None
	last_login_at: Optional[datetime] = None
	locked_until: Optional[datetime] = None
	is_active: bool = True
	must_change_password: bool = False


class EmployeeUpdate(BaseModel):
	name: Optional[str] = Field(default=None, min_length=2, max_length=120)
	email: Optional[EmailStr] = None
	role: Optional[Literal["admin", "employee"]] = None
	is_active: Optional[bool] = None
	temporary_password: Optional[str] = Field(default=None, min_length=12, max_length=128)

	@field_validator("name")
	@classmethod
	def normalize_optional_name(cls, value: Optional[str]) -> Optional[str]:
		if value is None:
			return None
		value = " ".join(value.split())
		if len(value) < 2:
			raise ValueError("name is required")
		return value


class ProfileUpdate(BaseModel):
	name: Optional[str] = Field(default=None, min_length=2, max_length=120)
	email: Optional[EmailStr] = None

	@field_validator("name")
	@classmethod
	def normalize_optional_name(cls, value: Optional[str]) -> Optional[str]:
		if value is None:
			return None
		normalized = " ".join(value.split())
		if len(normalized) < 2:
			raise ValueError("name is required")
		return normalized


class PasswordChange(BaseModel):
	current_password: str = Field(min_length=1, max_length=128)
	new_password: str = Field(min_length=12, max_length=128)


class QuickBooksInvoicePreviewRequest(BaseModel):
	model_config = ConfigDict(extra="forbid")

	selected_quote_id: Optional[PositiveStrictId] = None
	billable_cost_ids: list[PositiveStrictId] = Field(default_factory=list, max_length=100)
	custom_notes: str = Field(default="", max_length=650)

	@field_validator("billable_cost_ids")
	@classmethod
	def normalize_billable_cost_ids(cls, value: list[int]) -> list[int]:
		return sorted(set(value))

	@field_validator("custom_notes")
	@classmethod
	def normalize_custom_notes(cls, value: str) -> str:
		return value.strip()


class QuickBooksInvoiceCreateRequest(QuickBooksInvoicePreviewRequest):
	preview_hash: Optional[str] = Field(
		default=None,
		min_length=64,
		max_length=64,
		pattern=r"^[a-f0-9]{64}$",
	)


class EmployeeJWTClaims(BaseModel):
	id: int
	name: str
	email: str
	role: str


class TransactionCreate(BaseModel):
	client_id: int = Field(gt=0)
	rfq_number: Optional[str] = None
	date_received: Optional[date] = None
	item_description: Optional[str] = Field(None, max_length=5000)
	client_quote_amount: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
	client_quote_currency: Optional[str] = Field(None, max_length=8)


class TransactionUpdate(BaseModel):
	item_description: Optional[str] = Field(None, max_length=5000)
	status: Optional[WorkflowStatus] = None
	status_reason: Optional[str] = Field(default=None, max_length=1000)
	client_quote_amount: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
	client_quote_currency: Optional[str] = Field(None, max_length=8)
	client_po_amount: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
	supplier_po_amount: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)


class TransactionOut(BaseModel):
	model_config = ConfigDict(from_attributes=True)

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
	quickbooks_invoice_id: Optional[str]
	quickbooks_invoice_number: Optional[str]
	quickbooks_invoice_status: Optional[str]
	quickbooks_last_synced_at: Optional[datetime]
	invoiced_at: Optional[datetime]


class ShipmentUpdate(BaseModel):
	lead_time_days: Optional[int] = Field(default=None, ge=0, le=36500)
	tracking_number: Optional[str] = Field(default=None, max_length=160)
	shipped_date: Optional[date] = None
	eta_date: Optional[date] = None

	@model_validator(mode="after")
	def validate_date_order(self):
		if self.shipped_date and self.eta_date and self.eta_date < self.shipped_date:
			raise ValueError("eta_date cannot be earlier than shipped_date")
		return self


class SupplierLinkCreate(BaseModel):
	supplier_id: int = Field(gt=0)


class SupplierQuoteCreate(BaseModel):
	supplier_id: int = Field(gt=0)
	amount: Decimal = Field(gt=0, max_digits=15, decimal_places=2)
	currency: str = Field(default="USD", min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$")
	lead_time_days: Optional[int] = Field(default=None, ge=1, le=3650)
	notes: Optional[str] = Field(default=None, max_length=5000)

	@field_validator("currency")
	@classmethod
	def normalize_currency(cls, value: str) -> str:
		return value.upper()

	@field_validator("notes")
	@classmethod
	def normalize_optional_notes(cls, value: Optional[str]) -> Optional[str]:
		if value is None:
			return None
		return value.strip() or None


class AssociatedCostCreate(BaseModel):
	description: str = Field(min_length=1, max_length=500)
	amount: Decimal = Field(gt=0, max_digits=15, decimal_places=2)
	status: Literal["paid", "due", "overdue"] = "due"

	@field_validator("description")
	@classmethod
	def normalize_description(cls, value: str) -> str:
		normalized = " ".join(value.split())
		if not normalized:
			raise ValueError("description is required")
		return normalized


class AssociatedCostUpdate(BaseModel):
	description: Optional[str] = Field(default=None, min_length=1, max_length=500)
	amount: Optional[Decimal] = Field(default=None, gt=0, max_digits=15, decimal_places=2)
	status: Optional[Literal["paid", "due", "overdue"]] = None

	@field_validator("description")
	@classmethod
	def normalize_optional_description(cls, value: Optional[str]) -> Optional[str]:
		if value is None:
			return None
		normalized = " ".join(value.split())
		if not normalized:
			raise ValueError("description is required")
		return normalized


class TransactionReferencesUpdate(BaseModel):
	rfq_number: Optional[str] = Field(default=None, max_length=160)
	client_po_number: Optional[str] = Field(default=None, max_length=160)
	supplier_po_number: Optional[str] = Field(default=None, max_length=160)

	@field_validator("rfq_number", "client_po_number", "supplier_po_number")
	@classmethod
	def normalize_reference(cls, value: Optional[str]) -> Optional[str]:
		if value is None:
			return None
		return value.strip() or None


class ActivityCreate(BaseModel):
	action: str = Field(min_length=1, max_length=120)
	details: Optional[str] = Field(default=None, max_length=5000)

	@field_validator("action")
	@classmethod
	def normalize_action(cls, value: str) -> str:
		normalized = " ".join(value.split())
		if not normalized:
			raise ValueError("action is required")
		return normalized

	@field_validator("details")
	@classmethod
	def normalize_optional_details(cls, value: Optional[str]) -> Optional[str]:
		if value is None:
			return None
		return value.strip() or None

class ClientOut(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	name: str
	contact_name: Optional[str] = None
	email: Optional[str] = None
	phone: Optional[str] = None
	address: Optional[str] = None
	notes: Optional[str] = None


class ClientCreate(BaseModel):
	name: str = Field(min_length=2, max_length=160)
	contact_name: Optional[str] = Field(default=None, max_length=160)
	email: Optional[EmailStr] = None
	phone: Optional[str] = Field(default=None, max_length=40)
	address: Optional[str] = Field(default=None, max_length=1000)
	notes: Optional[str] = Field(default=None, max_length=5000)

	@field_validator("name")
	@classmethod
	def normalize_client_name(cls, value: Optional[str]) -> Optional[str]:
		if value is None:
			return None
		normalized = " ".join(value.split())
		if len(normalized) < 2:
			raise ValueError("name is required")
		return normalized


class ClientUpdate(ClientCreate):
	name: Optional[str] = Field(default=None, min_length=2, max_length=160)


class SupplierOut(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	name: str
	contact_name: Optional[str] = None
	email: Optional[str] = None
	phone: Optional[str] = None
	website: Optional[str] = None
	address: Optional[str] = None
	category: Optional[str] = None
	notes: Optional[str] = None


class SupplierCreate(BaseModel):
	name: str = Field(min_length=2, max_length=160)
	contact_name: Optional[str] = Field(default=None, max_length=160)
	email: Optional[EmailStr] = None
	phone: Optional[str] = Field(default=None, max_length=40)
	website: Optional[str] = Field(default=None, max_length=500)
	address: Optional[str] = Field(default=None, max_length=1000)
	category: Optional[str] = Field(default=None, max_length=160)
	notes: Optional[str] = Field(default=None, max_length=5000)

	@field_validator("name")
	@classmethod
	def normalize_supplier_name(cls, value: Optional[str]) -> Optional[str]:
		if value is None:
			return None
		normalized = " ".join(value.split())
		if len(normalized) < 2:
			raise ValueError("name is required")
		return normalized


class SupplierUpdate(SupplierCreate):
	name: Optional[str] = Field(default=None, min_length=2, max_length=160)
