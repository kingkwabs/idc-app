import React, { useEffect, useMemo, useState } from "react";
import { Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { addActivity, updateTransaction, fetchSuppliers, getTransactionSuppliers, addTransactionSupplier, listSupplierQuotes, createSupplierQuote, listAssociatedCosts, createAssociatedCost, updateAssociatedCost, deleteAssociatedCost } from "../lib/api";

interface AssociatedCost {
  id: string;
  description: string;
  amount: number;
  status: "paid" | "due" | "overdue";
}

// managed from backend now

interface FinancialsTabProps {
  onInvoiceCreated: () => void;
  transactionId: number;
  clientPoAmount?: number | null;
  supplierPoAmount?: number | null;
  onAmountsSaved?: () => void;
}

export function FinancialsTab({ onInvoiceCreated, transactionId, clientPoAmount, supplierPoAmount, onAmountsSaved }: FinancialsTabProps) {
  const [availableSuppliers, setAvailableSuppliers] = useState<Array<{ id: number; name: string }>>([]);
  const [linkedSuppliers, setLinkedSuppliers] = useState<Array<{ id: number; name: string }>>([]);
  const [supplierToAdd, setSupplierToAdd] = useState<number | "">("");
  const [quotes, setQuotes] = useState<Array<{ id: number; supplier_id: number; supplier_name?: string; amount: number; currency?: string; lead_time_days?: number; notes?: string; created_at: string }>>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null);
  const [newQuote, setNewQuote] = useState<{ supplier_id: number | ""; amount: string; currency: string; lead_time_days: string; notes: string }>({ supplier_id: "", amount: "", currency: "USD", lead_time_days: "", notes: "" });
  const [clientAmount, setClientAmount] = useState<string>(clientPoAmount != null ? String(clientPoAmount) : "");
  const [supplierAmount, setSupplierAmount] = useState<string>(supplierPoAmount != null ? String(supplierPoAmount) : "");
  const [costs, setCosts] = useState<Array<{ id: number; description: string; amount: number; status: "paid"|"due"|"overdue"}>>([]);
  const [newCost, setNewCost] = useState<{ description: string; amount: string; status: "paid"|"due"|"overdue" }>(()=>({ description: "", amount: "", status: "due" }));
  const parsedClient = useMemo(() => (clientAmount.trim() === "" ? null : Number(clientAmount)), [clientAmount]);
  const parsedSupplier = useMemo(() => (supplierAmount.trim() === "" ? null : Number(supplierAmount)), [supplierAmount]);

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
        setLinkedSuppliers(linked.items as any);
        setQuotes(quotesRes.items as any);
        setCosts(costsRes.items as any);
      } catch (e) {
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

  const getStatusBadge = (status: AssociatedCost["status"]) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-500/90 text-white hover:bg-green-600 backdrop-blur-sm border border-green-400/30">Paid</Badge>;
      case "due":
        return <Badge className="bg-yellow-500/90 text-white hover:bg-yellow-600 backdrop-blur-sm border border-yellow-400/30">Due</Badge>;
      case "overdue":
        return <Badge className="bg-red-500/90 text-white hover:bg-red-600 backdrop-blur-sm border border-red-400/30">Overdue</Badge>;
      default:
        return <Badge className="bg-gray-500/90 text-white hover:bg-gray-600 backdrop-blur-sm border border-gray-400/30">Unknown</Badge>;
    }
  };

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
      toast.success("Financials saved", { description: "Amounts updated successfully." });
      onAmountsSaved?.();
    } catch (e) {
      toast.error("Failed to save financials");
    }
  };

  const amountsChanged = (clientPoAmount ?? null) !== parsedClient || (supplierPoAmount ?? null) !== parsedSupplier;

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
              {availableSuppliers.filter(s=> !linkedSuppliers.some(ls=> ls.id === s.id)).map(s=> (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={async ()=>{
              if (!supplierToAdd) return;
              try {
                await addTransactionSupplier(transactionId, Number(supplierToAdd));
                await addActivity(transactionId, { action: 'supplier-linked', details: String(supplierToAdd) });
                const linked = await getTransactionSuppliers(transactionId);
                setLinkedSuppliers(linked.items as any);
                setSupplierToAdd("");
              } catch (e) {
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
                            onChange={() => setSelectedQuoteId(q.id)}
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
                    setQuotes(refreshed.items as any);
                    setNewQuote({ supplier_id: "", amount: "", currency: "USD", lead_time_days: "", notes: "" });
                  } catch (e) {
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
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costs.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-gray-500">No costs yet.</TableCell></TableRow>
                  ) : costs.map((cost) => (
                    <TableRow key={cost.id} className="hover:bg-white/40 transition-all duration-200">
                      <TableCell className="font-medium">{cost.description}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(cost.amount)}</TableCell>
                      <TableCell>
                        <select className="border rounded px-2 py-1 text-sm" value={cost.status} onChange={async (e)=>{
                          const status = e.target.value as any;
                          await updateAssociatedCost(transactionId, cost.id, { status });
                          setCosts(prev => prev.map(c=> c.id === cost.id ? { ...c, status } : c));
                        }}>
                          <option value="paid">Paid</option>
                          <option value="due">Due</option>
                          <option value="overdue">Overdue</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={async ()=>{
                          await deleteAssociatedCost(transactionId, cost.id);
                          setCosts(prev => prev.filter(c=> c.id !== cost.id));
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
                <select className="border rounded px-2 py-1" value={newCost.status} onChange={(e)=> setNewCost(c=> ({...c, status: e.target.value as any}))}>
                  <option value="due">Due</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
              <Button onClick={async ()=>{
                if (!newCost.description.trim() || !newCost.amount.trim()) return;
                const res = await createAssociatedCost(transactionId, { description: newCost.description.trim(), amount: Number(newCost.amount), status: newCost.status });
                const fresh = await listAssociatedCosts(transactionId);
                setCosts(fresh.items as any);
                setNewCost({ description: "", amount: "", status: "due" });
              }} className="bg-white border-2 border-dashed border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200">
                <Plus className="h-4 w-4 mr-2" />
                Add Cost
              </Button>
            </div>
          </div>

          {/* Invoicing Action Section */}
          <div className="glass-card rounded-lg p-8 hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative z-10 text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Ready to Invoice</h3>
              <p className="text-gray-600 mb-6">Create an invoice in QuickBooks with the selected supplier quote and associated costs.</p>

              <Button
                onClick={() => {
                  toast.success("Invoice created successfully!", {
                    description: "Progress automatically advanced to 'Paid' status. Invoice #INV-0452 created in QuickBooks.",
                  });
                  onInvoiceCreated();
                }}
                className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 px-8 py-3 text-base"
              >
                <ExternalLink className="h-5 w-5 mr-2" />
                Create Invoice in QuickBooks
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}