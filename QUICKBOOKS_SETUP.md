# QuickBooks Online Invoice Integration - Setup Guide

## Overview

This integration allows you to create invoices in QuickBooks Online directly from your IDC Energy Database transactions. When you click "Create Invoice in QuickBooks" on the Financials tab, the system will:

1. Find or create a QuickBooks Customer from your Client
2. Generate an invoice with line items from supplier quotes and associated costs
3. Attach transaction documents (PDFs) to the invoice
4. Store the QuickBooks invoice ID and number in your transaction record

---

## Prerequisites

### 1. QuickBooks Online Account
- You must have an active QuickBooks Online account
- Must be a Company Administrator or have invoice creation permissions

### 2. QuickBooks Developer Account
You need to create a QuickBooks app to get API credentials:

1. Go to [QuickBooks Developer Portal](https://developer.intuit.com/)
2. Sign in with your Intuit account
3. Click "Create an app" → "QuickBooks Online and Payments"
4. Fill in app details:
   - App Name: "IDC Energy Database"
   - Description: "Invoice management integration"
5. Once created, go to "Keys & OAuth" tab

---

## Setup Steps

### Step 1: Get QuickBooks API Credentials

From the QuickBooks Developer Portal:

1. Copy your **Client ID**
2. Copy your **Client Secret**
3. Set **Redirect URI** to: `https://idc-app.onrender.com/quickbooks/callback`
   - Or your custom backend URL + `/quickbooks/callback`
4. Enable **Accounting scope**

### Step 2: Configure Environment Variables on Render

Add these environment variables to your Render backend service:

```
QB_CLIENT_ID=<your_client_id_here>
QB_CLIENT_SECRET=<your_client_secret_here>
QB_REDIRECT_URI=https://idc-app.onrender.com/quickbooks/callback
QB_ENVIRONMENT=production
```

**For testing in sandbox:**
```
QB_ENVIRONMENT=sandbox
```

### Step 3: Run Database Migration

The QuickBooks integration requires new database columns:

**Via SQL (run on your RDS database):**
```sql
-- Add QB fields to clients table
ALTER TABLE clients ADD COLUMN quickbooks_customer_id VARCHAR;

-- Add QB fields to transactions table
ALTER TABLE transactions ADD COLUMN quickbooks_invoice_id VARCHAR;
ALTER TABLE transactions ADD COLUMN quickbooks_invoice_number VARCHAR;
ALTER TABLE transactions ADD COLUMN invoiced_at TIMESTAMP;

-- Create quickbooks_tokens table
CREATE TABLE quickbooks_tokens (
    id SERIAL PRIMARY KEY,
    realm_id VARCHAR NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMP NOT NULL,
    refresh_expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Or restart your Render backend** (it will auto-create tables via SQLAlchemy).

### Step 4: Connect QuickBooks (First Time Only)

1. Log in to your app as an **admin**
2. Navigate to Settings (or wherever you add the Connect button)
3. Call the OAuth endpoint:

```bash
# Get authorization URL
curl -X GET https://idc-app.onrender.com/quickbooks/auth/connect \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

4. Open the returned `authorization_url` in a browser
5. Log in to QuickBooks and authorize the app
6. You'll be redirected back - tokens are now stored!

---

## Usage

### Create an Invoice

1. Open a transaction in your app
2. Go to the **Financials** tab
3. Select a supplier quote (optional)
4. Add any associated costs (shipping, handling, etc.)
5. Click **"Create Invoice in QuickBooks"**

The invoice will be created with:
- **Customer**: Mapped from your Client (auto-created if doesn't exist)
- **Line Items**:
  - Selected supplier quote amount
  - All associated costs as separate lines
- **Invoice Notes**:
  - RFQ Number
  - Client PO Number
  - Supplier PO Number
- **Attachments**:
  - Client PO PDF (if uploaded)
  - Supplier PO PDF (if uploaded)

### Check Connection Status

```bash
curl -X GET https://idc-app.onrender.com/quickbooks/status \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

Returns:
```json
{
  "connected": true,
  "realm_id": "1234567890",
  "token_expires_at": "2025-10-23T10:30:00",
  "refresh_expires_at": "2026-01-31T10:30:00"
}
```

### Disconnect QuickBooks

```bash
curl -X POST https://idc-app.onrender.com/quickbooks/disconnect \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

---

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/quickbooks/auth/connect` | GET | Admin | Get OAuth authorization URL |
| `/quickbooks/callback` | GET | None | OAuth callback (handled by QB) |
| `/quickbooks/status` | GET | Admin | Check connection status |
| `/quickbooks/disconnect` | POST | Admin | Remove QB connection |
| `/quickbooks/transactions/:id/create-invoice` | POST | Admin | Create invoice for transaction |

### Create Invoice Request Body:

```json
{
  "selected_quote_id": 123,  // optional
  "include_associated_costs": true,
  "custom_notes": "Additional invoice notes"  // optional
}
```

---

## Troubleshooting

### "QuickBooks not connected" Error
- Check that you've completed the OAuth flow
- Verify QB_CLIENT_ID and QB_CLIENT_SECRET are set in Render
- Check connection status via `/quickbooks/status`

### "Token expired" Error
- Tokens refresh automatically
- If refresh token expired (after 100 days), reconnect via OAuth

### "Customer not found" Error
- The system will auto-create customers
- Verify your QB account has customer creation permissions

### "Invoice creation failed" Error
- Check that you have a "Services" item in QB (or it will auto-create)
- Verify invoice permissions in your QB account
- Check Render logs for detailed error messages

### "Already invoiced" Error
- Transaction already has a QB invoice
- Check `quickbooks_invoice_number` field in transaction record

---

## Token Management

- **Access Token**: Expires after 1 hour (auto-refreshed)
- **Refresh Token**: Expires after 100 days (requires re-authorization)
- Tokens are stored encrypted in the `quickbooks_tokens` table
- Only one QB company connection per app instance

---

## Security Notes

1. **Environment Variables**: Never commit QB credentials to git
2. **Admin Only**: All QB endpoints require admin role
3. **HTTPS Required**: OAuth callback must use HTTPS in production
4. **Token Storage**: Tokens stored in database, not in memory
5. **Automatic Refresh**: Access tokens refresh automatically before expiry

---

## Next Steps

After setup:
1. Test invoice creation with a sample transaction
2. Verify invoice appears in QuickBooks Online
3. Check that customer mapping works correctly
4. Test document attachments

For issues, check Render logs or contact support.
