import base64

import pytest

import routes_transaction_extras
import database
from conftest import csrf_headers, login
from models import Document, Transaction


def test_document_decoder_accepts_matching_pdf_signature():
	content = b"%PDF-1.7\nvalidated"
	decoded = routes_transaction_extras._decode_document(
		base64.b64encode(content).decode(),
		"application/pdf",
	)
	assert decoded == content


def test_document_decoder_rejects_mime_spoofing():
	content = base64.b64encode(b"<script>alert(1)</script>").decode()
	with pytest.raises(ValueError, match="document_type_mismatch"):
		routes_transaction_extras._decode_document(content, "application/pdf")


def test_document_decoder_rejects_invalid_base64():
	with pytest.raises(ValueError, match="invalid_document_encoding"):
		routes_transaction_extras._decode_document("not base64!", "application/pdf")


def test_purchase_order_upload_saves_file_and_reference_atomically(client):
	assert login(client).status_code == 200
	created_client = client.post(
		"/api/clients",
		headers=csrf_headers(client),
		json={"name": "Document Client"},
	).get_json()
	transaction = client.post(
		"/api/transactions",
		headers=csrf_headers(client),
		json={"client_id": created_client["id"], "item_description": "Document test"},
	).get_json()
	content = b"%PDF-1.7\nvalidated"

	response = client.post(
		f"/api/transactions/{transaction['id']}/documents",
		headers=csrf_headers(client),
		json={
			"category": "client-po",
			"name": "client-po.pdf",
			"mime_type": "application/pdf",
			"content_base64": base64.b64encode(content).decode(),
			"po_number": "PO-1001",
		},
	)
	assert response.status_code == 201

	with database.db_session() as session:
		stored_transaction = session.get(Transaction, transaction["id"])
		stored_document = session.get(Document, response.get_json()["id"])
		assert stored_transaction.client_po_number == "PO-1001"
		assert stored_document.content == content
		assert stored_document.uploaded_by == "Primary Admin"

	metadata = client.get(f"/api/transactions/{transaction['id']}/documents").get_json()["items"]
	assert metadata[0]["name"] == "client-po.pdf"
	assert "content" not in metadata[0]
