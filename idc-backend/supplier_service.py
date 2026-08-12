from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models import Supplier
from schemas import SupplierCreate


class SupplierNameConflictError(ValueError):
	pass


def supplier_name_exists(
	session: Session,
	name: str,
	*,
	exclude_supplier_id: int | None = None,
) -> bool:
	statement = select(Supplier.id).where(func.lower(Supplier.name) == name.lower())
	if exclude_supplier_id is not None:
		statement = statement.where(Supplier.id != exclude_supplier_id)
	return session.scalar(statement) is not None


def create_supplier_record(session: Session, payload: SupplierCreate) -> Supplier:
	if supplier_name_exists(session, payload.name):
		raise SupplierNameConflictError(payload.name)

	supplier = Supplier(**payload.model_dump(mode="json"))
	session.add(supplier)
	session.flush()
	return supplier
