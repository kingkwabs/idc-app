import hashlib
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
import requests
from cryptography.fernet import Fernet
from sqlalchemy.exc import IntegrityError

import database
import quickbooks_service as service_module
from models import (
	Client,
	QuickBooksCustomerMapping,
	QuickBooksInvoiceAttempt,
	QuickBooksToken,
	Transaction,
)
from qb_token_crypto import QB_TOKEN_ENVELOPE_PREFIX, QBTokenCrypto
from quickbooks.exceptions import ObjectNotFoundException
from quickbooks_service import (
	QuickBooksAttachmentsDisabledError,
	QuickBooksCompanyConflictError,
	QuickBooksConfigurationError,
	QuickBooksInvoiceAttemptConflict,
	QuickBooksService,
	_invoice_request_id,
)


@pytest.fixture(autouse=True)
def quickbooks_test_boundary(monkeypatch):
	key = Fernet.generate_key().decode("ascii")
	monkeypatch.setenv("QB_ENVIRONMENT", "sandbox")
	monkeypatch.setenv("QB_TOKEN_ENCRYPTION_KEY", key)
	monkeypatch.setenv("QB_CLIENT_ID", "test-client")
	monkeypatch.setenv("QB_CLIENT_SECRET", "test-secret")
	monkeypatch.setenv("QB_SERVICE_ITEM_NAME", "IDC Services")

	def block_http(*_args, **_kwargs):
		raise AssertionError("QuickBooks tests must not make network requests")

	monkeypatch.setattr(requests.sessions.Session, "request", block_http)
	return key


@pytest.fixture()
def mocked_sdk(monkeypatch):
	auth_client = MagicMock()
	auth_client.access_token = None
	auth_client.refresh_token = None
	auth_client.expires_in = None
	auth_client.x_refresh_token_expires_in = None
	monkeypatch.setattr(
		service_module,
		"AuthClient",
		MagicMock(return_value=auth_client),
	)
	quickbooks_factory = MagicMock(
		side_effect=lambda **kwargs: SimpleNamespace(company_id=kwargs["company_id"])
	)
	monkeypatch.setattr(service_module, "QuickBooks", quickbooks_factory)
	return auth_client, quickbooks_factory


def _add_transaction(session, name="QuickBooks Client"):
	client = Client(name=name)
	session.add(client)
	session.flush()
	transaction = Transaction(
		client_id=client.id,
		client_po_amount=1250,
		client_quote_currency="USD",
		item_description="Pump package",
	)
	session.add(transaction)
	session.flush()
	return client, transaction


def _utcnow():
	return datetime.now(timezone.utc).replace(tzinfo=None)


def test_exchange_encrypts_every_credential_and_returns_no_realm(
	app,
	mocked_sdk,
	quickbooks_test_boundary,
):
	auth_client, _ = mocked_sdk

	def exchange(_code, realm_id=None):
		assert realm_id == "realm-sensitive"
		auth_client.access_token = "access-sensitive"
		auth_client.refresh_token = "refresh-sensitive"
		auth_client.expires_in = 1800
		auth_client.x_refresh_token_expires_in = 7200

	auth_client.get_bearer_token.side_effect = exchange
	with database.db_session() as session:
		result = QuickBooksService(session).exchange_code_for_tokens(
			"authorization-code",
			"realm-sensitive",
		)
		token = session.query(QuickBooksToken).one()
		stored = (token.realm_id, token.access_token, token.refresh_token)

	assert set(result) == {"expires_at"}
	assert all(value.startswith(QB_TOKEN_ENVELOPE_PREFIX) for value in stored)
	assert all("sensitive" not in value for value in stored)
	crypto = QBTokenCrypto(key=quickbooks_test_boundary, environment="sandbox")
	assert [crypto.decrypt(value) for value in stored] == [
		"realm-sensitive",
		"access-sensitive",
		"refresh-sensitive",
	]


