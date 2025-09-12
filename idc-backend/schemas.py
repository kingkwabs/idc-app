from typing import Optional
from pydantic import BaseModel, Field
from datetime import date


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