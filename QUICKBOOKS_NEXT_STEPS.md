# QuickBooks v1 Rollout Steps

The backend safety implementation is ready for sandbox validation, not an unreviewed production launch. Complete these steps in order.

## 1. Confirm deployment configuration

Set and protect:

```text
QB_CLIENT_ID
QB_CLIENT_SECRET
QB_REDIRECT_URI
QB_ENVIRONMENT
QB_TOKEN_ENCRYPTION_KEY
QB_SERVICE_ITEM_NAME
FRONTEND_URL
JWT_SECRET
```

Production requires a valid Fernet key. Preserve the key separately from the database backup because both are required to recover the connection.

## 2. Prepare the QuickBooks company

Create the configured item as an active QuickBooks `Service` item with the intended income account and tax settings. The integration does not create items, guess an income account, calculate tax, or convert currency. Version 1 accepts USD transactions only.

Use sandbox credentials and a disposable company first. Register the callback URL exactly as configured in `QB_REDIRECT_URI`.

## 3. Upgrade and verify the database

Run the normal deployment schema upgrade and confirm the token singleton, OAuth state, customer mapping, and invoice attempt constraints exist. Confirm the three new transaction synchronization columns are present. If more than one legacy token row exists, the upgrade intentionally stops for manual reconciliation.

If `quickbooks_tokens` already contains plaintext, back up the database and encryption key before the first request. With the key configured, the first credential read migrates all legacy fields under a token-row lock. Check for `qb:v1:` envelopes without printing or exporting their values.

## 4. Run automated verification

```bash
cd idc-backend
uv run --isolated --with-requirements requirements.txt pytest -q tests/test_qb_token_crypto.py tests/test_quickbooks_service.py tests/test_routes_quickbooks.py
uv run --isolated --with-requirements requirements-runtime.txt python -m py_compile quickbooks_service.py routes_quickbooks.py qb_token_crypto.py
```

These tests are fully mocked and block HTTP. The optional `test_quickbooks.py` smoke tool is sandbox-only, requires `QB_ALLOW_SANDBOX_SMOKE=true`, and must never run against production.

## 5. Validate OAuth in sandbox

1. Sign in to IDC as an admin.
2. Start connection from the QuickBooks settings page.
3. Authorize the sandbox company.
4. Confirm the browser lands on `/quickbooks?connection=success`.
5. Confirm `/quickbooks/status` reports `connected: true` without realm or token fields.
6. Replay the callback URL and confirm it redirects with `connection=error`.

## 6. Validate one sandbox invoice

1. Create a disposable IDC transaction with a positive client PO amount.
2. Preview the invoice.
3. Select only costs that should be billed to the customer.
4. Confirm customer memo text is 650 characters or fewer and all invoice line descriptions are 4,000 characters or fewer.
5. If a selected supplier quote is not USD, confirm it is excluded from the USD margin basis.
6. Create the invoice once.
7. Confirm the configured service item, customer, amount, and memo in QuickBooks.
8. Confirm no attachment was uploaded.
9. Confirm the local attempt is `succeeded` and the transaction synchronization fields are populated.
10. Repeat the create action and confirm no second invoice is created.

Exercise a mocked timeout or controlled sandbox failure before production. An uncertain invoice result must remain `unknown` and retry with the same request ID and unchanged payload.

## 7. Validate disconnect

Disconnect from the admin settings page. Confirm remote revocation succeeds before the local token row disappears. If Intuit is unavailable, expect `502` and confirm the local token row remains.

## 8. Production decision

Move to production credentials only after the sandbox evidence is reviewed. Recheck callback URLs, frontend URL, service item name, encryption-key backup, database backup, admin access, and the absence of pending or unknown sandbox attempts.

Attachments, automatic service-item creation, non-USD invoices, multi-company connections, webhook reconciliation, and arbitrary replay with changed invoice data are outside v1 scope.
