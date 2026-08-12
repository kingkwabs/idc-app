const configuredApiBase = import.meta.env.VITE_API_BASE?.trim();

export const API_BASE = (
  import.meta.env.DEV ? configuredApiBase || "http://localhost:5001" : "/api"
).replace(/\/+$/, "");

export const API_UNAUTHORIZED_EVENT = "idc:unauthorized";
export const UNAUTHORIZED_EVENT = API_UNAUTHORIZED_EVENT;

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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
  quickbooks_invoice_id?: string | null;
  quickbooks_invoice_number?: string | null;
  quickbooks_invoice_status?: "not_created" | "pending" | "succeeded" | "unknown" | "failed" | null;
  quickbooks_last_synced_at?: string | null;
  invoiced_at?: string | null;
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
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface ClientCreate {
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

export type ClientUpdate = Partial<ClientCreate>;

export interface ClientMetricOut {
  id: number;
  name: string;
  active_transactions: number;
  completed_transactions: number;
  total_revenue: number;
}

export interface SupplierOut {
  id: number;
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  category?: string | null;
  notes?: string | null;
}

export interface SupplierCreate {
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  category?: string | null;
  notes?: string | null;
}

export type SupplierUpdate = Partial<SupplierCreate>;

export interface SupplierMetricOut {
  id: number;
  name: string;
  sourcing_records: number;
  active_transactions: number;
  quotes: number;
  last_quoted?: string | null;
}

export interface SupplierSummary {
  total_suppliers: number;
  engaged_suppliers: number;
  total_spend: number;
}

export interface SupplierOverviewQuote {
  id: number;
  amount: number;
  currency?: string | null;
  lead_time_days?: number | null;
  notes?: string | null;
  created_at: string;
}

export interface SupplierSourcingRecord {
  transaction_id: number;
  client_id: number;
  client_name: string;
  rfq_number?: string | null;
  date_received?: string | null;
  item_description?: string | null;
  status?: string | null;
  quotes: SupplierOverviewQuote[];
}

export interface SupplierOverview {
  supplier: SupplierOut;
  summary: {
    sourcing_records: number;
    active_transactions: number;
    quotes: number;
  };
  items: SupplierSourcingRecord[];
}

export interface TransactionSummary {
  active_count: number;
  total_revenue: number;
}

export interface TransactionYearCount {
  year: number | null;
  count: number;
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
  status: "paid" | "due" | "overdue";
  created_at: string;
}

export interface QuickBooksStatus {
  connected: boolean;
  token_expires_at?: string;
  refresh_expires_at?: string;
}

export interface QuickBooksAuthorization {
  authorization_url: string;
}

export interface QuickBooksInvoicePayload {
  selected_quote_id?: number | null;
  billable_cost_ids?: number[];
  custom_notes?: string;
  preview_hash?: string;
}

export interface QuickBooksInvoiceLineItem {
  description: string;
  amount: number;
  quantity: number;
  source: "client_billable_amount" | "associated_cost";
  reference?: string;
  cost_id?: number;
  billable: boolean;
}

export interface QuickBooksInvoicePreview {
  transaction_id: number;
  currency: string;
  preview_hash: string;
  can_create: boolean;
  already_invoiced: boolean;
  invoice_id?: string | null;
  invoice_number?: string | null;
  invoice_customer_name?: string | null;
  line_items: QuickBooksInvoiceLineItem[];
  billable_cost_ids: number[];
  selected_supplier_quote?: {
    id: number;
    supplier_id: number;
    supplier_name?: string | null;
    amount: number;
    currency: string;
    lead_time_days?: number | null;
  } | null;
  totals: {
    client_billable_amount: number;
    billable_costs_total: number;
    invoice_total: number;
    internal_supplier_quote_total: number;
    internal_supplier_po_amount: number;
    internal_supplier_cost_basis: number;
    internal_associated_costs_total: number;
    estimated_margin: number;
  };
  notes: string;
  errors: string[];
  warnings: string[];
}

export interface QuickBooksInvoiceCreateResult {
  message: string;
  invoice_id: string;
  invoice_number: string;
  total: string;
  invoice_preview: QuickBooksInvoicePreview;
}

export interface ApiErrorPayload {
  error?: string;
  details?: string | Array<string | { field?: string; message?: string }>;
  errors?: string[];
  warnings?: string[];
  invoice_number?: string;
  invoice_preview?: QuickBooksInvoicePreview;
}

export type EmployeeRole = "admin" | "employee";

export interface Employee {
  id: number;
  name: string;
  email: string;
  role: EmployeeRole;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string | null;
  last_login_at: string | null;
}

export interface UnauthorizedEventDetail {
  path: string;
  status: 401;
}

export class ApiError extends Error {
  readonly status: number;
  readonly payload: ApiErrorPayload;

  constructor(status: number, payload: ApiErrorPayload, fallbackMessage?: string) {
    super(errorMessage(payload, fallbackMessage || `Request failed with status ${status}`));
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(payload: unknown, fallbackMessage: string): string {
  if (!isRecord(payload)) return fallbackMessage;

  if (typeof payload.details === "string" && payload.details.trim()) {
    return payload.details;
  }

  if (Array.isArray(payload.details)) {
    const details = payload.details
      .map((detail) => {
        if (typeof detail === "string") return detail;
        if (isRecord(detail) && typeof detail.message === "string") return detail.message;
        return null;
      })
      .filter((detail): detail is string => Boolean(detail));
    if (details.length > 0) return details.join(" ");
  }

  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }

  return fallbackMessage;
}

async function readErrorPayload(response: Response): Promise<ApiErrorPayload> {
  try {
    const payload: unknown = await response.json();
    return isRecord(payload)
      ? (payload as ApiErrorPayload)
      : { error: `Request failed with status ${response.status}` };
  } catch {
    return { error: `Request failed with status ${response.status}` };
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;

  const prefix = `${encodeURIComponent(name)}=`;
  const entry = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!entry) return undefined;
  try {
    return decodeURIComponent(entry.slice(prefix.length));
  } catch {
    return entry.slice(prefix.length);
  }
}

function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}/${path.replace(/^\/+/, "")}`;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  fallbackMessage?: string,
): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers);

  headers.set("Accept", "application/json");
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (UNSAFE_METHODS.has(method)) {
    const csrfToken = readCookie("idc_csrf");
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    const payload = await readErrorPayload(response);
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent<UnauthorizedEventDetail>(API_UNAUTHORIZED_EVENT, {
        detail: { path, status: 401 },
      }));
    }
    throw new ApiError(response.status, payload, fallbackMessage);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export function documentDownloadUrl(transactionId: number, documentId: number): string {
  return apiUrl(`/api/transactions/${transactionId}/documents/${documentId}/download`);
}

export interface TransactionListOptions {
  page?: number;
  size?: number;
  client?: string;
  status?: string;
  year?: number | "undated";
  sort?: "date" | "amount" | "client";
  direction?: "asc" | "desc";
}

export async function fetchTransactions(options: TransactionListOptions = {}): Promise<{ items: TransactionOut[]; page: number; size: number; total: number; }> {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    size: String(options.size ?? 20),
    sort: options.sort ?? "date",
    direction: options.direction ?? "desc",
  });
  if (options.client?.trim()) params.set("client", options.client.trim());
  if (options.status?.trim()) params.set("status", options.status.trim());
  if (options.year !== undefined) params.set("year", String(options.year));
  return apiRequest(`/api/transactions?${params.toString()}`, {}, "Failed to fetch transactions");
}

export async function fetchTransactionYears(): Promise<{ items: TransactionYearCount[]; total: number; }> {
  return apiRequest("/api/transactions/years", {}, "Failed to fetch transaction years");
}

export async function fetchTransactionSummary(): Promise<TransactionSummary> {
  return apiRequest("/api/transactions/summary", {}, "Failed to fetch transaction summary");
}

export async function createTransaction(payload: TransactionCreate): Promise<TransactionOut> {
  return apiRequest("/api/transactions", {
    method: "POST",
    body: JSON.stringify(payload),
  }, "Failed to create transaction");
}

export async function fetchTransaction(id: number): Promise<TransactionOut> {
  return apiRequest(`/api/transactions/${id}`, {}, `Transaction ${id} not found`);
}

export async function updateTransaction(id: number, payload: Partial<Pick<TransactionOut, "status" | "item_description" | "client_quote_amount" | "client_quote_currency" | "client_po_amount" | "supplier_po_amount">> & { status_reason?: string }): Promise<TransactionOut> {
  return apiRequest(`/api/transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, `Failed to update transaction ${id}`);
}

