import hashlib
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock

import requests
from sqlalchemy import event

import database
import routes_quickbooks
from auth_util import hash_password, verify_token
from conftest import csrf_headers, login
from models import (
	AssociatedCost,
	Client,
	Employee,
	QuickBooksInvoiceAttempt,
	QuickBooksOAuthState,
	Supplier,
	SupplierQuote,
	Transaction,
)
from quickbooks_service import QuickBooksConfigurationError


def _register_quickbooks(app):
	if "quickbooks" not in app.blueprints:
		app.register_blueprint(routes_quickbooks.bp)


def _block_http(monkeypatch):
	def fail(*_args, **_kwargs):
		raise AssertionError("QuickBooks route tests must not make network requests")

	monkeypatch.setattr(requests.sessions.Session, "request", fail)


def test_oauth_state_is_random_persisted_single_use_and_callback_is_empty_302(
	app,
	monkeypatch,
):
	_register_quickbooks(app)
	_block_http(monkeypatch)
	monkeypatch.setenv("FRONTEND_URL", "https://frontend.example/")
	service = MagicMock()
	states = []

	def authorization_url(state):
		states.append(state)
		return f"https://authorization.example/?state={state}"

	service.get_authorization_url.side_effect = authorization_url
	service_factory = MagicMock(return_value=service)
	monkeypatch.setattr(routes_quickbooks, "QuickBooksService", service_factory)
	client = app.test_client()
	assert login(client).status_code == 200

	assert client.get("/quickbooks/auth/connect").status_code == 200
	assert client.get("/quickbooks/auth/connect").status_code == 200
	assert len(states) == 2
	assert states[0] != states[1]
	payload = verify_token(states[0])
	assert payload["purpose"] == routes_quickbooks.QB_OAUTH_STATE_PURPOSE
	assert payload["sub"] == payload["user_id"] == "1"
	assert payload["nonce"]

	with database.db_session() as session:
		stored = session.query(QuickBooksOAuthState).filter(
			QuickBooksOAuthState.nonce_hash
			== hashlib.sha256(payload["nonce"].encode("utf-8")).hexdigest()
		).one()
		assert payload["nonce"] != stored.nonce_hash
		assert stored.used_at is None
		stored_nonce_hash = stored.nonce_hash

	response = client.get(
		"/quickbooks/callback",
		query_string={"code": "code", "realmId": "realm", "state": states[0]},
	)
	assert response.status_code == 302
	assert response.headers["Location"] == (
		"https://frontend.example/quickbooks?connection=success"
	)
	assert response.data == b""
	service.exchange_code_for_tokens.assert_called_once_with("code", "realm")

	with database.db_session() as session:
		assert session.query(QuickBooksOAuthState).filter(
			QuickBooksOAuthState.nonce_hash == stored_nonce_hash
		).one().used_at is not None

	replay = client.get(
		"/quickbooks/callback",
		query_string={"code": "code", "realmId": "realm", "state": states[0]},
	)
	assert replay.status_code == 302
	assert replay.headers["Location"].endswith("connection=error")
	assert replay.data == b""
	service.exchange_code_for_tokens.assert_called_once()


def test_callback_consumes_state_before_exchange_failure_and_leaks_no_detail(
	app,
	monkeypatch,
):
	_register_quickbooks(app)
	_block_http(monkeypatch)
	monkeypatch.setenv("FRONTEND_URL", "https://frontend.example")
	service = MagicMock()
	service.exchange_code_for_tokens.side_effect = RuntimeError(
		"secret-token-and-realm-detail"
	)
	monkeypatch.setattr(
		routes_quickbooks,
		"QuickBooksService",
		MagicMock(return_value=service),
	)
	with database.db_session() as session:
		state = routes_quickbooks._create_oauth_state(session, "1")

	client = app.test_client()
	response = client.get(
		"/quickbooks/callback",
		query_string={"code": "code", "realmId": "realm", "state": state},
	)
	assert response.status_code == 302
	assert response.headers["Location"].endswith("connection=error")
	assert response.data == b""
	assert b"secret-token" not in response.data

	with database.db_session() as session:
		assert session.query(QuickBooksOAuthState).one().used_at is not None

	replay = client.get(
		"/quickbooks/callback",
		query_string={"code": "code", "realmId": "realm", "state": state},
	)
	assert replay.headers["Location"].endswith("connection=error")
	assert service.exchange_code_for_tokens.call_count == 1


def test_invalid_callback_state_redirects_without_constructing_service(app, monkeypatch):
	_register_quickbooks(app)
	_block_http(monkeypatch)
	service_factory = MagicMock()
	monkeypatch.setattr(routes_quickbooks, "QuickBooksService", service_factory)
	client = app.test_client()

	response = client.get(
		"/quickbooks/callback",
		query_string={"code": "code", "realmId": "realm", "state": "invalid"},
	)
	assert response.status_code == 302
	assert response.headers["Location"].endswith("connection=error")
	assert response.data == b""
	service_factory.assert_not_called()


