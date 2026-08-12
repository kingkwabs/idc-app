import database
from conftest import csrf_headers, login
from models import ActivityLog, TransactionSupplierLink


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


def test_supplier_overview_includes_sourcing_records_and_quotes(client):
	assert login(client).status_code == 200
	client_record = client.post(
		"/api/clients",
		headers=csrf_headers(client),
		json={"name": "Atlas Industrial"},
	).get_json()
	supplier = client.post(
		"/api/suppliers",
		headers=csrf_headers(client),
		json={
			"name": "Meridian Controls",
			"contact_name": "Maya Chen",
			"category": "Control systems",
		},
	).get_json()
	transaction = client.post(
		"/api/transactions",
		headers=csrf_headers(client),
		json={
			"client_id": client_record["id"],
			"rfq_number": "RFQ-2048",
			"date_received": "2026-08-12",
			"item_description": "Turbine control panel",
		},
	).get_json()

	assert client.post(
		f"/api/transactions/{transaction['id']}/suppliers",
		headers=csrf_headers(client),
		json={"supplier_id": supplier["id"]},
	).status_code == 201
	assert client.post(
		f"/api/transactions/{transaction['id']}/quotes",
		headers=csrf_headers(client),
		json={
			"supplier_id": supplier["id"],
			"amount": 12500,
			"currency": "usd",
			"lead_time_days": 21,
			"notes": "Includes commissioning support",
		},
	).status_code == 201

	# Preserve quotation-only history from records created before supplier links were enforced.
	with database.db_session() as session:
		link = session.query(TransactionSupplierLink).filter_by(
			transaction_id=transaction["id"],
			supplier_id=supplier["id"],
		).one()
		session.delete(link)

	response = client.get(f"/api/suppliers/{supplier['id']}")
	assert response.status_code == 200
	payload = response.get_json()
	assert payload["supplier"]["contact_name"] == "Maya Chen"
	assert payload["summary"] == {
		"sourcing_records": 1,
		"active_transactions": 1,
		"quotes": 1,
	}
	assert payload["items"] == [{
		"transaction_id": transaction["id"],
		"client_id": client_record["id"],
		"client_name": "Atlas Industrial",
		"rfq_number": "RFQ-2048",
		"date_received": "2026-08-12",
		"item_description": "Turbine control panel",
		"status": None,
		"quotes": [{
			"id": payload["items"][0]["quotes"][0]["id"],
			"amount": 12500.0,
			"currency": "USD",
			"lead_time_days": 21,
			"notes": "Includes commissioning support",
			"created_at": payload["items"][0]["quotes"][0]["created_at"],
		}],
	}]

	metrics = client.get("/api/suppliers/metrics").get_json()["items"]
	assert metrics == [{
		"id": supplier["id"],
		"name": "Meridian Controls",
		"sourcing_records": 1,
		"active_transactions": 1,
		"quotes": 1,
		"last_quoted": payload["items"][0]["quotes"][0]["created_at"],
	}]
	assert client.get("/api/suppliers/999999").status_code == 404


def test_supplier_can_be_created_and_linked_atomically_from_transaction(client):
	assert login(client).status_code == 200
	client_record = client.post(
		"/api/clients",
		headers=csrf_headers(client),
		json={"name": "Northstar Energy"},
	).get_json()
	transaction = client.post(
		"/api/transactions",
		headers=csrf_headers(client),
		json={"client_id": client_record["id"], "item_description": "Emergency valve package"},
	).get_json()

	response = client.post(
		f"/api/transactions/{transaction['id']}/suppliers/new",
		headers=csrf_headers(client),
		json={
			"name": "Summit Valve Works",
			"email": "quotes@summit.example",
			"category": "OEM parts",
		},
	)
	assert response.status_code == 201
	created = response.get_json()
	assert created["name"] == "Summit Valve Works"
	assert client.get(f"/api/transactions/{transaction['id']}/suppliers").get_json() == {
		"items": [{"id": created["id"], "name": "Summit Valve Works"}],
	}

	assert client.post(
		f"/api/transactions/{transaction['id']}/suppliers/new",
		headers=csrf_headers(client),
		json={"name": "SUMMIT VALVE WORKS"},
	).status_code == 409
	assert client.post(
		"/api/transactions/999999/suppliers/new",
		headers=csrf_headers(client),
		json={"name": "Should Not Persist"},
	).status_code == 404
	assert all(
		supplier["name"] != "Should Not Persist"
		for supplier in client.get("/api/suppliers").get_json()["items"]
	)
