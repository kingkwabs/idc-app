import database
from conftest import csrf_headers, login
from models import ActivityLog


def test_client_creation_is_persisted_and_case_insensitive_unique(client):
	assert login(client).status_code == 200
	response = client.post(
		"/api/clients",
		headers=csrf_headers(client),
		json={
			"name": "Acme Energy",
			"contact_name": "Ada Lovelace",
			"email": "ada@example.com",
			"phone": "+1 555 0100",
		},
	)
	assert response.status_code == 201
	assert response.get_json()["contact_name"] == "Ada Lovelace"
	assert client.get("/api/clients").get_json()["items"][0]["name"] == "Acme Energy"
	assert client.post(
		"/api/clients",
		headers=csrf_headers(client),
		json={"name": "ACME ENERGY"},
	).status_code == 409


def test_supplier_creation_is_persisted_and_validated(client):
	assert login(client).status_code == 200
	response = client.post(
		"/api/suppliers",
		headers=csrf_headers(client),
		json={
			"name": "Northstar Components",
			"contact_name": "Grace Hopper",
			"email": "grace@example.com",
			"category": "Electrical Components",
		},
	)
	assert response.status_code == 201
	assert response.get_json()["category"] == "Electrical Components"
	assert client.get("/api/suppliers").get_json()["items"][0]["name"] == "Northstar Components"
	assert client.post(
		"/api/suppliers",
		headers=csrf_headers(client),
		json={"name": "N"},
	).status_code == 400


def test_transactions_are_capped_filtered_sorted_and_paginated(client):
	assert login(client).status_code == 200
	assert client.post(
		"/api/transactions",
		headers=csrf_headers(client),
		json={"client_id": 999_999, "item_description": "Unknown client"},
	).status_code == 404
	alpha = client.post(
		"/api/clients",
		headers=csrf_headers(client),
		json={"name": "Alpha Energy"},
	).get_json()
	beta = client.post(
		"/api/clients",
		headers=csrf_headers(client),
		json={"name": "Beta Energy"},
	).get_json()

	for client_id, description, amount, status, date_received in [
		(alpha["id"], "Alpha valve", 100, "rfq-from-client", "2025-01-01"),
		(beta["id"], "Beta turbine", 500, "loans-cleared", "2026-02-01"),
	]:
		response = client.post(
			"/api/transactions",
			headers=csrf_headers(client),
			json={
				"client_id": client_id,
				"item_description": description,
				"client_quote_amount": amount,
				"date_received": date_received,
			},
		)
		assert response.status_code == 201
		transaction_id = response.get_json()["id"]
		assert client.patch(
			f"/api/transactions/{transaction_id}",
			headers=csrf_headers(client),
			json={"status": status, "status_reason": f"Set {status} during test"},
		).status_code == 200

	with database.db_session() as session:
		audit = session.query(ActivityLog).filter(
			ActivityLog.transaction_id == transaction_id,
			ActivityLog.action == "status-updated",
		).one()
		assert "Set loans-cleared during test" in audit.details
		assert "Primary Admin" in audit.details

	undated = client.post(
		"/api/transactions",
		headers=csrf_headers(client),
		json={"client_id": alpha["id"], "item_description": "Undated pump"},
	)
	assert undated.status_code == 201

	filtered = client.get(
		"/api/transactions?client=beta&status=cleared&sort=amount&direction=desc&page=1&size=1"
	)
	assert filtered.status_code == 200
	payload = filtered.get_json()
	assert payload["total"] == 1
	assert payload["page"] == 1
	assert payload["size"] == 1
	assert payload["items"][0]["item_description"] == "Beta turbine"
	assert payload["items"][0]["date_received"] == "2026-02-01"
	assert "quickbooks_realm_fingerprint" not in payload["items"][0]

	years = client.get("/api/transactions/years")
	assert years.status_code == 200
	assert years.get_json() == {
		"items": [
			{"year": 2026, "count": 1},
			{"year": 2025, "count": 1},
			{"year": None, "count": 1},
		],
		"total": 3,
	}
	assert client.get("/api/transactions?year=2025").get_json()["items"][0]["item_description"] == "Alpha valve"
	assert client.get("/api/transactions?year=undated").get_json()["items"][0]["item_description"] == "Undated pump"
	assert client.get("/api/transactions?year=not-a-year").status_code == 400

	assert client.get("/api/transactions?page=0&size=20").status_code == 400
	assert client.get("/api/transactions?page=1&size=101").status_code == 400
	assert client.patch(
		f"/api/transactions/{transaction_id}",
		headers=csrf_headers(client),
		json={"status": "not-a-real-workflow-status"},
	).status_code == 400