def test_status_never_returns_realm_or_credentials(app, monkeypatch):
	_register_quickbooks(app)
	_block_http(monkeypatch)
	service = MagicMock()
	service.connection_status.return_value = {
		"connected": True,
		"token_expires_at": "2030-01-01T00:00:00",
		"refresh_expires_at": "2030-02-01T00:00:00",
	}
	monkeypatch.setattr(
		routes_quickbooks,
		"QuickBooksService",
		MagicMock(return_value=service),
	)
	client = app.test_client()
	assert login(client).status_code == 200

	payload = client.get("/quickbooks/status").get_json()
	assert payload["connected"] is True
	assert "realm_id" not in payload
	assert "access_token" not in payload
	assert "refresh_token" not in payload


def test_invoice_plan_rejects_non_usd_transactions(app):
	with database.db_session() as session:
		customer = Client(name="International Client")
		session.add(customer)
		session.flush()
		transaction = Transaction(
			client_id=customer.id,
			client_po_amount=500,
			client_quote_currency="EUR",
			item_description="Valve",
		)
		session.add(transaction)
		session.flush()

		plan = routes_quickbooks._build_invoice_plan(session, transaction)

	assert plan["can_create"] is False
	assert "supports USD transactions only" in " ".join(plan["errors"])


def test_create_route_locks_transaction_and_disables_attachments(app, monkeypatch):
	_register_quickbooks(app)
	_block_http(monkeypatch)
	with database.db_session() as session:
		customer = Client(name="Route Invoice Client")
		session.add(customer)
		session.flush()
		transaction = Transaction(
			client_id=customer.id,
			client_po_amount=500,
			client_quote_currency="USD",
			item_description="Valve",
		)
		session.add(transaction)
		session.flush()
		transaction_id = transaction.id

	service = MagicMock()
	qb_client = SimpleNamespace(company_id="realm")
	service.get_client.return_value = qb_client
	service.create_invoice.return_value = {
		"invoice_id": "invoice-id",
		"invoice_number": "INV-1",
		"total": "500.00",
		"created": True,
	}
	monkeypatch.setattr(
		routes_quickbooks,
		"QuickBooksService",
		MagicMock(return_value=service),
	)

	locked_transaction = []

	def observe_lock(_conn, clauseelement, _multiparams, _params, _execution_options):
		if getattr(clauseelement, "_for_update_arg", None) is None:
			return
		for description in getattr(clauseelement, "column_descriptions", []):
			if description.get("entity") is Transaction:
				locked_transaction.append(True)

	event.listen(database._engine, "before_execute", observe_lock)
	try:
		client = app.test_client()
		assert login(client).status_code == 200
		preview = client.post(
			f"/quickbooks/transactions/{transaction_id}/invoice-preview",
			headers=csrf_headers(client),
			json={},
		).get_json()
		response = client.post(
			f"/quickbooks/transactions/{transaction_id}/create-invoice",
			headers=csrf_headers(client),
			json={"preview_hash": preview["preview_hash"]},
		)
	finally:
		event.remove(database._engine, "before_execute", observe_lock)

	assert response.status_code == 201
	assert locked_transaction
	kwargs = service.create_invoice.call_args.kwargs
	assert kwargs["attach_documents"] is False
	assert kwargs["qb_client"] is qb_client
	assert kwargs["created_by_employee_id"] == 1
	assert kwargs["currency"] == "USD"


def test_create_route_rejects_stale_invoice_preview(app, monkeypatch):
	_register_quickbooks(app)
	_block_http(monkeypatch)
	with database.db_session() as session:
		customer = Client(name="Stale Preview Client")
		session.add(customer)
		session.flush()
		transaction = Transaction(
			client_id=customer.id,
			client_po_amount=500,
			client_quote_currency="USD",
			item_description="Valve",
		)
		session.add(transaction)
		session.flush()
		transaction_id = transaction.id

	service = MagicMock()
	service.get_client.return_value = SimpleNamespace(company_id="realm")
	monkeypatch.setattr(
		routes_quickbooks,
		"QuickBooksService",
		MagicMock(return_value=service),
	)
	client = app.test_client()
	assert login(client).status_code == 200
	preview = client.post(
		f"/quickbooks/transactions/{transaction_id}/invoice-preview",
		headers=csrf_headers(client),
		json={},
	).get_json()

	with database.db_session() as session:
		session.get(Transaction, transaction_id).client_po_amount = 750

	response = client.post(
		f"/quickbooks/transactions/{transaction_id}/create-invoice",
		headers=csrf_headers(client),
		json={"preview_hash": preview["preview_hash"]},
	)
	assert response.status_code == 409
	assert response.get_json()["error"] == "invoice_preview_stale"
	service.create_invoice.assert_not_called()