export async function deleteTransaction(id: number): Promise<void> {
  await apiRequest(`/api/transactions/${id}`, { method: "DELETE" }, "Failed to delete transaction");
}

export async function fetchClients(): Promise<{ items: ClientOut[] }> {
  return apiRequest("/api/clients", {}, "Failed to fetch clients");
}

export async function createClient(payload: ClientCreate): Promise<ClientOut> {
  return apiRequest("/api/clients", {
    method: "POST",
    body: JSON.stringify(payload),
  }, "Failed to create client");
}

export async function updateClient(clientId: number, payload: ClientUpdate): Promise<ClientOut> {
  return apiRequest(`/api/clients/${clientId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }, "Failed to update client");
}

export async function fetchClientMetrics(): Promise<{ items: ClientMetricOut[] }> {
  return apiRequest("/api/clients/metrics", {}, "Failed to fetch client metrics");
}

export async function fetchSuppliers(): Promise<{ items: SupplierOut[] }> {
  return apiRequest("/api/suppliers", {}, "Failed to fetch suppliers");
}

export async function createSupplier(payload: SupplierCreate): Promise<SupplierOut> {
  return apiRequest("/api/suppliers", {
    method: "POST",
    body: JSON.stringify(payload),
  }, "Failed to create supplier");
}

export async function updateSupplier(supplierId: number, payload: SupplierUpdate): Promise<SupplierOut> {
  return apiRequest(`/api/suppliers/${supplierId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }, "Failed to update supplier");
}

