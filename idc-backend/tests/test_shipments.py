import database
from conftest import csrf_headers, login
from models import ActivityLog, ShipmentInfo, Transaction


def _create_transaction(client):
	created_client = client.post(
		"/api/clients",
		headers=csrf_headers(client),
		json={"name": "Shipment Client"},
	).get_json()
	return client.post(
		"/api/transactions",
		headers=csrf_headers(client),
		json={"client_id": created_client["id"], "item_description": "Shipment test"},
	).get_json()["id"]


def test_shipment_confirmation_saves_details_and_status_atomically(client):
	assert login(client).status_code == 200
	transaction_id = _create_transaction(client)

	response = client.put(
		f"/api/transactions/{transaction_id}/shipment",
		headers=csrf_headers(client),
		json={
			"lead_time_days": 12,
			"tracking_number": "TRACK-100",
			"shipped_date": "2026-07-10",
			"eta_date": "2026-07-22",
		},
	)
	assert response.status_code == 200
	assert response.get_json()["status"] == "shipment-clearance-delivery"

	with database.db_session() as session:
		transaction = session.get(Transaction, transaction_id)
		shipment = session.query(ShipmentInfo).filter_by(transaction_id=transaction_id).one()
		activity = session.query(ActivityLog).filter_by(
			transaction_id=transaction_id,
			action="shipment-confirmed",
		).one()
		assert transaction.status == "shipment-clearance-delivery"
		assert shipment.tracking_number == "TRACK-100"
		assert str(shipment.eta_date) == "2026-07-22"
		assert "TRACK-100" in activity.details


def test_shipment_confirmation_rejects_invalid_dates_and_blocked_status(client):
	assert login(client).status_code == 200
	transaction_id = _create_transaction(client)

	invalid_dates = client.put(
		f"/api/transactions/{transaction_id}/shipment",
		headers=csrf_headers(client),
		json={"shipped_date": "2026-07-20", "eta_date": "2026-07-10"},
	)
	assert invalid_dates.status_code == 400

	assert client.patch(
		f"/api/transactions/{transaction_id}",
		headers=csrf_headers(client),
		json={"status": "cancelled", "status_reason": "Order cancelled"},
	).status_code == 200
	blocked = client.put(
		f"/api/transactions/{transaction_id}/shipment",
		headers=csrf_headers(client),
		json={"tracking_number": "SHOULD-NOT-SAVE"},
	)
	assert blocked.status_code == 409

	with database.db_session() as session:
		assert session.query(ShipmentInfo).filter_by(transaction_id=transaction_id).count() == 0