def test_exchange_refuses_to_replace_a_live_different_company(
	app,
	mocked_sdk,
	quickbooks_test_boundary,
):
	auth_client, _ = mocked_sdk
	crypto = QBTokenCrypto(key=quickbooks_test_boundary, environment="sandbox")
	with database.db_session() as session:
		session.add(QuickBooksToken(
			singleton_key=1,
			realm_id=crypto.encrypt("existing-realm"),
			access_token=crypto.encrypt("existing-access"),
			refresh_token=crypto.encrypt("existing-refresh"),
			token_expires_at=_utcnow() + timedelta(hours=1),
			refresh_expires_at=_utcnow() + timedelta(days=30),
		))

	def exchange(_code, realm_id=None):
		assert realm_id == "different-realm"
		auth_client.access_token = "new-access"
		auth_client.refresh_token = "new-refresh"
		auth_client.expires_in = 1800
		auth_client.x_refresh_token_expires_in = 7200

	auth_client.get_bearer_token.side_effect = exchange
	with database.db_session() as session:
		with pytest.raises(QuickBooksCompanyConflictError):
			QuickBooksService(session).exchange_code_for_tokens(
				"authorization-code",
				"different-realm",
			)

	auth_client.revoke.assert_called_once_with(token="new-refresh")
	with database.db_session() as session:
		token = session.query(QuickBooksToken).one()
		assert crypto.decrypt(token.realm_id) == "existing-realm"
		assert crypto.decrypt(token.refresh_token) == "existing-refresh"


def test_refresh_locks_row_migrates_plaintext_and_persists_rotating_expiry(
	app,
	monkeypatch,
	mocked_sdk,
	quickbooks_test_boundary,
):
	auth_client, _ = mocked_sdk
	with database.db_session() as session:
		session.add(QuickBooksToken(
			realm_id="legacy-realm",
			access_token="legacy-access",
			refresh_token="legacy-refresh",
			token_expires_at=_utcnow() - timedelta(minutes=1),
			refresh_expires_at=_utcnow() + timedelta(days=30),
		))

	with database.db_session() as session:
		statements = []
		original_execute = session.execute

		def record_execute(statement, *args, **kwargs):
			statements.append(statement)
			return original_execute(statement, *args, **kwargs)

		monkeypatch.setattr(session, "execute", record_execute)

		def refresh(refresh_token=None):
			assert refresh_token == "legacy-refresh"
			auth_client.access_token = "rotated-access"
			auth_client.refresh_token = "rotated-refresh"
			auth_client.expires_in = 1800
			auth_client.x_refresh_token_expires_in = 7200

		auth_client.refresh.side_effect = refresh
		qb_client = QuickBooksService(session).get_client()
		assert qb_client.company_id == "legacy-realm"
		assert any(
			getattr(statement, "_for_update_arg", None) is not None
			for statement in statements
		)

	with database.db_session() as session:
		token = session.query(QuickBooksToken).one()
		crypto = QBTokenCrypto(key=quickbooks_test_boundary, environment="sandbox")
		assert crypto.decrypt(token.access_token) == "rotated-access"
		assert crypto.decrypt(token.refresh_token) == "rotated-refresh"
		assert crypto.decrypt(token.realm_id) == "legacy-realm"
		assert token.token_expires_at > _utcnow() + timedelta(minutes=20)
		assert token.refresh_expires_at > _utcnow() + timedelta(minutes=110)


def test_disconnect_revokes_plaintext_token_before_local_delete(
	app,
	mocked_sdk,
	quickbooks_test_boundary,
):
	auth_client, _ = mocked_sdk
	crypto = QBTokenCrypto(key=quickbooks_test_boundary, environment="sandbox")
	with database.db_session() as session:
		session.add(QuickBooksToken(
			realm_id=crypto.encrypt("realm"),
			access_token=crypto.encrypt("access"),
			refresh_token=crypto.encrypt("refresh-to-revoke"),
			token_expires_at=_utcnow() + timedelta(hours=1),
			refresh_expires_at=_utcnow() + timedelta(days=30),
		))

	with database.db_session() as session:
		service = QuickBooksService(session)

		def failed_revoke(token=None):
			assert token == "refresh-to-revoke"
			assert session.query(QuickBooksToken).count() == 1
			raise RuntimeError("upstream unavailable")

		auth_client.revoke.side_effect = failed_revoke
		with pytest.raises(RuntimeError):
			service.disconnect()
		assert session.query(QuickBooksToken).count() == 1
		session.rollback()

		auth_client.revoke.side_effect = None
		assert service.disconnect() is True
		assert session.query(QuickBooksToken).count() == 0
		auth_client.revoke.assert_called_with(token="refresh-to-revoke")