export async function fetchSupplierSummary(): Promise<SupplierSummary> {
  return apiRequest("/api/suppliers/summary", {}, "Failed to fetch supplier summary");
}

export async function fetchSupplierMetrics(): Promise<{ items: SupplierMetricOut[] }> {
  return apiRequest("/api/suppliers/metrics", {}, "Failed to fetch supplier metrics");
}

export async function fetchSupplierOverview(supplierId: number): Promise<SupplierOverview> {
  return apiRequest(`/api/suppliers/${supplierId}`, {}, "Failed to fetch supplier overview");
}

export async function listDocuments(transactionId: number): Promise<{ items: Array<{ id: number; category: string; name: string; uploaded_by?: string; uploaded_at: string; mime_type?: string | null; size_bytes?: number | null; }>}> {
  return apiRequest(`/api/transactions/${transactionId}/documents`, {}, "Failed to fetch documents");
}

export async function createDocument(transactionId: number, payload: { category: string; name: string; uploaded_by?: string; }): Promise<{ id: number; }>{
  return apiRequest(`/api/transactions/${transactionId}/documents`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, "Failed to create document");
}

export async function getShipment(transactionId: number): Promise<Partial<{ lead_time_days: number; tracking_number: string; shipped_date: string; eta_date: string }>> {
  return apiRequest(`/api/transactions/${transactionId}/shipment`, {}, "Failed to get shipment");
}

export async function upsertShipment(transactionId: number, payload: Partial<{ lead_time_days: number; tracking_number: string; shipped_date: string; eta_date: string }>): Promise<{ ok: boolean; status?: string | null }>{
  return apiRequest(`/api/transactions/${transactionId}/shipment`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }, "Failed to update shipment");
}

export async function listActivity(transactionId: number): Promise<{ items: Array<{ id: number; action: string; details?: string; created_at: string; }>}> {
  return apiRequest(`/api/transactions/${transactionId}/activity`, {}, "Failed to fetch activity");
}

export async function addActivity(transactionId: number, payload: { action: string; details?: string }): Promise<{ ok: boolean }>{
  return apiRequest(`/api/transactions/${transactionId}/activity`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, "Failed to add activity");
}

export async function getTransactionSuppliers(transactionId: number): Promise<{ items: SupplierOut[] }>{
  return apiRequest(`/api/transactions/${transactionId}/suppliers`, {}, "Failed to fetch transaction suppliers");
}

export async function getBulkTransactionSuppliers(transactionIds: number[]): Promise<{ items: Array<{ transaction_id: number; suppliers: SupplierOut[] }> }>{
  if (transactionIds.length === 0) return { items: [] };
  const params = new URLSearchParams({ ids: transactionIds.join(",") });
  return apiRequest(`/api/transactions/suppliers?${params.toString()}`, {}, "Failed to fetch transaction suppliers");
}

export async function addTransactionSupplier(transactionId: number, supplier_id: number): Promise<{ ok: boolean }>{
  return apiRequest(`/api/transactions/${transactionId}/suppliers`, {
    method: "POST",
    body: JSON.stringify({ supplier_id }),
  }, "Failed to add transaction supplier");
}

export async function createAndLinkTransactionSupplier(
  transactionId: number,
  payload: SupplierCreate,
): Promise<SupplierOut> {
  return apiRequest(`/api/transactions/${transactionId}/suppliers/new`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, "Failed to create and link supplier");
}

export async function updateRefs(transactionId: number, payload: { rfq_number?: string; client_po_number?: string; supplier_po_number?: string }): Promise<{ ok: boolean }>{
  return apiRequest(`/api/transactions/${transactionId}/refs`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, "Failed to update references");
}

export async function uploadDocument(transactionId: number, payload: { category: string; name: string; mime_type?: string; size_bytes?: number; content_base64?: string; po_number?: string }): Promise<{ id: number }>{
  return apiRequest(`/api/transactions/${transactionId}/documents`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, "Failed to upload document");
}

