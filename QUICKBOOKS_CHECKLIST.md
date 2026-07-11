# QuickBooks v1 Readiness Checklist

## Intuit app

- [ ] Accounting scope is enabled.
- [ ] Sandbox and production credentials are not mixed.
- [ ] `QB_REDIRECT_URI` exactly matches an Intuit-registered callback.
- [ ] Production callback uses HTTPS.

## Secrets and configuration

- [ ] `QB_CLIENT_ID` and `QB_CLIENT_SECRET` are stored as secrets.
- [ ] `QB_ENVIRONMENT` is correct for the target company.
- [ ] `QB_TOKEN_ENCRYPTION_KEY` is a valid Fernet key.
- [ ] The Fernet key has a secure recovery copy separate from the database.
- [ ] `QB_SERVICE_ITEM_NAME` exactly matches an active existing `Service` item.
- [ ] The service item's income account and tax treatment are correct for IDC invoices.
- [ ] `FRONTEND_URL` points to the deployed frontend.
- [ ] `JWT_SECRET` is configured and protected.
- [ ] No credential or realm value is printed in deployment logs.

## Database

- [ ] The normal schema upgrade completed successfully.
- [ ] `quickbooks_tokens` enforces one singleton row and no duplicate legacy token rows exist.
- [ ] `quickbooks_oauth_states` exists with nonce hash, employee, expiry, and used time.
- [ ] `quickbooks_customer_mappings` has the client and realm-fingerprint uniqueness constraint.
- [ ] `quickbooks_invoice_attempts` has unique transaction and request ID constraints.
- [ ] Transaction invoice status, realm fingerprint, and last-synced columns exist.
- [ ] Database and encryption-key recovery have been tested together.
- [ ] Legacy token rows are backed up before migration.
- [ ] Stored credential fields use `qb:v1:` envelopes after first use.

## Automated verification

- [ ] `uv run --isolated --with-requirements requirements.txt pytest -q tests/test_qb_token_crypto.py tests/test_quickbooks_service.py tests/test_routes_quickbooks.py` passes.
- [ ] `uv run --isolated --with-requirements requirements-runtime.txt python -m py_compile quickbooks_service.py routes_quickbooks.py qb_token_crypto.py` passes.
- [ ] Tests use mocked SDK clients and block HTTP.
- [ ] The sandbox-only `test_quickbooks.py` smoke tool is not run under pytest or against production.

## OAuth sandbox validation

- [ ] Only an authenticated admin can request an authorization URL.
- [ ] Two connect attempts produce different signed states.
- [ ] Only a nonce hash is stored.
- [ ] Callback redirects to `<FRONTEND_URL>/quickbooks?connection=success`.
- [ ] Invalid, expired, or replayed state redirects with `connection=error`.
- [ ] Callback responses contain no custom HTML or error details.
- [ ] A state remains consumed when token exchange fails.
- [ ] Status reports connection and expiry times without realm or token fields.

## Invoice sandbox validation

- [ ] Invoice preview matches the intended customer-facing charges.
- [ ] A stale preview is rejected before any Intuit invoice request.
- [ ] The disposable transaction is USD; non-USD invoice creation is rejected in v1.
- [ ] The sandbox result confirms the intended tax behavior and final total.
- [ ] Supplier quote remains internal margin context.
- [ ] Only selected associated costs are billed.
- [ ] Customer-entered memo text is at most 650 characters and the combined QuickBooks memo is at most 1,000.
- [ ] Every invoice line description is at most 4,000 characters.
- [ ] A non-USD supplier quote is displayed as context but excluded from the USD margin basis.
- [ ] Supplier PO details are absent from the customer memo.
- [ ] The configured existing service item is used.
- [ ] Missing service item fails without creating an item or income account.
- [ ] No invoice attachment is attempted.
- [ ] Customer mapping is stored against the current realm fingerprint.
- [ ] The transaction row is locked through the invoice request.
- [ ] A durable attempt is present before the invoice request.
- [ ] Request ID is stable and no longer than 50 characters.
- [ ] Success uses the object returned by `Invoice.save`.
- [ ] Success updates attempt result and all transaction synchronization fields.
- [ ] A repeated successful operation does not create a second invoice.
- [ ] A changed payload or realm is rejected for an existing attempt.
- [ ] An uncertain outcome is `unknown` and retries with the same request ID.

## Disconnect and release

- [ ] Remote Intuit revocation occurs before local deletion.
- [ ] Revocation failure preserves the local token row and returns `502`.
- [ ] Sandbox evidence has been reviewed before switching to production credentials.
- [ ] No `pending` or `unknown` attempts are left unresolved at launch.
- [ ] Operations staff know that attachments and automatic item creation are not supported in v1.
