const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5001";

function authHeaders() {
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export interface TransactionOut {
  id: number;
  client_id: number;
  rfq_number?: string | null;
  client_po_number?: string | null;
  supplier_po_number?: string | null;
  client_po_amount?: number | null;
  supplier_po_amount?: number | null;
  date_received?: string | null;
  item_description?: string | null;
  status?: string | null;
  client_quote_amount?: number | null;
  client_quote_currency?: string | null;
}

export type TransactionCreate = {
  client_id: number;
  rfq_number?: string | null;
  date_received?: string | null;
  item_description?: string | null;
  client_quote_amount?: number | null;
  client_quote_currency?: string | null;
};

export interface ClientOut {
  id: number;
  name: string;
}

export interface SupplierQuoteOut {
  id: number;
  supplier_id: number;
  supplier_name?: string;
  amount: number;
  currency?: string | null;
  lead_time_days?: number | null;
  notes?: string | null;
  created_at: string;
}

export interface AssociatedCostOut {
  id: number;
  description: string;
  amount: number;
  status: 'paid' | 'due' | 'overdue';
  created_at: string;
}

export interface QuickBooksStatus {
  connected: boolean;
  realm_id?: string;
  token_expires_at?: string;
  refresh_expires_at?: string;
}

export interface QuickBooksAuthorization {
  authorization_url: string;
}

export function documentDownloadUrl(transactionId: number, documentId: number): string {
  return `${API_BASE}/api/transactions/${transactionId}/documents/${documentId}/download`;
}

export async function fetchTransactions(page = 1, size = 20): Promise<{ items: TransactionOut[]; page: number; size: number; }> {
  const res = await fetch(`${API_BASE}/api/transactions?page=${page}&size=${size}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`Failed to fetch transactions: ${res.status}`);
  return res.json();
}

export async function createTransaction(payload: TransactionCreate): Promise<TransactionOut> {
  const res = await fetch(`${API_BASE}/api/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create transaction");
  return res.json();
}

export async function fetchTransaction(id: number): Promise<TransactionOut> {
  const res = await fetch(`${API_BASE}/api/transactions/${id}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`Transaction ${id} not found`);
  return res.json();
}

export async function updateTransaction(id: number, payload: Partial<Pick<TransactionOut, "status" | "item_description" | "client_quote_amount" | "client_quote_currency" | "client_po_amount" | "supplier_po_amount">>): Promise<TransactionOut> {
  const res = await fetch(`${API_BASE}/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update transaction ${id}`);
  return res.json();
}

export async function deleteTransaction(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/transactions/${id}`, { method: 'DELETE', headers: { ...authHeaders() } });
  if (!res.ok && res.status !== 204) throw new Error('Failed to delete transaction');
}

export async function fetchClients(): Promise<{ items: ClientOut[] }> {
  const res = await fetch(`${API_BASE}/api/clients`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`Failed to fetch clients`);
  return res.json();
}

export async function fetchSuppliers(): Promise<{ items: ClientOut[] }> {
  const res = await fetch(`${API_BASE}/api/suppliers`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`Failed to fetch suppliers`);
  return res.json();
}

// Documents
export async function listDocuments(transactionId: number): Promise<{ items: Array<{ id: number; category: string; name: string; uploaded_by?: string; uploaded_at: string; mime_type?: string | null; size_bytes?: number | null; }>}> {
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/documents`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch documents");
  return res.json();
}

export async function createDocument(transactionId: number, payload: { category: string; name: string; uploaded_by?: string; }): Promise<{ id: number; }>{
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create document");
  return res.json();
}

// Shipment
export async function getShipment(transactionId: number): Promise<Partial<{ lead_time_days: number; tracking_number: string; shipped_date: string; eta_date: string }>> {
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/shipment`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to get shipment");
  return res.json();
}

export async function upsertShipment(transactionId: number, payload: Partial<{ lead_time_days: number; tracking_number: string; shipped_date: string; eta_date: string }>): Promise<{ ok: boolean }>{
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/shipment`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update shipment");
  return res.json();
}

// Activity
export async function listActivity(transactionId: number): Promise<{ items: Array<{ id: number; action: string; details?: string; created_at: string; }>}> {
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/activity`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch activity");
  return res.json();
}

export async function addActivity(transactionId: number, payload: { action: string; details?: string }): Promise<{ ok: boolean }>{
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/activity`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to add activity");
  return res.json();
}

// Suppliers link
export async function getTransactionSuppliers(transactionId: number): Promise<{ items: ClientOut[] }>{
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/suppliers`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch transaction suppliers");
  return res.json();
}

export async function addTransactionSupplier(transactionId: number, supplier_id: number): Promise<{ ok: boolean }>{
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/suppliers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ supplier_id }),
  });
  if (!res.ok) throw new Error("Failed to add transaction supplier");
  return res.json();
}

export async function updateRefs(transactionId: number, payload: { rfq_number?: string; client_po_number?: string; supplier_po_number?: string }): Promise<{ ok: boolean }>{
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/refs`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update references");
  return res.json();
}

export async function uploadDocument(transactionId: number, payload: { category: string; name: string; mime_type?: string; size_bytes?: number; content_base64?: string; uploaded_by?: string }): Promise<{ id: number }>{
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to upload document");
  return res.json();
} 

export async function deleteDocument(transactionId: number, documentId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/documents/${documentId}`, { method: 'DELETE', headers: { ...authHeaders() } });
  if (!res.ok && res.status !== 204) throw new Error('Failed to delete document');
}

// Supplier quotes
export async function listSupplierQuotes(transactionId: number): Promise<{ items: SupplierQuoteOut[] }>{
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/quotes`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error('Failed to fetch supplier quotes');
  return res.json();
}

export async function createSupplierQuote(transactionId: number, payload: { supplier_id: number; amount: number; currency?: string; lead_time_days?: number; notes?: string }): Promise<{ id: number }>{
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create supplier quote');
  return res.json();
}

// Associated costs
export async function listAssociatedCosts(transactionId: number): Promise<{ items: AssociatedCostOut[] }>{
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/costs`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error('Failed to fetch costs');
  return res.json();
}

export async function createAssociatedCost(transactionId: number, payload: { description: string; amount: number; status?: 'paid'|'due'|'overdue' }): Promise<{ id: number }>{
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/costs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to create cost');
  return res.json();
}

export async function updateAssociatedCost(transactionId: number, costId: number, payload: Partial<{ description: string; amount: number; status: 'paid'|'due'|'overdue' }>): Promise<{ ok: boolean }>{
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/costs/${costId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to update cost');
  return res.json();
}

export async function deleteAssociatedCost(transactionId: number, costId: number): Promise<void>{
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/costs/${costId}`, { method: 'DELETE', headers: { ...authHeaders() } });
  if (!res.ok && res.status !== 204) throw new Error('Failed to delete cost');
}

export async function getQuickBooksStatus(): Promise<QuickBooksStatus> {
  const res = await fetch(`${API_BASE}/quickbooks/status`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`Failed to fetch QuickBooks status: ${res.status}`);
  return res.json();
}

export async function getQuickBooksAuthorizationUrl(): Promise<QuickBooksAuthorization> {
  const res = await fetch(`${API_BASE}/quickbooks/auth/connect`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`Failed to start QuickBooks connection: ${res.status}`);
  return res.json();
}

export async function disconnectQuickBooks(): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/quickbooks/disconnect`, {
    method: 'POST',
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error(`Failed to disconnect QuickBooks: ${res.status}`);
  return res.json();
}
