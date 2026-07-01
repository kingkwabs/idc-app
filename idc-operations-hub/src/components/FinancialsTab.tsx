import React, { useEffect, useMemo, useState } from "react";
import { Eye, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { addActivity, updateTransaction, fetchSuppliers, getTransactionSuppliers, addTransactionSupplier, listSupplierQuotes, createSupplierQuote, listAssociatedCosts, createAssociatedCost, updateAssociatedCost, deleteAssociatedCost, previewQuickBooksInvoice, createQuickBooksInvoice } from "../lib/api";
import type { ApiErrorPayload, AssociatedCostOut, QuickBooksInvoicePayload, QuickBooksInvoicePreview, SupplierOut, SupplierQuoteOut } from "../lib/api";

function getApiErrorPayload(error: unknown): ApiErrorPayload | undefined {
  if (typeof error === "object" && error !== null && "payload" in error) {
    return (error as { payload?: ApiErrorPayload }).payload;
  }
  return undefined;
}

interface FinancialsTabProps {
  onInvoiceCreated: () => void | Promise<void>;
  transactionId: number;
  clientPoAmount?: number | null;
  clientQuoteAmount?: number | null;
  supplierPoAmount?: number | null;
  onAmountsSaved?: () => void | Promise<void>;
}

export function FinancialsTab({ onInvoiceCreated, transactionId, clientPoAmount, clientQuoteAmount, supplierPoAmount, onAmountsSaved }: FinancialsTabProps) {
  const [availableSuppliers, setAvailableSuppliers] = useState<SupplierOut[]>([]);
  const [linkedSuppliers, setLinkedSuppliers] = useState<SupplierOut[]>([]);
  const [supplierToAdd, setSupplierToAdd] = useState<number | "">("");
  const [quotes, setQuotes] = useState<SupplierQuoteOut[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null);
  const [newQuote, setNewQuote] = useState<{ supplier_id: number | ""; amount: string; currency: string; lead_time_days: string; notes: string }>({ supplier_id: "", amount: "", currency: "USD", lead_time_days: "", notes: "" });
  const [clientAmount, setClientAmount] = useState<string>(clientPoAmount != null ? String(clientPoAmount) : "");
  const [supplierAmount, setSupplierAmount] = useState<string>(supplierPoAmount != null ? String(supplierPoAmount) : "");
  const [costs, setCosts] = useState<AssociatedCostOut[]>([]);
  const [newCost, setNewCost] = useState<{ description: string; amount: string; status: AssociatedCostOut["status"] }>(()=>({ description: "", amount: "", status: "due" }));
  const [billableCostIds, setBillableCostIds] = useState<Set<number>>(() => new Set());
  const [customInvoiceNotes, setCustomInvoiceNotes] = useState("");
  const [invoicePreview, setInvoicePreview] = useState<QuickBooksInvoicePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [invoiceCreating, setInvoiceCreating] = useState(false);
  const parsedClient = useMemo(() => (clientAmount.trim() === "" ? null : Number(clientAmount)), [clientAmount]);
  const parsedSupplier = useMemo(() => (supplierAmount.trim() === "" ? null : Number(supplierAmount)), [supplierAmount]);
  const linkedSupplierIds = useMemo(() => new Set(linkedSuppliers.map(supplier => supplier.id)), [linkedSuppliers]);
  const unlinkedSuppliers = useMemo(
    () => availableSuppliers.filter(supplier => !linkedSupplierIds.has(supplier.id)),
    [availableSuppliers, linkedSupplierIds]
  );
  const selectedBillableCostIds = useMemo(() => Array.from(billableCostIds), [billableCostIds]);
  const invoicePayload = useMemo<QuickBooksInvoicePayload>(() => ({
    selected_quote_id: selectedQuoteId,
    billable_cost_ids: selectedBillableCostIds,
    custom_notes: customInvoiceNotes.trim(),
  }), [customInvoiceNotes, selectedBillableCostIds, selectedQuoteId]);
  const savedClientBillableAmount = clientPoAmount ?? clientQuoteAmount ?? 0;

  useEffect(() => {
    (async () => {
      try {
        const [allSup, linked, quotesRes, costsRes] = await Promise.all([
          fetchSuppliers(),
          getTransactionSuppliers(transactionId),
          listSupplierQuotes(transactionId),
          listAssociatedCosts(transactionId),
        ]);
        setAvailableSuppliers(allSup.items);
        setLinkedSuppliers(linked.items);
        setQuotes(quotesRes.items);
        setCosts(costsRes.items);
      } catch {
        // ignore
      }
    })();
  }, [transactionId]);

  useEffect(() => {
    setClientAmount(clientPoAmount != null ? String(clientPoAmount) : "");
  }, [clientPoAmount]);

  useEffect(() => {
    setSupplierAmount(supplierPoAmount != null ? String(supplierPoAmount) : "");
  }, [supplierPoAmount]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const handleSaveAmounts = async () => {
    try {
      await updateTransaction(transactionId, {
        client_po_amount: parsedClient ?? undefined,
        supplier_po_amount: parsedSupplier ?? undefined,
      });
      await addActivity(transactionId, { action: "financials-updated", details: `client:${parsedClient ?? ""}, supplier:${parsedSupplier ?? ""}` });
      setInvoicePreview(null);
      toast.success("Financials saved", { description: "Amounts updated successfully." });
      await onAmountsSaved?.();
    } catch {
      toast.error("Failed to save financials");
    }
  };

  const amountsChanged = (clientPoAmount ?? null) !== parsedClient || (supplierPoAmount ?? null) !== parsedSupplier;

  const toggleBillableCost = (costId: number, checked: boolean) => {
    setBillableCostIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(costId);
      } else {
        next.delete(costId);
      }
      return next;
    });
    setInvoicePreview(null);
  };

  const handlePreviewInvoice = async () => {
    if (amountsChanged) {
      toast.error("Save financials first", {
        description: "The invoice preview uses the amounts saved in the database.",
      });
      return;
    }

    setPreviewLoading(true);
    try {
      const preview = await previewQuickBooksInvoice(transactionId, invoicePayload);
      setInvoicePreview(preview);

      if (preview.already_invoiced) {
        toast.error("Invoice already exists", {
          description: `QuickBooks Invoice #${preview.invoice_number} is already linked to this transaction.`,
        });
      } else if (!preview.can_create) {
        toast.warning("Preview needs attention", {
          description: preview.errors[0] || "Review the invoice preview before creating it.",
        });
      } else {
        toast.success("Invoice preview ready", {
          description: `QuickBooks total: ${formatCurrency(preview.totals.invoice_total)}`,
        });
      }
    } catch (error: unknown) {
      const payload = getApiErrorPayload(error);
      if (payload?.invoice_preview) setInvoicePreview(payload.invoice_preview);
      toast.error("Failed to preview invoice", {
        description: payload?.details || payload?.error || (error instanceof Error ? error.message : undefined) || "Check the QuickBooks connection.",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!invoicePreview) {
      await handlePreviewInvoice();
      return;
    }

    if (!invoicePreview.can_create) {
      toast.error("Invoice is not ready", {
        description: invoicePreview.errors[0] || "Resolve the preview warnings first.",
      });
      return;
    }

    setInvoiceCreating(true);
    try {
      const result = await createQuickBooksInvoice(transactionId, invoicePayload);
      setInvoicePreview(result.invoice_preview);
      toast.success("Invoice created successfully", {
        description: `QuickBooks Invoice #${result.invoice_number} created for ${formatCurrency(Number(result.total))}.`,
      });
      await onInvoiceCreated();
    } catch (error: unknown) {
      const payload = getApiErrorPayload(error);
      if (payload?.invoice_preview) setInvoicePreview(payload.invoice_preview);

      if (payload?.error === "already_invoiced") {
        toast.error("Invoice already exists", {
          description: `This transaction already has QuickBooks Invoice #${payload.invoice_number}.`,
        });
      } else {
        toast.error("Failed to create invoice", {
          description: payload?.details || payload?.errors?.[0] || payload?.error || (error instanceof Error ? error.message : undefined) || "Check QuickBooks connection.",
        });
      }
    } finally {
      setInvoiceCreating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-8">Financials</h2>

        {/* Amount Inputs */}
        <div className="glass-card rounded-lg p-6 space-y-4 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            <div>
              <Label htmlFor="clientAmount" className="text-gray-700">Client PO Amount (USD)</Label>
              <Input id="clientAmount" type="number" value={clientAmount} onChange={(e) => setClientAmount(e.target.value)} placeholder="0.00" className="glass border-white/20 bg-white/50 backdrop-blur-sm focus:bg-white/80 transition-all duration-200" />
            </div>
            <div>
              <Label htmlFor="supplierAmount" className="text-gray-700">Supplier PO Amount (USD)</Label>
              <Input id="supplierAmount" type="number" value={supplierAmount} onChange={(e) => setSupplierAmount(e.target.value)} placeholder="0.00" className="glass border-white/20 bg-white/50 backdrop-blur-sm focus:bg-white/80 transition-all duration-200" />
            </div>
            <div>
              <Button onClick={handleSaveAmounts} disabled={!amountsChanged} className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-200">Save</Button>
            </div>
          </div>
        </div>

        {/* Supplier Linking */}
        <div className="glass-card rounded-lg p-6 space-y-4 mb-8">
          <h3 className="text-lg font-medium text-gray-900">Suppliers</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {linkedSuppliers.length === 0 ? (
              <span className="text-gray-600">No suppliers linked.</span>
            ) : (
              linkedSuppliers.map(s => (
                <span key={s.id} className="px-2 py-1 rounded-md bg-gray-100 text-gray-800 border border-gray-300/60 text-sm">{s.name}</span>
              ))
            )}
            <select className="border rounded px-2 py-1 text-sm" value={supplierToAdd} onChange={(e)=> setSupplierToAdd(e.target.value ? Number(e.target.value) : "") }>
              <option value="">Select supplier</option>
              {unlinkedSuppliers.map(s=> (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={async ()=>{
              if (!supplierToAdd) return;
              try {
                await addTransactionSupplier(transactionId, Number(supplierToAdd));
                await addActivity(transactionId, { action: 'supplier-linked', details: String(supplierToAdd) });
                const linked = await getTransactionSuppliers(transactionId);
                setLinkedSuppliers(linked.items);
                setSupplierToAdd("");
              } catch {
                // feedback
              }
            }}>Add Supplier</Button>
          </div>
        </div>

        {/* Supplier Quotes Section */}
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Supplier Quotes</h3>

            <div className="glass-table rounded-lg overflow-hidden hover:shadow-xl transition-all duration-300">
              <Table>
                <TableHeader>
                  <TableRow className="bg-white/30 backdrop-blur-sm">
                    <TableHead className="w-12">Select</TableHead>
                    <TableHead className="font-medium text-gray-900">Supplier</TableHead>
                    <TableHead className="font-medium text-gray-900">Amount</TableHead>
                    <TableHead className="font-medium text-gray-900">Currency</TableHead>
                    <TableHead className="font-medium text-gray-900">Lead Time</TableHead>
                    <TableHead className="font-medium text-gray-900">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((q) => (
                    <TableRow
                      key={q.id}
                      className={`transition-all duration-200 hover:bg-white/40 ${selectedQuoteId === q.id ? "bg-green-50/80 border-green-200/50" : ""}`}
                    >
                      <TableCell>
                        <div className="flex items-center">
                          <input
                            type="radio"
                            name="supplier-selection"
                            value={q.id}
                            checked={selectedQuoteId === q.id}
                            onChange={() => {
                              setSelectedQuoteId(q.id);
                              setInvoicePreview(null);
                            }}
                            className="w-4 h-4 text-teal-600 border-gray-300 focus:ring-teal-500 focus:ring-2"
                          />
                          <Label htmlFor={`supplier-${q.id}`} className="sr-only">
                            Select quote
                          </Label>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{q.supplier_name || q.supplier_id}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(Number(q.amount))}</TableCell>
                      <TableCell className="font-medium">{q.currency || 'USD'}</TableCell>
                      <TableCell className="font-medium">{q.lead_time_days ?? '—'}</TableCell>
                      <TableCell className="font-medium">{q.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex flex-col">
                  <Label className="text-xs text-gray-600">Supplier</Label>
                  <select className="border rounded px-2 py-1" value={newQuote.supplier_id} onChange={(e)=> setNewQuote(q=>({...q, supplier_id: e.target.value ? Number(e.target.value) : ""}))}>
                    <option value="">Select supplier</option>
                    {linkedSuppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col">
                  <Label className="text-xs text-gray-600">Amount</Label>
                  <Input className="w-28" value={newQuote.amount} onChange={(e)=> setNewQuote(q=>({...q, amount: e.target.value}))} placeholder="0.00" />
                </div>
                <div className="flex flex-col">
                  <Label className="text-xs text-gray-600">Currency</Label>
                  <Input className="w-20" value={newQuote.currency} onChange={(e)=> setNewQuote(q=>({...q, currency: e.target.value}))} />
                </div>
                <div className="flex flex-col">
                  <Label className="text-xs text-gray-600">Lead Time (days)</Label>
                  <Input className="w-28" value={newQuote.lead_time_days} onChange={(e)=> setNewQuote(q=>({...q, lead_time_days: e.target.value}))} placeholder="days" />
                </div>
                <div className="flex flex-col min-w-[200px] flex-1">
                  <Label className="text-xs text-gray-600">Notes</Label>
                  <Input value={newQuote.notes} onChange={(e)=> setNewQuote(q=>({...q, notes: e.target.value}))} />
                </div>
                <Button onClick={async ()=>{
                  if (!newQuote.supplier_id || !newQuote.amount.trim()) return;
                  try {
                    const res = await createSupplierQuote(transactionId, {
                      supplier_id: Number(newQuote.supplier_id),
                      amount: Number(newQuote.amount),
                      currency: newQuote.currency || 'USD',
                      lead_time_days: newQuote.lead_time_days ? Number(newQuote.lead_time_days) : undefined,
                      notes: newQuote.notes || undefined,
                    });
                    await addActivity(transactionId, { action: 'supplier-quote-added', details: String(res.id) });
                    const refreshed = await listSupplierQuotes(transactionId);
                    setQuotes(refreshed.items);
                    setNewQuote({ supplier_id: "", amount: "", currency: "USD", lead_time_days: "", notes: "" });
                    setInvoicePreview(null);
                  } catch {
                    // ignore
                  }
                }} className="bg-white border-2 border-dashed border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Supplier Quote
                </Button>
              </div>
            </div>
          </div>

          {/* Associated Costs Section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Associated Costs</h3>

            <div className="glass-table rounded-lg overflow-hidden hover:shadow-xl transition-all duration-300">
              <Table>
                <TableHeader>
                  <TableRow className="bg-white/30 backdrop-blur-sm">
                    <TableHead className="font-medium text-gray-900">Description</TableHead>
                    <TableHead className="font-medium text-gray-900">Amount</TableHead>
                    <TableHead className="font-medium text-gray-900">Status</TableHead>
                    <TableHead className="font-medium text-gray-900">Bill to Client</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costs.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-gray-500">No costs yet.</TableCell></TableRow>
                  ) : costs.map((cost) => (
                    <TableRow key={cost.id} className="hover:bg-white/40 transition-all duration-200">
                      <TableCell className="font-medium">{cost.description}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(cost.amount)}</TableCell>
                      <TableCell>
                        <select className="border rounded px-2 py-1 text-sm" value={cost.status} onChange={async (e)=>{
                          const status = e.target.value as AssociatedCostOut["status"];
                          await updateAssociatedCost(transactionId, cost.id, { status });
                          setCosts(prev => prev.map(c=> c.id === cost.id ? { ...c, status } : c));
                        }}>
                          <option value="paid">Paid</option>
                          <option value="due">Due</option>
                          <option value="overdue">Overdue</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`billable-cost-${cost.id}`}
                            checked={billableCostIds.has(cost.id)}
                            onCheckedChange={(checked) => toggleBillableCost(cost.id, checked === true)}
                          />
                          <Label htmlFor={`billable-cost-${cost.id}`} className="text-xs text-gray-600">
                            Include
                          </Label>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={async ()=>{
                          await deleteAssociatedCost(transactionId, cost.id);
                          setCosts(prev => prev.filter(c=> c.id !== cost.id));
                          setBillableCostIds(prev => {
                            const next = new Set(prev);
                            next.delete(cost.id);
                            return next;
                          });
                          setInvoicePreview(null);
                        }}>Delete</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 items-end">
              <div className="flex flex-col">
                <Label className="text-xs text-gray-600">Description</Label>
                <Input value={newCost.description} onChange={(e)=> setNewCost(c=> ({...c, description: e.target.value}))} placeholder="e.g., Shipping & Handling" />
              </div>
              <div className="flex flex-col">
                <Label className="text-xs text-gray-600">Amount</Label>
                <Input className="w-28" value={newCost.amount} onChange={(e)=> setNewCost(c=> ({...c, amount: e.target.value}))} placeholder="0.00" />
              </div>
              <div className="flex flex-col">
                <Label className="text-xs text-gray-600">Status</Label>
                <select className="border rounded px-2 py-1" value={newCost.status} onChange={(e)=> setNewCost(c=> ({...c, status: e.target.value as AssociatedCostOut["status"]}))}>
                  <option value="due">Due</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
              <Button onClick={async ()=>{
                if (!newCost.description.trim() || !newCost.amount.trim()) return;
                await createAssociatedCost(transactionId, { description: newCost.description.trim(), amount: Number(newCost.amount), status: newCost.status });
                const fresh = await listAssociatedCosts(transactionId);
                setCosts(fresh.items);
                setNewCost({ description: "", amount: "", status: "due" });
                setInvoicePreview(null);
              }} className="bg-white border-2 border-dashed border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200">
                <Plus className="h-4 w-4 mr-2" />
                Add Cost
              </Button>
            </div>
          </div>

          {/* Invoicing Action Section */}
          <div className="glass-card rounded-lg p-8 hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative z-10 space-y-6">
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-4">QuickBooks Invoice Preview</h3>
                <p className="text-gray-600 mb-2">
                  Preview the client-facing invoice before anything is sent to QuickBooks.
                </p>
                <p className="text-sm text-gray-500">
                  Supplier quotes and unselected associated costs stay internal for margin tracking.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-white/40 bg-white/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Client billable amount</p>
                  <p className="text-xl font-semibold text-gray-900">{formatCurrency(Number(savedClientBillableAmount))}</p>
                </div>
                <div className="rounded-lg border border-white/40 bg-white/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Billable costs selected</p>
                  <p className="text-xl font-semibold text-gray-900">{selectedBillableCostIds.length}</p>
                </div>
                <div className="rounded-lg border border-white/40 bg-white/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Supplier quote</p>
                  <p className="text-xl font-semibold text-gray-900">{selectedQuoteId ? "Internal only" : "None selected"}</p>
                </div>
              </div>

              <div className="text-left">
                <Label htmlFor="customInvoiceNotes" className="text-gray-700">Customer memo</Label>
                <Textarea
                  id="customInvoiceNotes"
                  value={customInvoiceNotes}
                  onChange={(event) => {
                    setCustomInvoiceNotes(event.target.value);
                    setInvoicePreview(null);
                  }}
                  placeholder="Optional note visible on the QuickBooks invoice"
                  className="mt-2 glass border-white/20 bg-white/60 backdrop-blur-sm focus:bg-white/80"
                />
                <p className="mt-2 text-xs text-gray-500">
                  RFQ and client PO references are included automatically. Supplier PO and supplier quotes are not customer-facing.
                </p>
              </div>

              {amountsChanged ? (
                <div className="rounded-lg border border-amber-300/60 bg-amber-50/80 p-3 text-sm text-amber-800">
                  Save the financial amounts before previewing. The invoice preview uses saved backend values.
                </div>
              ) : null}

              <div className="flex flex-wrap justify-center gap-3">
                <Button
                  onClick={handlePreviewInvoice}
                  disabled={previewLoading || amountsChanged}
                  variant="outline"
                  className="bg-white/80 border-teal-200 text-teal-700 hover:bg-teal-50 shadow-sm transition-all duration-200 px-6 py-3 text-base"
                >
                  <Eye className="h-5 w-5 mr-2" />
                  {previewLoading ? "Building Preview..." : "Preview QuickBooks Invoice"}
                </Button>

                {invoicePreview ? (
                  <Button
                    onClick={handleCreateInvoice}
                    disabled={!invoicePreview.can_create || invoicePreview.already_invoiced || invoiceCreating}
                    className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 px-8 py-3 text-base"
                  >
                    <ExternalLink className="h-5 w-5 mr-2" />
                    {invoiceCreating ? "Creating Invoice..." : "Create Invoice in QuickBooks"}
                  </Button>
                ) : null}
              </div>

              {invoicePreview ? (
                <div className="rounded-lg border border-teal-100 bg-white/75 p-5 text-left shadow-sm space-y-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-gray-900">
                        Preview for {invoicePreview.invoice_customer_name || "QuickBooks customer"}
                      </h4>
                      <p className="text-sm text-gray-600">
                        Customer memo: {invoicePreview.notes || "No memo"}
                      </p>
                    </div>
                    <Badge className={invoicePreview.can_create ? "bg-green-500/90 text-white" : "bg-amber-500/90 text-gray-900"}>
                      {invoicePreview.can_create ? "Ready to create" : "Needs review"}
                    </Badge>
                  </div>

                  {invoicePreview.errors.length || invoicePreview.warnings.length ? (
                    <div className="space-y-2">
                      {invoicePreview.errors.map((message) => (
                        <div key={message} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          {message}
                        </div>
                      ))}
                      {invoicePreview.warnings.map((message) => (
                        <div key={message} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                          {message}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="overflow-hidden rounded-lg border border-gray-200/80">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50/80">
                          <TableHead>Invoice Line</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoicePreview.line_items.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-gray-500">No invoice line items yet.</TableCell>
                          </TableRow>
                        ) : invoicePreview.line_items.map((item, index) => (
                          <TableRow key={`${item.source}-${item.cost_id ?? index}`}>
                            <TableCell className="font-medium text-gray-900">{item.description}</TableCell>
                            <TableCell className="text-gray-600">
                              {item.source === "client_billable_amount" ? "Client billable amount" : "Billable associated cost"}
                            </TableCell>
                            <TableCell className="text-right font-semibold">{formatCurrency(item.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-teal-50 p-3">
                      <p className="text-xs text-teal-700">QuickBooks invoice total</p>
                      <p className="text-lg font-semibold text-teal-900">{formatCurrency(invoicePreview.totals.invoice_total)}</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs text-gray-600">Supplier cost basis</p>
                      <p className="text-lg font-semibold text-gray-900">{formatCurrency(invoicePreview.totals.internal_supplier_cost_basis)}</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs text-gray-600">Internal associated costs</p>
                      <p className="text-lg font-semibold text-gray-900">{formatCurrency(invoicePreview.totals.internal_associated_costs_total)}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-3">
                      <p className="text-xs text-emerald-700">Estimated margin</p>
                      <p className="text-lg font-semibold text-emerald-900">{formatCurrency(invoicePreview.totals.estimated_margin)}</p>
                    </div>
                  </div>

                  {invoicePreview.selected_supplier_quote ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Internal supplier quote reference</p>
                      <p className="text-sm text-gray-800">
                        {invoicePreview.selected_supplier_quote.supplier_name || `Supplier #${invoicePreview.selected_supplier_quote.supplier_id}`} quoted{" "}
                        {formatCurrency(invoicePreview.selected_supplier_quote.amount)}
                        {invoicePreview.selected_supplier_quote.lead_time_days ? ` with ${invoicePreview.selected_supplier_quote.lead_time_days} day lead time` : ""}.
                      </p>
                    </div>
                  ) : null}

                  <p className="text-xs text-gray-500">
                    Only the invoice line items above are sent to QuickBooks. Internal supplier and cost context stays inside IDC.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
