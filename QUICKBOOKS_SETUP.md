# QuickBooks Online v1 Setup

## Supported behavior

The backend can connect one QuickBooks Online company and create customer invoices from approved IDC transactions. The v1 integration:

- encrypts the access token, rotating refresh token, and company realm at rest;
- uses a persisted, signed, single-use OAuth state;
- scopes customer mappings to a one-way company fingerprint;
- records a durable invoice attempt before calling Intuit;
- uses a stable Intuit `requestid` for safe retries;
- requires an existing QuickBooks service item;
- revokes the Intuit grant before deleting local credentials; and
- does not upload invoice attachments.

The status API and callback never return the QuickBooks realm, access token, or refresh token.

## 1. Create the Intuit app

Create a QuickBooks Online app in the Intuit Developer Portal and enable the Accounting scope. Start with sandbox credentials.

Register the exact backend callback URL:

```text
https://idc-app.onrender.com/quickbooks/callback
```

For local sandbox work, register a separate allowed callback such as:

```text
http://localhost:5001/quickbooks/callback
```

## 2. Prepare QuickBooks

Create or select one active QuickBooks item with type `Service`. Its name must exactly match `QB_SERVICE_ITEM_NAME`. Configure its intended income-account and tax treatment in QuickBooks; the backend will not create an item, choose an income account, or calculate sales tax.

## 3. Configure the backend

Set these values in Render for production:

```bash
QB_CLIENT_ID=<intuit-production-client-id>
QB_CLIENT_SECRET=<intuit-production-client-secret>
QB_REDIRECT_URI=https://idc-app.onrender.com/quickbooks/callback
QB_ENVIRONMENT=production
QB_TOKEN_ENCRYPTION_KEY=<fernet-key>
QB_SERVICE_ITEM_NAME=Services
FRONTEND_URL=https://www.idcenergy.co
JWT_SECRET=<existing-application-signing-secret>
```

Generate the Fernet key once in a protected environment:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Store that key as a secret and back it up securely. Do not replace it casually: existing encrypted credentials require the same key. `QB_TOKEN_ENCRYPTION_KEY` is mandatory when either the QuickBooks or application environment is production.

Local sandbox configuration uses `QB_ENVIRONMENT=sandbox`, sandbox credentials, the local callback, and the local frontend URL. Using an encryption key locally is strongly recommended and exercises the production storage path.

## 4. Apply the schema upgrade

Deployment must run the repository's schema upgrade before the app starts:

```bash
cd idc-backend
python scripts/ddl_upgrade.py
```

Verify that the database contains:

- encrypted-value columns in `quickbooks_tokens`;
- `quickbooks_oauth_states` for nonce hashes and one-time consumption;
- `quickbooks_customer_mappings` for client and realm-fingerprint mappings;
- `quickbooks_invoice_attempts` for request ID, payload, status, actor, and result; and
- a database-enforced singleton key in `quickbooks_tokens`, allowing exactly one connected company; and
- the QuickBooks status, realm fingerprint, and last-synced columns on `transactions`.

If the singleton upgrade detects multiple legacy token rows, it fails instead of choosing or deleting credentials. Reconcile those rows manually before redeploying.

The encrypted values use a `qb:v1:` envelope in the existing token columns. If legacy plaintext values exist and a key is configured, the service locks the token row, decrypts all fields first, and then migrates the plaintext fields to encrypted envelopes. A bad key or malformed envelope fails closed instead of overwriting data.

## 5. Connect the company

Use the QuickBooks settings page while signed in as an IDC admin. `GET /quickbooks/auth/connect` returns the Intuit authorization URL to the authenticated browser session.

The state token contains a random nonce, purpose, and user identity. Only its SHA-256 hash is stored. Callback processing locks and consumes that record before exchanging the authorization code, so a callback cannot be replayed even if Intuit exchange fails.

Every callback returns an empty `302` response to one of:

```text
<FRONTEND_URL>/quickbooks?connection=success
<FRONTEND_URL>/quickbooks?connection=error
```

No callback error detail is sent to the browser.

## 6. Verify status

From an authenticated admin session, call:

```text
GET /quickbooks/status
```

Connected response shape:

```json
{
  "connected": true,
  "token_expires_at": "2030-01-01T00:00:00",
  "refresh_expires_at": "2030-04-01T00:00:00"
}
```

The response intentionally omits realm and credential values.

## 7. Create invoices

Use the invoice preview first, then submit the same selections to creation:

```text
POST /quickbooks/transactions/<transaction_id>/invoice-preview
POST /quickbooks/transactions/<transaction_id>/create-invoice
```

Request body:

```json
{
  "selected_quote_id": 123,
  "billable_cost_ids": [10, 11],
  "custom_notes": "Customer-visible note",
  "preview_hash": "<hash returned by invoice-preview>"
}
```

