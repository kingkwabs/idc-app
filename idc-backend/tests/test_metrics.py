from conftest import csrf_headers, login


def _create_transaction(client, client_id: int, status: str) -> int:
	created = client.post(
		"/api/transactions",
		headers=csrf_headers(client),
		json={
			"client_id": client_id,
			"item_description": f"Metric test: {status}",
			"client_quote_amount": 100,
		},
	)
	assert created.status_code == 201
	transaction_id = created.get_json()["id"]
	updated = client.patch(
		f"/api/transactions/{transaction_id}",
		headers=csrf_headers(client),
		json={"status": status, "status_reason": "Metric classification test"},
	)
	assert updated.status_code == 200
	return transaction_id


def test_active_metrics_use_terminal_workflow_states(client):
	assert login(client).status_code == 200
	created_client = client.post(
		"/api/clients",
		headers=csrf_headers(client),
		json={"name": "Metric Client"},
	).get_json()
	created_supplier = client.post(
		"/api/suppliers",
		headers=csrf_headers(client),
		json={"name": "Metric Supplier"},
	).get_json()

	active_rfq = _create_transaction(client, created_client["id"], "rfq-from-client")
	active_shipment = _create_transaction(client, created_client["id"], "shipment-clearance-delivery")
	cancelled = _create_transaction(client, created_client["id"], "cancelled")
	_create_transaction(client, created_client["id"], "loans-cleared")

	summary = client.get("/api/transactions/summary").get_json()
	assert summary["active_count"] == 2

	metrics = client.get("/api/clients/metrics").get_json()["items"]
	assert metrics == [{
		"id": created_client["id"],
		"name": "Metric Client",
		"active_transactions": 2,
		"completed_transactions": 1,
		"total_revenue": 400.0,
	}]

	link_url = f"/api/transactions/{cancelled}/suppliers"
	assert client.post(
		link_url,
		headers=csrf_headers(client),
		json={"supplier_id": created_supplier["id"]},
	).status_code == 201
	assert client.get("/api/suppliers/summary").get_json()["engaged_suppliers"] == 0

	assert client.post(
		f"/api/transactions/{active_shipment}/suppliers",
		headers=csrf_headers(client),
		json={"supplier_id": created_supplier["id"]},
	).status_code == 201
	assert client.get("/api/suppliers/summary").get_json()["engaged_suppliers"] == 1
	assert active_rfq > 0