export async function deleteDocument(transactionId: number, documentId: number): Promise<void> {
  await apiRequest(`/api/transactions/${transactionId}/documents/${documentId}`, { method: "DELETE" }, "Failed to delete document");
}

export async function listSupplierQuotes(transactionId: number): Promise<{ items: SupplierQuoteOut[] }>{
  return apiRequest(`/api/transactions/${transactionId}/quotes`, {}, "Failed to fetch supplier quotes");
}

export async function createSupplierQuote(transactionId: number, payload: { supplier_id: number; amount: number; currency?: string; lead_time_days?: number; notes?: string }): Promise<{ id: number }>{
  return apiRequest(`/api/transactions/${transactionId}/quotes`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, "Failed to create supplier quote");
}

export async function listAssociatedCosts(transactionId: number): Promise<{ items: AssociatedCostOut[] }>{
  return apiRequest(`/api/transactions/${transactionId}/costs`, {}, "Failed to fetch costs");
}

export async function createAssociatedCost(transactionId: number, payload: { description: string; amount: number; status?: "paid" | "due" | "overdue" }): Promise<{ id: number }>{
  return apiRequest(`/api/transactions/${transactionId}/costs`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, "Failed to create cost");
}

export async function updateAssociatedCost(transactionId: number, costId: number, payload: Partial<{ description: string; amount: number; status: "paid" | "due" | "overdue" }>): Promise<{ ok: boolean }>{
  return apiRequest(`/api/transactions/${transactionId}/costs/${costId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, "Failed to update cost");
}

export async function deleteAssociatedCost(transactionId: number, costId: number): Promise<void>{
  await apiRequest(`/api/transactions/${transactionId}/costs/${costId}`, { method: "DELETE" }, "Failed to delete cost");
}

export async function getQuickBooksStatus(): Promise<QuickBooksStatus> {
  return apiRequest("/quickbooks/status", {}, "Failed to fetch QuickBooks status");
}

export async function getQuickBooksAuthorizationUrl(): Promise<QuickBooksAuthorization> {
  return apiRequest("/quickbooks/auth/connect", {}, "Failed to start QuickBooks connection");
}

export async function disconnectQuickBooks(): Promise<{ message: string }> {
  return apiRequest("/quickbooks/disconnect", { method: "POST" }, "Failed to disconnect QuickBooks");
}

export async function previewQuickBooksInvoice(transactionId: number, payload: QuickBooksInvoicePayload): Promise<QuickBooksInvoicePreview> {
  return apiRequest(`/quickbooks/transactions/${transactionId}/invoice-preview`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, "Failed to preview QuickBooks invoice");
}

export async function createQuickBooksInvoice(transactionId: number, payload: QuickBooksInvoicePayload): Promise<QuickBooksInvoiceCreateResult> {
  return apiRequest(`/quickbooks/transactions/${transactionId}/create-invoice`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, "Failed to create QuickBooks invoice");
}

export async function loginUser(email: string, password: string): Promise<{ user: Employee; expires_at?: string }> {
  return apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }, "Unable to sign in");
}

export async function fetchCurrentUser(): Promise<{ user: Employee }> {
  return apiRequest("/auth/me", {}, "Unable to load your account");
}

export async function logoutUser(): Promise<{ message: string }> {
  return apiRequest("/auth/logout", { method: "POST" }, "Unable to sign out");
}

export async function updateCurrentUser(payload: { name?: string; email?: string; current_password?: string }): Promise<{ user: Employee }> {
  return apiRequest("/auth/me", {
    method: "PUT",
    body: JSON.stringify(payload),
  }, "Unable to update your profile");
}

export async function changeCurrentUserPassword(payload: { current_password: string; new_password: string }): Promise<{ message: string; user: Employee }> {
  return apiRequest("/auth/change-password", {
    method: "POST",
    body: JSON.stringify(payload),
  }, "Unable to change your password");
}

export async function fetchEmployees(): Promise<{ employees: Employee[] }> {
  return apiRequest("/auth/employees", {}, "Unable to load employees");
}

export async function createEmployeeAccount(payload: { name: string; email: string; password: string; role: EmployeeRole }): Promise<{ employee: Employee }> {
  return apiRequest("/auth/employees", {
    method: "POST",
    body: JSON.stringify(payload),
  }, "Unable to create the employee account");
}

export async function updateEmployeeAccount(employeeId: number, payload: { name?: string; email?: string; role?: EmployeeRole; is_active?: boolean; temporary_password?: string }): Promise<{ employee: Employee }> {
  return apiRequest(`/auth/employees/${employeeId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }, "Unable to update the employee account");
}

export async function disableEmployeeAccount(employeeId: number): Promise<{ employee: Employee }> {
  return apiRequest(`/auth/employees/${employeeId}`, { method: "DELETE" }, "Unable to disable the employee account");
}