def test_invoice_plan_bills_only_selected_costs_and_keeps_mixed_currency_quote_internal(app):
	with database.db_session() as session:
		customer = Client(name="Margin Client")
		supplier = Supplier(name="Euro Supplier")
		session.add_all([customer, supplier])
		session.flush()
		transaction = Transaction(
			client_id=customer.id,
			client_po_amount=1000,
			supplier_po_amount=400,
			client_quote_currency="USD",
			item_description="Valve package",
			supplier_po_number="SUP-PO-1",
		)
		session.add(transaction)
		session.flush()
		quote = SupplierQuote(
			transaction_id=transaction.id,
			supplier_id=supplier.id,
			amount=100,
			currency="EUR",
		)
		selected_cost = AssociatedCost(
			transaction_id=transaction.id,
			description="Customer freight",
			amount=100,
			status="due",
		)
		internal_cost = AssociatedCost(
			transaction_id=transaction.id,
			description="Internal handling",
			amount=50,
			status="due",
		)
		session.add_all([quote, selected_cost, internal_cost])
		session.flush()

		plan = routes_quickbooks._build_invoice_plan(
			session,
			transaction,
			selected_quote_id=quote.id,
			billable_cost_ids=[selected_cost.id],
		)

	assert plan["can_create"] is True
	assert plan["currency"] == "USD"
	assert [item["source"] for item in plan["line_items"]] == [
		"client_billable_amount",
		"associated_cost",
	]
	assert plan["totals"]["invoice_total"] == 1100.0
	assert plan["totals"]["internal_supplier_cost_basis"] == 400.0
	assert plan["totals"]["internal_associated_costs_total"] == 150.0
	assert plan["totals"]["estimated_margin"] == 550.0
	assert plan["selected_supplier_quote"]["currency"] == "EUR"
	assert "SUP-PO-1" not in plan["notes"]
	assert "used for estimated margin instead" in " ".join(plan["warnings"])


def test_invoice_plan_rejects_intuit_field_overflows(app):
	with database.db_session() as session:
		customer = Client(name="Field Limit Client")
		session.add(customer)
		session.flush()
		transaction = Transaction(
			client_id=customer.id,
			client_po_amount=500,
			client_quote_currency="USD",
			item_description="D" * 4001,
			rfq_number="R" * 160,
			client_po_number="P" * 160,
		)
		session.add(transaction)
		session.flush()
		plan = routes_quickbooks._build_invoice_plan(
			session,
			transaction,
			custom_notes="N" * 700,
		)

	assert plan["can_create"] is False
	assert "4,000 characters" in " ".join(plan["errors"])
	assert "1,000 characters" in " ".join(plan["errors"])


def test_invoice_routes_reject_malformed_bodies_before_constructing_service(app, monkeypatch):
	_register_quickbooks(app)
	_block_http(monkeypatch)
	service_factory = MagicMock()
	monkeypatch.setattr(routes_quickbooks, "QuickBooksService", service_factory)
	with database.db_session() as session:
		customer = Client(name="Validation Client")
		session.add(customer)
		session.flush()
		transaction = Transaction(
			client_id=customer.id,
			client_po_amount=500,
			client_quote_currency="USD",
			item_description="Valve",
		)
		session.add(transaction)
		session.flush()
		transaction_id = transaction.id

	client = app.test_client()
	assert login(client).status_code == 200
	for payload in (
		{"custom_notes": "N" * 651},
		{"selected_quote_id": True},
		{"billable_cost_ids": list(range(1, 102))},
		{"unexpected": "field"},
	):
		response = client.post(
			f"/quickbooks/transactions/{transaction_id}/invoice-preview",
			headers=csrf_headers(client),
			json=payload,
		)
		assert response.status_code == 400
		assert response.get_json()["error"] == "invalid_input"

	response = client.post(
		f"/quickbooks/transactions/{transaction_id}/create-invoice",
		headers=csrf_headers(client),
		json={"preview_hash": "not-a-valid-hash"},
	)
	assert response.status_code == 400
	assert response.get_json()["error"] == "invalid_input"
	service_factory.assert_not_called()


