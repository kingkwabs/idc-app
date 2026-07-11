import database
from conftest import csrf_headers, login
from models import (
	ActivityLog,
	AssociatedCost,
	QuickBooksInvoiceAttempt,
	ShipmentInfo,
	SupplierQuote,
	Transaction,
	TransactionSupplierLink,
)


def _create_transaction_and_supplier(client, suffix: str) -> tuple[int, int]:
	created_client = client.post(
		"/api/clients",
		headers=csrf_headers(client),
		json={"name": f"Deletion Client {suffix}"},
	).get_json()
	created_supplier = client.post(
		"/api/suppliers",
		headers=csrf_headers(client),
		json={"name": f"Deletion Supplier {suffix}"},
	).get_json()
	transaction = client.post(
		"/api/transactions",
		headers=csrf_headers(client),
		json={"client_id": created_client["id"], "item_description": "Deletion test"},
	).get_json()
	return transaction["id"], created_supplier["id"]


def _add_invoice_attempt(transaction_id: int, status: str, request_id: str):
	with database.db_session() as session:
		session.add(QuickBooksInvoiceAttempt(
			transaction_id=transaction_id,
			realm_fingerprint="r" * 64,
			request_id=request_id,
			payload_hash="p" * 64,
			payload_json="{}",
			status=status,
		))


def test_delete_transaction_removes_non_accounting_dependents(client):
	assert login(client).status_code == 200
	transaction_id, supplier_id = _create_transaction_and_supplier(client, "Cascade")
	base_url = f"/api/transactions/{transaction_id}"

	assert client.post(
		f"{base_url}/suppliers",
		headers=csrf_headers(client),
		json={"supplier_id": supplier_id},
	).status_code == 201
	assert client.post(
		f"{base_url}/quotes",
		headers=csrf_headers(client),
		json={"supplier_id": supplier_id, "amount": "250.00", "currency": "USD"},
	).status_code == 201
	assert client.post(
		f"{base_url}/costs",
		headers=csrf_headers(client),
		json={"description": "Freight", "amount": "25.00", "status": "due"},
	).status_code == 201
	assert client.put(
		f"{base_url}/shipment",
		headers=csrf_headers(client),
		json={"tracking_number": "DELETE-ME"},
	).status_code == 200
	_add_invoice_attempt(transaction_id, "failed", "delete-failed-attempt")

	response = client.delete(base_url, headers=csrf_headers(client))
	assert response.status_code == 204

	with database.db_session() as session:
		assert session.get(Transaction, transaction_id) is None
		for model in (
			ActivityLog,
			AssociatedCost,
			QuickBooksInvoiceAttempt,
			ShipmentInfo,
			SupplierQuote,
			TransactionSupplierLink,
		):
			assert session.query(model).filter_by(transaction_id=transaction_id).count() == 0


def test_delete_transaction_preserves_quickbooks_audit_history(client):
	assert login(client).status_code == 200
	transaction_id, _ = _create_transaction_and_supplier(client, "QuickBooks")
	_add_invoice_attempt(transaction_id, "unknown", "retain-unknown-attempt")

	response = client.delete(
		f"/api/transactions/{transaction_id}",
		headers=csrf_headers(client),
	)
	assert response.status_code == 409
	assert response.get_json()["error"] == "transaction_has_quickbooks_invoice_history"

	with database.db_session() as session:
		assert session.get(Transaction, transaction_id) is not None
		assert session.query(QuickBooksInvoiceAttempt).filter_by(transaction_id=transaction_id).count() == 1
