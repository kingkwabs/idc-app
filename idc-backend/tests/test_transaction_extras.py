import database
from conftest import csrf_headers, login
from models import AssociatedCost, SupplierQuote, Transaction, TransactionSupplierLink


def _create_transaction_and_supplier(client):
	created_client = client.post(
		"/api/clients",
		headers=csrf_headers(client),
		json={"name": "Extras Client"},
	).get_json()
	transaction = client.post(
		"/api/transactions",
		headers=csrf_headers(client),
		json={"client_id": created_client["id"], "item_description": "Extras test"},
	).get_json()
	supplier = client.post(
		"/api/suppliers",
		headers=csrf_headers(client),
		json={"name": "Extras Supplier"},
	).get_json()
	return transaction["id"], supplier["id"]


def test_supplier_link_is_idempotent_and_quote_requires_link(client):
	assert login(client).status_code == 200
	transaction_id, supplier_id = _create_transaction_and_supplier(client)
	quote_url = f"/api/transactions/{transaction_id}/quotes"
	link_url = f"/api/transactions/{transaction_id}/suppliers"

	unlinked = client.post(
		quote_url,
		headers=csrf_headers(client),
		json={"supplier_id": supplier_id, "amount": "125.00", "currency": "usd"},
	)
	assert unlinked.status_code == 409
	assert unlinked.get_json()["error"] == "supplier_not_linked"

	created = client.post(
		link_url,
		headers=csrf_headers(client),
		json={"supplier_id": supplier_id},
	)
	assert created.status_code == 201
	duplicate = client.post(
		link_url,
		headers=csrf_headers(client),
		json={"supplier_id": supplier_id},
	)
	assert duplicate.status_code == 200
	assert duplicate.get_json()["already_linked"] is True

	invalid = client.post(
		quote_url,
		headers=csrf_headers(client),
		json={"supplier_id": supplier_id, "amount": "-1.00", "currency": "USD"},
	)
	assert invalid.status_code == 400
	quote = client.post(
		quote_url,
		headers=csrf_headers(client),
		json={"supplier_id": supplier_id, "amount": "125.00", "currency": "usd"},
	)
	assert quote.status_code == 201

	with database.db_session() as session:
		assert session.query(TransactionSupplierLink).count() == 1
		stored_quote = session.get(SupplierQuote, quote.get_json()["id"])
		assert stored_quote.currency == "USD"
		assert str(stored_quote.amount) == "125.0000000000"


def test_cost_reference_and_activity_payloads_are_validated(client):
	assert login(client).status_code == 200
	transaction_id, _ = _create_transaction_and_supplier(client)
	costs_url = f"/api/transactions/{transaction_id}/costs"

	for body in (
		{"description": "   ", "amount": "10.00", "status": "due"},
		{"description": "Freight", "amount": "-10.00", "status": "due"},
		{"description": "Freight", "amount": "10.00", "status": "unknown"},
	):
		assert client.post(costs_url, headers=csrf_headers(client), json=body).status_code == 400

	created = client.post(
		costs_url,
		headers=csrf_headers(client),
		json={"description": "  Ocean   freight  ", "amount": "10.00", "status": "due"},
	)
	assert created.status_code == 201
	assert client.patch(
		f"{costs_url}/{created.get_json()['id']}",
		headers=csrf_headers(client),
		json={"description": "   "},
	).status_code == 400

	refs_url = f"/api/transactions/{transaction_id}/refs"
	assert client.patch(
		refs_url,
		headers=csrf_headers(client),
		json={"rfq_number": "x" * 161},
	).status_code == 400
	assert client.patch(
		refs_url,
		headers=csrf_headers(client),
		json={"rfq_number": " RFQ-42 ", "client_po_number": "   "},
	).status_code == 200

	activity_url = f"/api/transactions/{transaction_id}/activity"
	assert client.post(
		activity_url,
		headers=csrf_headers(client),
		json={"action": "   "},
	).status_code == 400

	with database.db_session() as session:
		stored_cost = session.get(AssociatedCost, created.get_json()["id"])
		stored_transaction = session.get(Transaction, transaction_id)
		assert stored_cost.description == "Ocean freight"
		assert stored_transaction.rfq_number == "RFQ-42"
		assert stored_transaction.client_po_number is None