Invoice behavior is deliberately narrow:

- The client PO amount is the main billable line; client quote amount is a fallback when no positive PO amount exists.
- Only explicitly selected associated costs become customer invoice lines.
- A selected supplier quote is margin context only and is not billed.
- Supplier PO details remain internal.
- Notes can contain the RFQ, client PO, and explicit custom text.
- Custom memo text is limited to 650 characters so the automatically added references remain within Intuit's 1,000-character invoice memo limit.
- Invoice line descriptions are limited to Intuit's 4,000-character line limit.
- All lines use the configured existing service item.
- Version 1 accepts USD transactions only and does not perform currency conversion.
- A non-USD supplier quote remains visible as internal context but is excluded from the USD margin calculation; the stored USD supplier PO amount is used instead.
- QuickBooks controls any tax behavior associated with the configured company, customer, and service item; verify the result in sandbox.
- No documents or other attachments are uploaded in v1.

These boundaries follow Intuit's published limits for [50-character request IDs](https://developer.intuit.com/app/developer/qbpayments/docs/learn/learn-basic-field-definitions), [1,000-character invoice customer messages](https://static.developer.intuit.com/sdkdocs/qbv3doc/ippdotnetdevkitv3/html/e0ffd4e3-92c0-52fc-831e-b242d1abde97.htm), and [4,000-character invoice line descriptions](https://static.developer.intuit.com/sdkdocs/qbv3doc/ippdotnetdevkitv3/html/813f453b-2705-24b7-d9a1-62f8bc4681db.htm).

The transaction row is locked during creation. Before the invoice request, the backend persists a canonical payload hash and JSON plus a stable request ID of at most 50 characters. Attempt states are `pending`, `succeeded`, `failed`, and `unknown`. An unknown outcome can be retried only against the same realm fingerprint and payload; Intuit receives the same request ID.

Creation also compares the submitted preview hash with a fresh server-side plan. If transaction amounts, selected costs, quote context, or customer memo changed after review, creation returns `invoice_preview_stale` and sends nothing to Intuit.

On success, the attempt result and transaction invoice ID, number, status, realm fingerprint, invoice time, and last-synced time are committed together.

## 8. Disconnect

Use the authenticated admin settings page or:

```text
POST /quickbooks/disconnect
```

Cookie-authenticated mutations require the application's CSRF header. The backend first calls Intuit revocation with the decrypted refresh token. Local credentials are deleted only after revocation succeeds; a remote failure returns `502` and preserves the local record.

## Testing policy

Automated tests must never call Intuit. Run the mocked suite:

```bash
cd idc-backend
uv run --isolated --with-requirements requirements.txt pytest -q tests/test_qb_token_crypto.py tests/test_quickbooks_service.py tests/test_routes_quickbooks.py
```

The tests replace both SDK clients and fail any attempted HTTP request. The root-level `test_quickbooks.py` script performs live sandbox data operations and is never part of pytest. It now reuses the production invoice planner, but run it only with `QB_ENVIRONMENT=sandbox` and the explicit `QB_ALLOW_SANDBOX_SMOKE=true` gate.

Perform manual end-to-end validation only in an Intuit sandbox with an approved disposable transaction. Confirm the customer, service item, amount, memo, and invoice number directly in QuickBooks.

The public Intuit application URLs are:

```text
Host domain: idcenergy.co
Launch URL: https://www.idcenergy.co/quickbooks
Connect/reconnect URL: https://www.idcenergy.co/quickbooks
Disconnect URL: https://www.idcenergy.co/quickbooks/disconnected
Privacy Policy: https://www.idcenergy.co/privacy-policy
EULA: https://www.idcenergy.co/eula
```

## Troubleshooting

- `QB_TOKEN_ENCRYPTION_KEY is required`: configure a valid Fernet key before production starts.
- Credential decryption failure: restore the key that encrypted the current `qb:v1:` values; do not reconnect or overwrite rows until the key issue is understood.
- Service item not found: create an active QuickBooks `Service` item whose name exactly matches `QB_SERVICE_ITEM_NAME`.
- `invoice_attempt_conflict`: the company or approved payload differs from the durable first attempt. Do not bypass the attempt row; reconcile the original operation first.
- `invoice_configuration_error`: verify the connected company and configured service item; no invoice request was accepted.
- `invoice_outcome_unknown`: Intuit may have received the request. Verify QuickBooks first, then retry only the unchanged preview so the same request ID is reused.
- Attempt status `unknown`: retry the unchanged operation so the same Intuit request ID is reused, then verify the result in QuickBooks.
- Disconnect returns `502`: Intuit revocation failed and local credentials were intentionally retained.