def test_customer_mapping_is_realm_scoped_and_query_literals_are_escaped(
	app,
	monkeypatch,
	mocked_sdk,
):
	with database.db_session() as session:
		client = Client(name="O'Brien\\West")
		session.add(client)
		session.flush()
		session.add(QuickBooksCustomerMapping(
			client_id=client.id,
			realm_fingerprint=hashlib.sha256(b"realm-a").hexdigest(),
			customer_id="customer-a",
		))
		service = QuickBooksService(session)
		get_customer = MagicMock()
		query_customer = MagicMock(return_value=[SimpleNamespace(Id="customer-b")])
		monkeypatch.setattr(service_module.Customer, "get", get_customer)
		monkeypatch.setattr(service_module.Customer, "query", query_customer)

		customer_id = service.find_or_create_customer(
			client,
			qb_client=SimpleNamespace(company_id="realm-b"),
		)
		assert customer_id == "customer-b"
		get_customer.assert_not_called()
		query = query_customer.call_args.args[0]
		assert "O\\'Brien\\\\West" in query
		mappings = session.query(QuickBooksCustomerMapping).all()
		assert {mapping.customer_id for mapping in mappings} == {
			"customer-a",
			"customer-b",
		}


def test_only_explicit_not_found_repairs_a_stale_customer_mapping(
	app,
	monkeypatch,
	mocked_sdk,
):
	with database.db_session() as session:
		client = Client(name="Mapped Client")
		session.add(client)
		session.flush()
		fingerprint = hashlib.sha256(b"realm").hexdigest()
		mapping = QuickBooksCustomerMapping(
			client_id=client.id,
			realm_fingerprint=fingerprint,
			customer_id="stale-id",
		)
		session.add(mapping)
		session.flush()
		service = QuickBooksService(session)
		get_customer = MagicMock(
			side_effect=ObjectNotFoundException("missing", error_code=610)
		)
		query_customer = MagicMock(return_value=[SimpleNamespace(Id="replacement-id")])
		monkeypatch.setattr(service_module.Customer, "get", get_customer)
		monkeypatch.setattr(service_module.Customer, "query", query_customer)

		assert service.find_or_create_customer(
			client,
			qb_client=SimpleNamespace(company_id="realm"),
		) == "replacement-id"
		assert mapping.customer_id == "replacement-id"

		get_customer.side_effect = TimeoutError("transient")
		query_customer.reset_mock()
		with pytest.raises(TimeoutError):
			service.find_or_create_customer(
				client,
				qb_client=SimpleNamespace(company_id="realm"),
			)
		query_customer.assert_not_called()


def test_service_item_must_already_exist_and_is_never_created(
	app,
	monkeypatch,
	mocked_sdk,
):
	with database.db_session() as session:
		service = QuickBooksService(session)
		query_item = MagicMock(return_value=[])
		monkeypatch.setattr(service_module.Item, "query", query_item)

		with pytest.raises(QuickBooksConfigurationError):
			service._get_service_item(SimpleNamespace())
		assert "Name = 'IDC Services'" in query_item.call_args.args[0]


def test_durable_invoice_attempt_uses_returned_invoice_and_syncs_transaction(
	app,
	monkeypatch,
	mocked_sdk,
):
	with database.db_session() as session:
		_, transaction = _add_transaction(session)
		service = QuickBooksService(session)
		monkeypatch.setattr(
			service,
			"find_or_create_customer",
			MagicMock(return_value="customer-1"),
		)
		monkeypatch.setattr(
			service,
			"_get_service_item",
			MagicMock(return_value={"value": "item-1", "name": "IDC Services"}),
		)
		request_ids = []
		commit_count = 0
		original_commit = session.commit

		def record_commit():
			nonlocal commit_count
			commit_count += 1
			return original_commit()

		monkeypatch.setattr(session, "commit", record_commit)

		def save_invoice(_invoice, qb=None, request_id=None, params=None):
			assert commit_count >= 1
			request_ids.append(request_id)
			return SimpleNamespace(Id="invoice-returned", DocNumber="INV-41", TotalAmt="1250.00")

		monkeypatch.setattr(service_module.Invoice, "save", save_invoice)
		result = service.create_invoice(
			transaction=transaction,
			line_items=[{"description": "Pump package", "amount": 1250.0, "quantity": 1}],
			notes="RFQ: 44",
			qb_client=SimpleNamespace(company_id="realm-secret"),
			created_by_employee_id=1,
			currency="USD",
		)

		attempt = session.query(QuickBooksInvoiceAttempt).one()
		session.refresh(transaction)
		assert result == {
			"invoice_id": "invoice-returned",
			"invoice_number": "INV-41",
			"total": "1250.00",
			"created": True,
		}
		assert request_ids == [attempt.request_id]
		assert request_ids[0] == _invoice_request_id(transaction.id)
		assert len(request_ids[0]) <= 50
		assert attempt.status == "succeeded"
		assert attempt.attempt_count == 1
		assert attempt.created_by_employee_id == 1
		assert attempt.payload_hash == hashlib.sha256(
			attempt.payload_json.encode("utf-8")
		).hexdigest()
		assert "realm-secret" not in attempt.payload_json
		assert transaction.quickbooks_invoice_id == "invoice-returned"
		assert transaction.quickbooks_invoice_number == "INV-41"
		assert transaction.quickbooks_invoice_status == "succeeded"
		assert transaction.quickbooks_realm_fingerprint == hashlib.sha256(
			b"realm-secret"
		).hexdigest()
		assert transaction.quickbooks_last_synced_at is not None

		transaction.quickbooks_invoice_id = None
		transaction.quickbooks_invoice_number = None
		session.commit()
		replayed = service.create_invoice(
			transaction=transaction,
			line_items=[{"description": "Pump package", "amount": 1250.0, "quantity": 1}],
			notes="RFQ: 44",
			qb_client=SimpleNamespace(company_id="realm-secret"),
			currency="USD",
		)
		assert replayed["created"] is False
		assert request_ids == [attempt.request_id]
		assert transaction.quickbooks_invoice_id == "invoice-returned"