def test_quickbooks_routes_are_admin_only(app):
	_register_quickbooks(app)
	with database.db_session() as session:
		session.add(Employee(
			name="Operations Employee",
			email="employee@idcenergy.co",
			password_hash=hash_password("Employee!Password92"),
			role="employee",
			is_active=True,
			must_change_password=False,
		))

	client = app.test_client()
	assert login(client, "employee@idcenergy.co", "Employee!Password92").status_code == 200
	assert client.get("/quickbooks/auth/connect").status_code == 403
	assert client.get("/quickbooks/status").status_code == 403
	for path in (
		"/quickbooks/disconnect",
		"/quickbooks/transactions/1/invoice-preview",
		"/quickbooks/transactions/1/create-invoice",
	):
		assert client.post(path, headers=csrf_headers(client), json={}).status_code == 403


def test_oauth_callback_rejects_state_after_admin_access_is_removed(app, monkeypatch):
	_register_quickbooks(app)
	_block_http(monkeypatch)
	service_factory = MagicMock()
	monkeypatch.setattr(routes_quickbooks, "QuickBooksService", service_factory)
	with database.db_session() as session:
		state = routes_quickbooks._create_oauth_state(session, "1")
		session.get(Employee, 1).role = "employee"

	response = app.test_client().get(
		"/quickbooks/callback",
		query_string={"code": "code", "realmId": "realm", "state": state},
	)
	assert response.status_code == 302
	assert response.headers["Location"].endswith("connection=error")
	service_factory.assert_not_called()


def test_oauth_state_creation_prunes_old_used_and_expired_records(app):
	now = routes_quickbooks._utcnow()
	with database.db_session() as session:
		session.add_all([
			QuickBooksOAuthState(
				nonce_hash="a" * 64,
				employee_id=1,
				expires_at=now - timedelta(days=2),
			),
			QuickBooksOAuthState(
				nonce_hash="b" * 64,
				employee_id=1,
				expires_at=now + timedelta(days=1),
				used_at=now - timedelta(days=2),
			),
		])

	with database.db_session() as session:
		routes_quickbooks._create_oauth_state(session, "1")
		assert session.query(QuickBooksOAuthState).count() == 1


def test_create_route_reports_unknown_outcome_distinctly(app, monkeypatch):
	_register_quickbooks(app)
	_block_http(monkeypatch)
	with database.db_session() as session:
		customer = Client(name="Unknown Outcome Client")
		session.add(customer)
		session.flush()
		transaction = Transaction(
			client_id=customer.id,
			client_po_amount=500,
			client_quote_currency="USD",
			item_description="Valve",
		)
		session.add(transaction)
		session.flush()
		transaction_id = transaction.id

	class TimeoutService:
		def __init__(self, session):
			self.session = session

		def get_client(self):
			return SimpleNamespace(company_id="realm")

		def create_invoice(self, **_kwargs):
			self.session.add(QuickBooksInvoiceAttempt(
				transaction_id=transaction_id,
				created_by_employee_id=1,
				realm_fingerprint="fingerprint",
				request_id="request-id",
				payload_hash="c" * 64,
				payload_json="{}",
				status="unknown",
				attempt_count=1,
			))
			self.session.commit()
			raise TimeoutError("upstream timeout")

	monkeypatch.setattr(routes_quickbooks, "QuickBooksService", TimeoutService)
	client = app.test_client()
	assert login(client).status_code == 200
	preview = client.post(
		f"/quickbooks/transactions/{transaction_id}/invoice-preview",
		headers=csrf_headers(client),
		json={},
	).get_json()
	response = client.post(
		f"/quickbooks/transactions/{transaction_id}/create-invoice",
		headers=csrf_headers(client),
		json={"preview_hash": preview["preview_hash"]},
	)
	assert response.status_code == 502
	assert response.get_json() == {"error": "invoice_outcome_unknown"}


def test_create_route_reports_configuration_failure_before_unknown_outcome(app, monkeypatch):
	_register_quickbooks(app)
	_block_http(monkeypatch)
	with database.db_session() as session:
		customer = Client(name="Configuration Client")
		session.add(customer)
		session.flush()
		transaction = Transaction(
			client_id=customer.id,
			client_po_amount=500,
			client_quote_currency="USD",
			item_description="Valve",
		)
		session.add(transaction)
		session.flush()
		transaction_id = transaction.id

	service = MagicMock()
	service.get_client.return_value = SimpleNamespace(company_id="realm")
	service.create_invoice.side_effect = QuickBooksConfigurationError("service item missing")
	monkeypatch.setattr(routes_quickbooks, "QuickBooksService", MagicMock(return_value=service))
	client = app.test_client()
	assert login(client).status_code == 200
	preview = client.post(
		f"/quickbooks/transactions/{transaction_id}/invoice-preview",
		headers=csrf_headers(client),
		json={},
	).get_json()
	response = client.post(
		f"/quickbooks/transactions/{transaction_id}/create-invoice",
		headers=csrf_headers(client),
		json={"preview_hash": preview["preview_hash"]},
	)
	assert response.status_code == 503
	assert response.get_json() == {"error": "invoice_configuration_error"}
