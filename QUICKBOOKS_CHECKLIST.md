# QuickBooks Integration Setup Checklist

Use this checklist to complete your QuickBooks integration setup.

## ☐ 1. Create QuickBooks Developer App

- [ ] Go to https://developer.intuit.com/
- [ ] Sign in with Intuit account
- [ ] Click "Create an app" → "QuickBooks Online and Payments"
- [ ] Name: "IDC Energy Database"
- [ ] Note your **Client ID**: ___________________________
- [ ] Note your **Client Secret**: ___________________________
- [ ] Add Redirect URI: `https://idc-app.onrender.com/quickbooks/callback`
- [ ] Add Privacy Policy URL: `https://your-frontend.vercel.app/privacy-policy`
- [ ] Add EULA URL: `https://your-frontend.vercel.app/eula`
- [ ] Save settings

## ☐ 2. Configure Environment Variables

### On Render (Production):
- [ ] Go to Render dashboard → your backend service
- [ ] Navigate to "Environment" tab
- [ ] Add `QB_CLIENT_ID` = (your client ID)
- [ ] Add `QB_CLIENT_SECRET` = (your client secret)
- [ ] Add `QB_REDIRECT_URI` = `https://idc-app.onrender.com/quickbooks/callback`
- [ ] Add `QB_ENVIRONMENT` = `production`
- [ ] Click "Save Changes" (triggers redeploy)
- [ ] Wait for deployment to complete

### Locally (Optional - for testing):
- [ ] Edit `/idc-backend/.env`
- [ ] Add QuickBooks variables (see `.env.quickbooks.template`)
- [ ] Use `QB_ENVIRONMENT=sandbox` for testing
- [ ] Use `QB_REDIRECT_URI=http://localhost:5001/quickbooks/callback`

## ☐ 3. Run Database Migration

Choose one method:

### Method A: Migration Script
```bash
cd idc-backend
python scripts/migrate_quickbooks.py
```
- [ ] Script completed successfully
- [ ] No errors in output

### Method B: Direct SQL (if can't connect locally)
- [ ] Connect to AWS RDS via pgAdmin or AWS Console
- [ ] Run SQL from `scripts/migrate_quickbooks.py` comments
- [ ] Verify tables created: `quickbooks_tokens`
- [ ] Verify columns added to `clients` and `transactions`

## ☐ 4. Verify Backend Deployment

- [ ] Backend redeployed with new environment variables
- [ ] No deployment errors in Render logs
- [ ] Backend is accessible: `https://idc-app.onrender.com/health`
- [ ] QuickBooks routes registered (check logs for blueprint registration)

## ☐ 5. Connect QuickBooks (OAuth Flow)

### Get Admin Token:
- [ ] Log into your app at https://your-frontend.vercel.app
- [ ] Open browser DevTools → Console
- [ ] Run: `localStorage.getItem('access_token')`
- [ ] Copy the token: ___________________________

### Initiate OAuth:
```bash
curl -X GET https://idc-app.onrender.com/quickbooks/auth/connect \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```
- [ ] Command successful
- [ ] Received `authorization_url` in response
- [ ] Copy authorization URL: ___________________________

### Authorize in QuickBooks:
- [ ] Open authorization URL in browser
- [ ] Sign in to QuickBooks
- [ ] Review permissions
- [ ] Click "Authorize"
- [ ] Redirected back to your app
- [ ] URL shows `?qb=connected` (or similar)

## ☐ 6. Verify Connection

```bash
curl -X GET https://idc-app.onrender.com/quickbooks/status \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```
- [ ] Response shows `"connected": true`
- [ ] Response includes `realm_id`
- [ ] Response includes token expiration dates

## ☐ 7. Test Invoice Creation (Via UI)

- [ ] Open your app in browser
- [ ] Navigate to a transaction (or create a test one)
- [ ] Go to "Financials" tab
- [ ] Verify "Create Invoice in QuickBooks" button is visible
- [ ] Add a supplier quote (or ensure client PO amount is set)
- [ ] Add some associated costs (optional)
- [ ] Click "Create Invoice in QuickBooks"
- [ ] Success toast appears with invoice number
- [ ] Transaction page refreshes showing invoice info

### Verify in QuickBooks:
- [ ] Log into QuickBooks Online
- [ ] Navigate to Sales → Invoices
- [ ] Find the newly created invoice
- [ ] Verify customer name matches your client
- [ ] Verify line items are correct
- [ ] Verify amounts match
- [ ] Verify notes include RFQ/PO numbers

## ☐ 8. Test with Script (Optional - Local Only)

```bash
cd idc-backend

# Check connection
python test_quickbooks.py check-connection
# Expected: "QuickBooks is connected!"

# Create test data and run full test
python test_quickbooks.py full-test
# Expected: Creates test transaction and invoice
```
- [ ] Connection check passes
- [ ] Full test creates invoice successfully
- [ ] Invoice visible in QuickBooks

## ☐ 9. Test Error Scenarios

### Already Invoiced:
- [ ] Try creating invoice for same transaction again
- [ ] Verify error message: "Invoice already exists"

### Not Connected:
- [ ] Disconnect QB: `POST /quickbooks/disconnect`
- [ ] Try creating invoice
- [ ] Verify error: "QuickBooks not connected"
- [ ] Reconnect via OAuth flow

### Invalid Transaction:
- [ ] Try creating invoice for non-existent transaction ID
- [ ] Verify 404 error

## ☐ 10. Production Readiness

- [ ] All tests passed
- [ ] Documentation reviewed
- [ ] Team trained on invoice workflow
- [ ] Backup strategy for `quickbooks_tokens` table
- [ ] Token expiration monitoring set up (100 days)
- [ ] Admin access controls verified
- [ ] Logs reviewed for any warnings

## ☐ 11. Optional Enhancements

- [ ] Add QuickBooks connection status to Settings page
- [ ] Add "Connect QuickBooks" button in UI
- [ ] Add visual indicator when transaction is invoiced
- [ ] Add link to view invoice in QuickBooks
- [ ] Set up token expiration notifications
- [ ] Add webhook listeners for QB events

---

## Troubleshooting

If you encounter issues, refer to:
- `QUICKBOOKS_SETUP.md` - Full setup guide
- `QUICKBOOKS_NEXT_STEPS.md` - Step-by-step instructions
- Backend logs on Render
- QuickBooks API logs in developer portal
- `python test_quickbooks.py --help` for testing options

---

## Completion

- [ ] All steps completed successfully
- [ ] QuickBooks integration is live
- [ ] Team can create invoices from transactions

**Completed by:** ___________________________

**Date:** ___________________________

**Notes:**