def test_unknown_attempt_retries_same_request_and_rejects_payload_drift(
	app,
	monkeypatch,
	mocked_sdk,
):
	with database.db_session() as session:
		_, transaction = _add_transaction(session, name="Retry Client")
		service = QuickBooksService(session)
		monkeypatch.setattr(
			service,
			"find_or_create_customer",
			MagicMock(return_value="customer-1"),
		)
		monkeypatch.setattr(
			service,
			"_get_service_item",
			MagicMock(return_value={"value": "item-1", "name": "IDC Services"}),
		)
		save_invoice = MagicMock(side_effect=TimeoutError("outcome unknown"))
		monkeypatch.setattr(service_module.Invoice, "save", save_invoice)
		line_items = [{"description": "Pump package", "amount": 1250.0, "quantity": 1}]

		with pytest.raises(TimeoutError):
			service.create_invoice(
				transaction,
				line_items,
				qb_client=SimpleNamespace(company_id="realm"),
			)
		attempt = session.query(QuickBooksInvoiceAttempt).one()
		assert attempt.status == "unknown"
		assert attempt.attempt_count == 1
		original_request_id = save_invoice.call_args.kwargs["request_id"]

		with pytest.raises(QuickBooksInvoiceAttemptConflict):
			service.create_invoice(
				transaction,
				[{"description": "Pump package", "amount": 1300.0, "quantity": 1}],
				qb_client=SimpleNamespace(company_id="realm"),
			)
		assert save_invoice.call_count == 1

		save_invoice.side_effect = None
		save_invoice.return_value = SimpleNamespace(
			Id="invoice-retry",
			DocNumber="INV-RETRY",
			TotalAmt="1250.00",
		)
		result = service.create_invoice(
			transaction,
			line_items,
			qb_client=SimpleNamespace(company_id="realm"),
		)
		assert result["created"] is True
		assert save_invoice.call_args.kwargs["request_id"] == original_request_id
		assert attempt.status == "succeeded"
		assert attempt.attempt_count == 2


def test_invoice_attachments_are_rejected_before_any_attempt(
	app,
	mocked_sdk,
):
	with database.db_session() as session:
		_, transaction = _add_transaction(session, name="Attachment Client")
		service = QuickBooksService(session)
		with pytest.raises(QuickBooksAttachmentsDisabledError):
			service.create_invoice(
				transaction,
				[{"description": "Line", "amount": 1, "quantity": 1}],
				attach_documents=True,
				qb_client=SimpleNamespace(company_id="realm"),
			)
		assert session.query(QuickBooksInvoiceAttempt).count() == 0


def test_request_id_is_stable_and_bounded_for_unusually_large_ids():
	transaction_id = int("9" * 100)
	assert _invoice_request_id(transaction_id) == _invoice_request_id(transaction_id)
	assert len(_invoice_request_id(transaction_id)) <= 50


def test_database_enforces_single_quickbooks_company_connection(app):
	now = _utcnow()
	with pytest.raises(IntegrityError):
		with database.db_session() as session:
			session.add_all([
				QuickBooksToken(
					singleton_key=1,
					realm_id="realm-a",
					access_token="access-a",
					refresh_token="refresh-a",
					token_expires_at=now + timedelta(hours=1),
					refresh_expires_at=now + timedelta(days=30),
				),
				QuickBooksToken(
					singleton_key=1,
					realm_id="realm-b",
					access_token="access-b",
					refresh_token="refresh-b",
					token_expires_at=now + timedelta(hours=1),
					refresh_expires_at=now + timedelta(days=30),
				),
			])
