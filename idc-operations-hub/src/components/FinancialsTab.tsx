import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  Link2,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  addActivity,
  addTransactionSupplier,
  createAssociatedCost,
  createQuickBooksInvoice,
  createSupplierQuote,
  deleteAssociatedCost,
  fetchSuppliers,
  getTransactionSuppliers,
  listAssociatedCosts,
  listSupplierQuotes,
  previewQuickBooksInvoice,
  updateAssociatedCost,
  updateTransaction,
} from "../lib/api";
import type {
  ApiErrorPayload,
  AssociatedCostOut,
  QuickBooksInvoicePayload,
  QuickBooksInvoicePreview,
  SupplierOut,
  SupplierQuoteOut,
} from "../lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Textarea } from "./ui/textarea";

const MAX_MONEY_AMOUNT = 999_999_999.99;
const MAX_LEAD_TIME_DAYS = 3_650;

const nativeSelectClassName =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-[var(--shadow-control)] outline-none transition-[background-color,border-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out-ui)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-[var(--color-ring-soft)] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 motion-reduce:transition-none";

type FieldErrors = Record<string, string | undefined>;
type NoticeTone = "error" | "warning" | "success" | "info";

interface MoneyValidation {
  value: number | null;
  error?: string;
}

interface FinancialsTabProps {
  onInvoiceCreated: () => void | Promise<void>;
  transactionId: number;
  canManageQuickBooks?: boolean;
  clientPoAmount?: number | null;
  clientQuoteAmount?: number | null;
  supplierPoAmount?: number | null;
  onAmountsSaved?: () => void | Promise<void>;
}

function getApiErrorPayload(error: unknown): ApiErrorPayload | undefined {
  if (typeof error === "object" && error !== null && "payload" in error) {
    return (error as { payload?: ApiErrorPayload }).payload;
  }
  return undefined;
}

function humanizeErrorCode(value: string): string {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}.` : "";
}

function getErrorMessage(error: unknown, fallback: string): string {
  const payload = getApiErrorPayload(error);
  if (typeof payload?.details === "string" && payload.details.trim()) return payload.details;
  if (Array.isArray(payload?.details)) {
    const details = payload.details
      .map((detail) => typeof detail === "string" ? detail : detail.message)
      .filter((detail): detail is string => Boolean(detail?.trim()));
    if (details.length > 0) return details.join(" ");
  }
  if (payload?.errors?.[0]?.trim()) return payload.errors[0];
  if (payload?.error?.trim()) return humanizeErrorCode(payload.error);
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function validateMoney(
  rawValue: string,
  label: string,
  options: { required: boolean; allowZero: boolean },
): MoneyValidation {
  const value = rawValue.trim();
  if (!value) {
    return options.required
      ? { value: null, error: `${label} is required.` }
      : { value: null };
  }

  if (!/^(?:\d+|\d*\.\d{1,2})$/.test(value)) {
    return { value: null, error: `${label} must be a number with no more than two decimal places.` };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: `${label} must be a valid number.` };
  }
  if (parsed < 0 || (!options.allowZero && parsed === 0)) {
    return {
      value: null,
      error: options.allowZero ? `${label} cannot be negative.` : `${label} must be greater than zero.`,
    };
  }
  if (parsed > MAX_MONEY_AMOUNT) {
    return { value: null, error: `${label} cannot exceed ${formatMoney(MAX_MONEY_AMOUNT)}.` };
  }

  return { value: parsed };
}

function validateStoredMoney(rawValue: string, label: string, savedValue: number | null): MoneyValidation {
  const result = validateMoney(rawValue, label, { required: false, allowZero: false });
  if (!result.error && result.value === null && savedValue !== null) {
    return {
      value: null,
      error: `${label} is already saved. Enter a replacement amount instead of leaving it blank.`,
    };
  }
  return result;
}

function validateLeadTime(rawValue: string): { value?: number; error?: string } {
  const value = rawValue.trim();
  if (!value) return {};
  if (!/^\d+$/.test(value)) {
    return { error: "Lead time must be a whole number of days." };
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_LEAD_TIME_DAYS) {
    return { error: `Lead time must be between 1 and ${MAX_LEAD_TIME_DAYS.toLocaleString()} days.` };
  }
  return { value: parsed };
}

function formatMoney(amount: number, currency = "USD"): string {
  if (!Number.isFinite(amount)) return "Not available";
  const normalizedCurrency = currency.trim().toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
    }).format(amount);
  } catch {
    return `${normalizedCurrency} ${amount.toFixed(2)}`;
  }
}

function amountInputValue(value?: number | null): string {
  return value == null ? "" : String(value);
}

function InlineNotice({
  tone,
  children,
  action,
}: {
  tone: NoticeTone;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const toneClassNames: Record<NoticeTone, string> = {
    error: "border-[var(--color-destructive)] bg-[var(--color-destructive-soft)] text-destructive",
    warning: "border-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-warning-foreground)]",
    success: "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]",
    info: "border-[var(--color-info)] bg-[var(--color-info-soft)] text-[var(--color-info)]",
  };
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div
      className={`flex flex-col gap-3 rounded-md border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between ${toneClassNames[tone]}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 leading-5">{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs leading-5 text-destructive" role="alert">
      {message}
    </p>
  );
}

function LoadingLabel({ label }: { label: string }) {
  return (
    <>
      <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
      {label}
    </>
  );
}

export function FinancialsTab({
  onInvoiceCreated,
  transactionId,
  canManageQuickBooks = false,
  clientPoAmount,
  clientQuoteAmount,
  supplierPoAmount,
  onAmountsSaved,
}: FinancialsTabProps) {
  const [availableSuppliers, setAvailableSuppliers] = useState<SupplierOut[]>([]);
  const [linkedSuppliers, setLinkedSuppliers] = useState<SupplierOut[]>([]);
  const [supplierToAdd, setSupplierToAdd] = useState<number | "">("");
  const [quotes, setQuotes] = useState<SupplierQuoteOut[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null);
  const [newQuote, setNewQuote] = useState<{
    supplier_id: number | "";
    amount: string;
    currency: string;
    lead_time_days: string;
    notes: string;
  }>({ supplier_id: "", amount: "", currency: "USD", lead_time_days: "", notes: "" });
  const [savedClientPoAmount, setSavedClientPoAmount] = useState<number | null>(clientPoAmount ?? null);
  const [savedSupplierPoAmount, setSavedSupplierPoAmount] = useState<number | null>(supplierPoAmount ?? null);
  const [clientAmount, setClientAmount] = useState(amountInputValue(clientPoAmount));
  const [supplierAmount, setSupplierAmount] = useState(amountInputValue(supplierPoAmount));
  const [costs, setCosts] = useState<AssociatedCostOut[]>([]);
  const [newCost, setNewCost] = useState<{
    description: string;
    amount: string;
    status: AssociatedCostOut["status"];
  }>({ description: "", amount: "", status: "due" });
  const [billableCostIds, setBillableCostIds] = useState<Set<number>>(() => new Set());
  const [customInvoiceNotes, setCustomInvoiceNotes] = useState("");
  const [invoicePreview, setInvoicePreview] = useState<QuickBooksInvoicePreview | null>(null);

  const [reloadAttempt, setReloadAttempt] = useState(0);
  const [contextLoading, setContextLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amountSaving, setAmountSaving] = useState(false);
  const [amountErrors, setAmountErrors] = useState<FieldErrors>({});
  const [amountActionError, setAmountActionError] = useState<string | null>(null);
  const [amountWarning, setAmountWarning] = useState<string | null>(null);
  const [supplierLinking, setSupplierLinking] = useState(false);
  const [supplierActionError, setSupplierActionError] = useState<string | null>(null);
  const [quoteCreating, setQuoteCreating] = useState(false);
  const [quoteErrors, setQuoteErrors] = useState<FieldErrors>({});
  const [quoteActionError, setQuoteActionError] = useState<string | null>(null);
  const [costCreating, setCostCreating] = useState(false);
  const [costErrors, setCostErrors] = useState<FieldErrors>({});
  const [costActionError, setCostActionError] = useState<string | null>(null);
  const [pendingCostAction, setPendingCostAction] = useState<{
    costId: number;
    kind: "status" | "delete";
  } | null>(null);
  const [costToDelete, setCostToDelete] = useState<AssociatedCostOut | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [invoiceCreating, setInvoiceCreating] = useState(false);
  const [invoiceActionError, setInvoiceActionError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const clientAmountValidation = useMemo(
    () => validateStoredMoney(clientAmount, "Client PO amount", savedClientPoAmount),
    [clientAmount, savedClientPoAmount],
  );
  const supplierAmountValidation = useMemo(
    () => validateStoredMoney(supplierAmount, "Supplier PO amount", savedSupplierPoAmount),
    [savedSupplierPoAmount, supplierAmount],
  );
  const amountsChanged =
    Boolean(clientAmountValidation.error) ||
    Boolean(supplierAmountValidation.error) ||
    clientAmountValidation.value !== savedClientPoAmount ||
    supplierAmountValidation.value !== savedSupplierPoAmount;

  const linkedSupplierIds = useMemo(
    () => new Set(linkedSuppliers.map((supplier) => supplier.id)),
    [linkedSuppliers],
  );
  const unlinkedSuppliers = useMemo(
    () => availableSuppliers.filter((supplier) => !linkedSupplierIds.has(supplier.id)),
    [availableSuppliers, linkedSupplierIds],
  );
  const selectedBillableCostIds = useMemo(
    () => Array.from(billableCostIds).sort((left, right) => left - right),
    [billableCostIds],
  );
  const selectedBillableCostsTotal = useMemo(
    () => costs.reduce((total, cost) => total + (billableCostIds.has(cost.id) ? cost.amount : 0), 0),
    [billableCostIds, costs],
  );
  const invoicePayload = useMemo<QuickBooksInvoicePayload>(
    () => ({
      selected_quote_id: selectedQuoteId,
      billable_cost_ids: selectedBillableCostIds,
      custom_notes: customInvoiceNotes.trim(),
    }),
    [customInvoiceNotes, selectedBillableCostIds, selectedQuoteId],
  );
  const savedClientBillableAmount = savedClientPoAmount ?? clientQuoteAmount ?? null;
  const clientBillableSource = savedClientPoAmount != null ? "Client PO" : clientQuoteAmount != null ? "Client quote" : "Not set";

  useEffect(() => {
    setAvailableSuppliers([]);
    setLinkedSuppliers([]);
    setSupplierToAdd("");
    setQuotes([]);
    setSelectedQuoteId(null);
    setNewQuote({ supplier_id: "", amount: "", currency: "USD", lead_time_days: "", notes: "" });
    setCosts([]);
    setNewCost({ description: "", amount: "", status: "due" });
    setBillableCostIds(new Set());
    setCustomInvoiceNotes("");
    setInvoicePreview(null);
    setLoadError(null);
    setAmountErrors({});
    setAmountActionError(null);
    setAmountWarning(null);
    setSupplierActionError(null);
    setQuoteErrors({});
    setQuoteActionError(null);
    setCostErrors({});
    setCostActionError(null);
    setInvoiceActionError(null);
  }, [transactionId]);

  useEffect(() => {
    setSavedClientPoAmount(clientPoAmount ?? null);
    setClientAmount(amountInputValue(clientPoAmount));
  }, [clientPoAmount]);

  useEffect(() => {
    setSavedSupplierPoAmount(supplierPoAmount ?? null);
    setSupplierAmount(amountInputValue(supplierPoAmount));
  }, [supplierPoAmount]);

  useEffect(() => {
    let cancelled = false;

    async function loadFinancialContext() {
      setContextLoading(true);
      setLoadError(null);

      try {
        const [allSuppliersResult, linkedSuppliersResult, quotesResult, costsResult] = await Promise.allSettled([
          fetchSuppliers(),
          getTransactionSuppliers(transactionId),
          listSupplierQuotes(transactionId),
          listAssociatedCosts(transactionId),
        ]);
        if (cancelled) return;

        const failedResources: string[] = [];
        let firstFailure: unknown;

        if (allSuppliersResult.status === "fulfilled") {
          setAvailableSuppliers(allSuppliersResult.value.items);
        } else {
          failedResources.push("supplier directory");
          firstFailure = allSuppliersResult.reason;
        }

        if (linkedSuppliersResult.status === "fulfilled") {
          setLinkedSuppliers(linkedSuppliersResult.value.items);
        } else {
          failedResources.push("linked suppliers");
          firstFailure ??= linkedSuppliersResult.reason;
        }

        if (quotesResult.status === "fulfilled") {
          setQuotes(quotesResult.value.items);
        } else {
          failedResources.push("supplier quotes");
          firstFailure ??= quotesResult.reason;
        }

        if (costsResult.status === "fulfilled") {
          setCosts(costsResult.value.items);
        } else {
          failedResources.push("associated costs");
          firstFailure ??= costsResult.reason;
        }

        if (failedResources.length > 0) {
          const details = getErrorMessage(firstFailure, "Try loading the financial context again.");
          setLoadError(`Could not load ${failedResources.join(", ")}. ${details}`);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Financial context could not be loaded."));
        }
      } finally {
        if (!cancelled) setContextLoading(false);
      }
    }

    void loadFinancialContext();
    return () => {
      cancelled = true;
    };
  }, [reloadAttempt, transactionId]);

  const invalidateInvoicePreview = () => {
    setInvoicePreview(null);
    setInvoiceActionError(null);
    setCreateDialogOpen(false);
  };

  const handleSaveAmounts = async () => {
    const nextErrors: FieldErrors = {
      client: clientAmountValidation.error,
      supplier: supplierAmountValidation.error,
    };
    setAmountErrors(nextErrors);
    setAmountActionError(null);
    setAmountWarning(null);

    if (nextErrors.client || nextErrors.supplier) return;
    if (!amountsChanged) return;

    setAmountSaving(true);
    try {
      await updateTransaction(transactionId, {
        client_po_amount: clientAmountValidation.value ?? undefined,
        supplier_po_amount: supplierAmountValidation.value ?? undefined,
      });

      setSavedClientPoAmount(clientAmountValidation.value);
      setSavedSupplierPoAmount(supplierAmountValidation.value);
      invalidateInvoicePreview();

      const followUpWarnings: string[] = [];
      try {
        await addActivity(transactionId, {
          action: "financials-updated",
          details: `client:${clientAmountValidation.value ?? ""}, supplier:${supplierAmountValidation.value ?? ""}`,
        });
      } catch (error: unknown) {
        followUpWarnings.push(getErrorMessage(error, "The activity log could not be updated."));
      }

      try {
        await onAmountsSaved?.();
      } catch (error: unknown) {
        followUpWarnings.push(getErrorMessage(error, "The transaction view could not be refreshed."));
      }

      toast.success("Financial amounts saved");
      if (followUpWarnings.length > 0) {
        const warning = `The amounts were saved, but ${followUpWarnings.join(" ")}`;
        setAmountWarning(warning);
        toast.warning("Saved with a follow-up issue", { description: warning });
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error, "The financial amounts could not be saved.");
      setAmountActionError(message);
      toast.error("Failed to save financial amounts", { description: message });
    } finally {
      setAmountSaving(false);
    }
  };

  const handleLinkSupplier = async () => {
    if (!supplierToAdd) {
      const message = "Select a supplier before linking it to this transaction.";
      setSupplierActionError(message);
      return;
    }

    const supplier = availableSuppliers.find((item) => item.id === Number(supplierToAdd));
    if (!supplier) {
      setSupplierActionError("That supplier is no longer available. Reload the supplier directory and try again.");
      return;
    }

    setSupplierLinking(true);
    setSupplierActionError(null);
    try {
      await addTransactionSupplier(transactionId, supplier.id);
      setLinkedSuppliers((current) => [...current, supplier].sort((left, right) => left.name.localeCompare(right.name)));
      setSupplierToAdd("");
      toast.success("Supplier linked", { description: `${supplier.name} is now available for quote entry.` });
    } catch (error: unknown) {
      const message = getErrorMessage(error, "The supplier could not be linked.");
      setSupplierActionError(message);
      toast.error("Failed to link supplier", { description: message });
    } finally {
      setSupplierLinking(false);
    }
  };

  const handleCreateQuote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const amount = validateMoney(newQuote.amount, "Quote amount", { required: true, allowZero: false });
    const leadTime = validateLeadTime(newQuote.lead_time_days);
    const currency = newQuote.currency.trim().toUpperCase();
    const nextErrors: FieldErrors = {
      supplier: newQuote.supplier_id ? undefined : "Select a linked supplier.",
      amount: amount.error,
      currency: /^[A-Z]{3}$/.test(currency) ? undefined : "Currency must be a three-letter code such as USD.",
      leadTime: leadTime.error,
    };

    setQuoteErrors(nextErrors);
    setQuoteActionError(null);
    if (Object.values(nextErrors).some(Boolean) || amount.value === null || !newQuote.supplier_id) return;

    const supplier = linkedSuppliers.find((item) => item.id === Number(newQuote.supplier_id));
    if (!supplier) {
      setQuoteActionError("That supplier is no longer linked to this transaction. Reload and try again.");
      return;
    }

    setQuoteCreating(true);
    try {
      const result = await createSupplierQuote(transactionId, {
        supplier_id: supplier.id,
        amount: amount.value,
        currency,
        lead_time_days: leadTime.value,
        notes: newQuote.notes.trim() || undefined,
      });
      const createdQuote: SupplierQuoteOut = {
        id: result.id,
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        amount: amount.value,
        currency,
        lead_time_days: leadTime.value ?? null,
        notes: newQuote.notes.trim() || null,
        created_at: new Date().toISOString(),
      };
      setQuotes((current) => [createdQuote, ...current]);
      setNewQuote({ supplier_id: "", amount: "", currency: "USD", lead_time_days: "", notes: "" });
      setQuoteErrors({});
      invalidateInvoicePreview();
      toast.success("Supplier quote added", {
        description: "The quote remains internal unless selected as margin context.",
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error, "The supplier quote could not be added.");
      setQuoteActionError(message);
      toast.error("Failed to add supplier quote", { description: message });
    } finally {
      setQuoteCreating(false);
    }
  };

  const handleCreateCost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const description = newCost.description.trim();
    const amount = validateMoney(newCost.amount, "Cost amount", { required: true, allowZero: false });
    const nextErrors: FieldErrors = {
      description: description ? undefined : "Description is required.",
      amount: amount.error,
    };

    setCostErrors(nextErrors);
    setCostActionError(null);
    if (Object.values(nextErrors).some(Boolean) || amount.value === null) return;

    setCostCreating(true);
    try {
      const result = await createAssociatedCost(transactionId, {
        description,
        amount: amount.value,
        status: newCost.status,
      });
      const createdCost: AssociatedCostOut = {
        id: result.id,
        description,
        amount: amount.value,
        status: newCost.status,
        created_at: new Date().toISOString(),
      };
      setCosts((current) => [createdCost, ...current]);
      setNewCost({ description: "", amount: "", status: "due" });
      setCostErrors({});
      invalidateInvoicePreview();
      toast.success("Associated cost added", {
        description: "It remains internal unless you explicitly select “Bill to client.”",
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error, "The associated cost could not be added.");
      setCostActionError(message);
      toast.error("Failed to add associated cost", { description: message });
    } finally {
      setCostCreating(false);
    }
  };

  const handleUpdateCostStatus = async (cost: AssociatedCostOut, status: AssociatedCostOut["status"]) => {
    if (status === cost.status) return;

    setPendingCostAction({ costId: cost.id, kind: "status" });
    setCostActionError(null);
    try {
      await updateAssociatedCost(transactionId, cost.id, { status });
      setCosts((current) => current.map((item) => (item.id === cost.id ? { ...item, status } : item)));
      toast.success("Cost status updated", { description: `${cost.description} is now ${status}.` });
    } catch (error: unknown) {
      const message = getErrorMessage(error, `The status for ${cost.description} could not be updated.`);
      setCostActionError(message);
      toast.error("Failed to update cost status", { description: message });
    } finally {
      setPendingCostAction(null);
    }
  };

  const handleDeleteCost = async (cost: AssociatedCostOut) => {
    setPendingCostAction({ costId: cost.id, kind: "delete" });
    setCostActionError(null);
    try {
      await deleteAssociatedCost(transactionId, cost.id);
      setCosts((current) => current.filter((item) => item.id !== cost.id));
      setBillableCostIds((current) => {
        const next = new Set(current);
        next.delete(cost.id);
        return next;
      });
      setCostToDelete(null);
      invalidateInvoicePreview();
      toast.success("Associated cost deleted");
    } catch (error: unknown) {
      const message = getErrorMessage(error, `The cost ${cost.description} could not be deleted.`);
      setCostActionError(message);
      toast.error("Failed to delete associated cost", { description: message });
    } finally {
      setPendingCostAction(null);
    }
  };

  const toggleBillableCost = (costId: number, checked: boolean) => {
    setBillableCostIds((current) => {
      const next = new Set(current);
      if (checked) next.add(costId);
      else next.delete(costId);
      return next;
    });
    invalidateInvoicePreview();
  };

  const handlePreviewInvoice = async () => {
    setInvoiceActionError(null);
    if (amountsChanged) {
      const message = "Save the financial amounts first. The preview always uses values stored in the database.";
      setInvoiceActionError(message);
      toast.error("Save financial amounts first", { description: message });
      return;
    }

    setPreviewLoading(true);
    try {
      const preview = await previewQuickBooksInvoice(transactionId, invoicePayload);
      setInvoicePreview(preview);

      if (preview.already_invoiced) {
        toast.info("Invoice already linked", {
          description: `QuickBooks Invoice #${preview.invoice_number ?? "unknown"} is already linked to this transaction.`,
        });
      } else if (!preview.can_create) {
        toast.warning("Preview needs attention", {
          description: preview.errors[0] || "Review the invoice requirements before creating it.",
        });
      } else {
        toast.success("Invoice preview ready", {
          description: `QuickBooks total: ${formatMoney(preview.totals.invoice_total)}`,
        });
      }
    } catch (error: unknown) {
      const payload = getApiErrorPayload(error);
      if (payload?.invoice_preview) setInvoicePreview(payload.invoice_preview);
      const message = getErrorMessage(error, "The invoice preview could not be built. Check the QuickBooks connection.");
      setInvoiceActionError(message);
      toast.error("Failed to preview invoice", { description: message });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!invoicePreview?.can_create || invoicePreview.already_invoiced) {
      const message = "Build and review a valid preview before creating the QuickBooks invoice.";
      setInvoiceActionError(message);
      return;
    }

    setInvoiceCreating(true);
    setInvoiceActionError(null);
    try {
      const result = await createQuickBooksInvoice(transactionId, {
        ...invoicePayload,
        preview_hash: invoicePreview.preview_hash,
      });
      setInvoicePreview(result.invoice_preview);
      toast.success("QuickBooks invoice created", {
        description: `Invoice #${result.invoice_number} was created for ${formatMoney(Number(result.total))}.`,
      });

      try {
        await onInvoiceCreated();
      } catch (error: unknown) {
        const message = `Invoice #${result.invoice_number} was created, but this page could not refresh. Do not create it again; reload the transaction instead. ${getErrorMessage(error, "")}`.trim();
        setInvoiceActionError(message);
        toast.warning("Invoice created; refresh required", { description: message });
      }
    } catch (error: unknown) {
      const payload = getApiErrorPayload(error);

      if (payload?.invoice_preview) {
        setInvoicePreview(payload.invoice_preview);
      } else {
        // An upstream timeout can be ambiguous. Force a fresh server check before another create attempt.
        setInvoicePreview(null);
      }

      let message: string;
      if (payload?.error === "already_invoiced") {
        message = `This transaction already has QuickBooks Invoice #${payload.invoice_number ?? "unknown"}.`;
      } else if (payload?.error === "invoice_attempt_conflict") {
        message = "A previous invoice request is still being reconciled. Refresh the preview before taking any further action.";
      } else if (payload?.error === "invoice_preview_stale" || payload?.error === "invoice_preview_required") {
        message = "The invoice inputs changed after approval. Review the refreshed preview before creating the invoice.";
      } else if (payload?.error === "invoice_configuration_error") {
        message = "QuickBooks is not configured for this invoice. Verify the active service item and connection settings before retrying.";
      } else if (payload?.error === "invoice_outcome_unknown") {
        message = "QuickBooks may have received this invoice, but the result was not confirmed. Verify the transaction in QuickBooks before retrying the unchanged preview.";
      } else if (payload?.error === "invoice_creation_failed") {
        message = "QuickBooks rejected the invoice before confirming creation. Review the connection and invoice requirements, then build a fresh preview.";
      } else {
        message = getErrorMessage(error, "The QuickBooks invoice could not be created.");
      }

      setInvoiceActionError(message);
      toast.error("Invoice creation was not completed", { description: message });
    } finally {
      setInvoiceCreating(false);
      setCreateDialogOpen(false);
    }
  };

  const clearAmountFieldError = (field: "client" | "supplier") => {
    setAmountErrors((current) => ({ ...current, [field]: undefined }));
    setAmountActionError(null);
    setAmountWarning(null);
    invalidateInvoicePreview();
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Financials</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Maintain internal supplier economics, then review the exact client-facing invoice before it reaches QuickBooks.
        </p>
      </header>

      {contextLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
          Loading suppliers, quotes, and costs…
        </div>
      ) : null}

      {loadError ? (
        <InlineNotice
          tone="error"
          action={
            <Button size="sm" variant="outline" onClick={() => setReloadAttempt((attempt) => attempt + 1)} disabled={contextLoading}>
              <RefreshCw aria-hidden="true" />
              Retry load
            </Button>
          }
        >
          {loadError}
        </InlineNotice>
      ) : null}

      <Card>
        <div className="space-y-1 px-5 pt-5">
          <h3 className="text-base font-semibold text-foreground">Transaction amounts</h3>
          <p className="text-sm leading-5 text-muted-foreground">
            These stored amounts drive internal margin reporting and the base QuickBooks invoice line.
          </p>
        </div>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
            <div className="space-y-2">
              <Label htmlFor={`client-amount-${transactionId}`}>Client PO amount (USD)</Label>
              <Input
                id={`client-amount-${transactionId}`}
                inputMode="decimal"
                value={clientAmount}
                onChange={(event) => {
                  setClientAmount(event.target.value);
                  clearAmountFieldError("client");
                }}
                placeholder="0.00"
                aria-invalid={Boolean(amountErrors.client)}
                aria-describedby={amountErrors.client ? `client-amount-error-${transactionId}` : undefined}
              />
              <FieldError id={`client-amount-error-${transactionId}`} message={amountErrors.client} />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`supplier-amount-${transactionId}`}>Supplier PO amount (USD)</Label>
              <Input
                id={`supplier-amount-${transactionId}`}
                inputMode="decimal"
                value={supplierAmount}
                onChange={(event) => {
                  setSupplierAmount(event.target.value);
                  clearAmountFieldError("supplier");
                }}
                placeholder="0.00"
                aria-invalid={Boolean(amountErrors.supplier)}
                aria-describedby={amountErrors.supplier ? `supplier-amount-error-${transactionId}` : undefined}
              />
              <FieldError id={`supplier-amount-error-${transactionId}`} message={amountErrors.supplier} />
            </div>

            <Button className="w-full md:w-fit" onClick={handleSaveAmounts} disabled={!amountsChanged || amountSaving}>
              {amountSaving ? <LoadingLabel label="Saving…" /> : "Save amounts"}
            </Button>
          </div>

          {amountActionError ? <InlineNotice tone="error">{amountActionError}</InlineNotice> : null}
          {amountWarning ? <InlineNotice tone="warning">{amountWarning}</InlineNotice> : null}
        </CardContent>
      </Card>

      <Card>
        <div className="space-y-1 px-5 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">Linked suppliers</h3>
            <Badge variant="secondary">{linkedSuppliers.length}</Badge>
          </div>
          <p className="text-sm leading-5 text-muted-foreground">
            Link suppliers before recording their quotes for this transaction.
          </p>
        </div>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2" aria-label="Suppliers linked to this transaction">
            {linkedSuppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suppliers are linked yet.</p>
            ) : (
              linkedSuppliers.map((supplier) => (
                <Badge key={supplier.id} variant="outline">
                  {supplier.name}
                </Badge>
              ))
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,24rem)_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor={`supplier-link-${transactionId}`}>Supplier to link</Label>
              <select
                id={`supplier-link-${transactionId}`}
                className={nativeSelectClassName}
                value={supplierToAdd}
                onChange={(event) => {
                  setSupplierToAdd(event.target.value ? Number(event.target.value) : "");
                  setSupplierActionError(null);
                }}
                disabled={contextLoading || supplierLinking || unlinkedSuppliers.length === 0}
              >
                <option value="">{unlinkedSuppliers.length === 0 ? "No unlinked suppliers available" : "Select a supplier"}</option>
                {unlinkedSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="outline" onClick={handleLinkSupplier} disabled={!supplierToAdd || supplierLinking || contextLoading}>
              {supplierLinking ? <LoadingLabel label="Linking…" /> : <><Link2 aria-hidden="true" />Link supplier</>}
            </Button>
          </div>

          {supplierActionError ? <InlineNotice tone="error">{supplierActionError}</InlineNotice> : null}
        </CardContent>
      </Card>

      <Card>
        <div className="space-y-1 px-5 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">Supplier quotes</h3>
            <Badge variant="secondary">Internal only</Badge>
          </div>
          <p className="text-sm leading-5 text-muted-foreground">
            Selecting a quote sets the internal supplier cost basis for margin context. It never adds a customer invoice line.
          </p>
        </div>
        <CardContent className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="sr-only">Internal supplier quote selection</legend>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className={`rounded-md border p-4 ${selectedQuoteId === null ? "border-primary bg-accent" : "bg-card"}`}>
                <div className="flex items-start gap-3">
                  <input
                    id={`supplier-quote-none-${transactionId}`}
                    type="radio"
                    name={`supplier-quote-${transactionId}`}
                    checked={selectedQuoteId === null}
                    onChange={() => {
                      setSelectedQuoteId(null);
                      invalidateInvoicePreview();
                    }}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-soft)]"
                  />
                  <Label htmlFor={`supplier-quote-none-${transactionId}`} className="block cursor-pointer leading-5">
                    <span className="block font-medium text-foreground">No quote selected</span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">Use the supplier PO amount as the internal cost basis.</span>
                  </Label>
                </div>
              </div>

              {quotes.map((quote) => {
                const quoteId = `supplier-quote-${transactionId}-${quote.id}`;
                const selected = selectedQuoteId === quote.id;
                return (
                  <div key={quote.id} className={`rounded-md border p-4 ${selected ? "border-primary bg-accent" : "bg-card"}`}>
                    <div className="flex items-start gap-3">
                      <input
                        id={quoteId}
                        type="radio"
                        name={`supplier-quote-${transactionId}`}
                        value={quote.id}
                        checked={selected}
                        onChange={() => {
                          setSelectedQuoteId(quote.id);
                          invalidateInvoicePreview();
                        }}
                        className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-soft)]"
                      />
                      <Label htmlFor={quoteId} className="block min-w-0 cursor-pointer leading-5">
                        <span className="block truncate font-medium text-foreground">{quote.supplier_name || `Supplier #${quote.supplier_id}`}</span>
                        <span className="mt-1 block font-semibold tabular-nums text-foreground">
                          {formatMoney(Number(quote.amount), quote.currency || "USD")}
                        </span>
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          {quote.lead_time_days ? `${quote.lead_time_days} day lead time` : "Lead time not provided"}
                          {quote.notes ? ` · ${quote.notes}` : ""}
                        </span>
                      </Label>
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <form className="space-y-4 rounded-md border bg-secondary p-4" onSubmit={handleCreateQuote} noValidate>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Record a supplier quote</h4>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Quotes are sourcing records and remain internal to IDC Energy.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-12">
              <div className="space-y-2 xl:col-span-3">
                <Label htmlFor={`quote-supplier-${transactionId}`}>Supplier</Label>
                <select
                  id={`quote-supplier-${transactionId}`}
                  className={nativeSelectClassName}
                  value={newQuote.supplier_id}
                  onChange={(event) => {
                    setNewQuote((current) => ({ ...current, supplier_id: event.target.value ? Number(event.target.value) : "" }));
                    setQuoteErrors((current) => ({ ...current, supplier: undefined }));
                  }}
                  disabled={quoteCreating || linkedSuppliers.length === 0}
                  aria-invalid={Boolean(quoteErrors.supplier)}
                  aria-describedby={quoteErrors.supplier ? `quote-supplier-error-${transactionId}` : undefined}
                >
                  <option value="">{linkedSuppliers.length === 0 ? "Link a supplier first" : "Select supplier"}</option>
                  {linkedSuppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
                <FieldError id={`quote-supplier-error-${transactionId}`} message={quoteErrors.supplier} />
              </div>

              <div className="space-y-2 xl:col-span-2">
                <Label htmlFor={`quote-amount-${transactionId}`}>Amount</Label>
                <Input
                  id={`quote-amount-${transactionId}`}
                  inputMode="decimal"
                  value={newQuote.amount}
                  onChange={(event) => {
                    setNewQuote((current) => ({ ...current, amount: event.target.value }));
                    setQuoteErrors((current) => ({ ...current, amount: undefined }));
                  }}
                  placeholder="0.00"
                  disabled={quoteCreating}
                  aria-invalid={Boolean(quoteErrors.amount)}
                  aria-describedby={quoteErrors.amount ? `quote-amount-error-${transactionId}` : undefined}
                />
                <FieldError id={`quote-amount-error-${transactionId}`} message={quoteErrors.amount} />
              </div>

              <div className="space-y-2 xl:col-span-2">
                <Label htmlFor={`quote-currency-${transactionId}`}>Currency</Label>
                <Input
                  id={`quote-currency-${transactionId}`}
                  value={newQuote.currency}
                  onChange={(event) => {
                    setNewQuote((current) => ({ ...current, currency: event.target.value.toUpperCase() }));
                    setQuoteErrors((current) => ({ ...current, currency: undefined }));
                  }}
                  maxLength={3}
                  placeholder="USD"
                  disabled={quoteCreating}
                  aria-invalid={Boolean(quoteErrors.currency)}
                  aria-describedby={quoteErrors.currency ? `quote-currency-error-${transactionId}` : undefined}
                />
                <FieldError id={`quote-currency-error-${transactionId}`} message={quoteErrors.currency} />
              </div>

              <div className="space-y-2 xl:col-span-2">
                <Label htmlFor={`quote-lead-${transactionId}`}>Lead time (days)</Label>
                <Input
                  id={`quote-lead-${transactionId}`}
                  inputMode="numeric"
                  value={newQuote.lead_time_days}
                  onChange={(event) => {
                    setNewQuote((current) => ({ ...current, lead_time_days: event.target.value }));
                    setQuoteErrors((current) => ({ ...current, leadTime: undefined }));
                  }}
                  placeholder="Optional"
                  disabled={quoteCreating}
                  aria-invalid={Boolean(quoteErrors.leadTime)}
                  aria-describedby={quoteErrors.leadTime ? `quote-lead-error-${transactionId}` : undefined}
                />
                <FieldError id={`quote-lead-error-${transactionId}`} message={quoteErrors.leadTime} />
              </div>

              <div className="space-y-2 sm:col-span-2 xl:col-span-3">
                <Label htmlFor={`quote-notes-${transactionId}`}>Internal notes</Label>
                <Input
                  id={`quote-notes-${transactionId}`}
                  value={newQuote.notes}
                  onChange={(event) => setNewQuote((current) => ({ ...current, notes: event.target.value }))}
                  maxLength={1_000}
                  placeholder="Optional sourcing context"
                  disabled={quoteCreating}
                />
              </div>
            </div>
            <Button type="submit" variant="outline" disabled={quoteCreating || linkedSuppliers.length === 0}>
              {quoteCreating ? <LoadingLabel label="Adding quote…" /> : <><Plus aria-hidden="true" />Add supplier quote</>}
            </Button>
          </form>

          {quoteActionError ? <InlineNotice tone="error">{quoteActionError}</InlineNotice> : null}
        </CardContent>
      </Card>

      <Card>
        <div className="space-y-1 px-5 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">Associated costs</h3>
            <Badge variant="secondary">Internal by default</Badge>
          </div>
          <p className="text-sm leading-5 text-muted-foreground">
            A cost is billed only when its “Bill to client” checkbox is selected for the next preview.
          </p>
        </div>
        <CardContent className="space-y-5">
          {costs.length === 0 ? (
            <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">No associated costs have been recorded.</div>
          ) : (
            <ul className="divide-y rounded-md border bg-card" aria-label="Associated costs">
              {costs.map((cost) => {
                const statusPending = pendingCostAction?.costId === cost.id && pendingCostAction.kind === "status";
                const deletePending = pendingCostAction?.costId === cost.id && pendingCostAction.kind === "delete";
                return (
                  <li key={cost.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(12rem,1fr)_10rem_minmax(10rem,auto)_auto] lg:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{cost.description}</p>
                      <p className="mt-1 tabular-nums text-sm font-semibold text-foreground">{formatMoney(Number(cost.amount))}</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`cost-status-${transactionId}-${cost.id}`} className="text-xs text-muted-foreground">Status</Label>
                      <select
                        id={`cost-status-${transactionId}-${cost.id}`}
                        className={nativeSelectClassName}
                        value={cost.status}
                        onChange={(event) => void handleUpdateCostStatus(cost, event.target.value as AssociatedCostOut["status"])}
                        disabled={pendingCostAction !== null}
                        aria-busy={statusPending}
                      >
                        <option value="due">Due</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2 lg:justify-center">
                      <Checkbox
                        id={`billable-cost-${transactionId}-${cost.id}`}
                        checked={billableCostIds.has(cost.id)}
                        onCheckedChange={(checked) => toggleBillableCost(cost.id, checked === true)}
                        disabled={pendingCostAction !== null}
                      />
                      <Label htmlFor={`billable-cost-${transactionId}-${cost.id}`} className="cursor-pointer">
                        Bill to client
                      </Label>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setCostToDelete(cost)}
                      disabled={pendingCostAction !== null}
                      aria-label={`Delete associated cost ${cost.description}`}
                    >
                      {deletePending ? <LoadingLabel label="Deleting…" /> : <><Trash2 aria-hidden="true" />Delete</>}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="rounded-md border bg-secondary p-4">
            <form className="space-y-4" onSubmit={handleCreateCost} noValidate>
              <div>
                <h4 className="text-sm font-semibold text-foreground">Record an associated cost</h4>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">New costs are not billed to the client automatically.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_10rem_auto] lg:items-start">
                <div className="space-y-2">
                  <Label htmlFor={`cost-description-${transactionId}`}>Description</Label>
                  <Input
                    id={`cost-description-${transactionId}`}
                    value={newCost.description}
                    onChange={(event) => {
                      setNewCost((current) => ({ ...current, description: event.target.value }));
                      setCostErrors((current) => ({ ...current, description: undefined }));
                    }}
                    maxLength={255}
                    placeholder="Shipping and handling"
                    disabled={costCreating}
                    aria-invalid={Boolean(costErrors.description)}
                    aria-describedby={costErrors.description ? `cost-description-error-${transactionId}` : undefined}
                  />
                  <FieldError id={`cost-description-error-${transactionId}`} message={costErrors.description} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`cost-amount-${transactionId}`}>Amount (USD)</Label>
                  <Input
                    id={`cost-amount-${transactionId}`}
                    inputMode="decimal"
                    value={newCost.amount}
                    onChange={(event) => {
                      setNewCost((current) => ({ ...current, amount: event.target.value }));
                      setCostErrors((current) => ({ ...current, amount: undefined }));
                    }}
                    placeholder="0.00"
                    disabled={costCreating}
                    aria-invalid={Boolean(costErrors.amount)}
                    aria-describedby={costErrors.amount ? `cost-amount-error-${transactionId}` : undefined}
                  />
                  <FieldError id={`cost-amount-error-${transactionId}`} message={costErrors.amount} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`cost-status-new-${transactionId}`}>Status</Label>
                  <select
                    id={`cost-status-new-${transactionId}`}
                    className={nativeSelectClassName}
                    value={newCost.status}
                    onChange={(event) => setNewCost((current) => ({ ...current, status: event.target.value as AssociatedCostOut["status"] }))}
                    disabled={costCreating}
                  >
                    <option value="due">Due</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>

                <Button type="submit" variant="outline" className="w-full lg:mt-7 lg:w-auto" disabled={costCreating}>
                  {costCreating ? <LoadingLabel label="Adding…" /> : <><Plus aria-hidden="true" />Add cost</>}
                </Button>
              </div>
            </form>
          </div>

          {costActionError ? <InlineNotice tone="error">{costActionError}</InlineNotice> : null}
        </CardContent>
      </Card>

      {canManageQuickBooks ? (
      <Card className="border-[var(--color-accent-border)]">
        <div className="space-y-2 px-5 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">QuickBooks invoice</h3>
            <Badge variant="outline"><ExternalLink aria-hidden="true" />External system action</Badge>
          </div>
          <p className="max-w-3xl text-sm leading-5 text-muted-foreground">
            Previewing is read-only. Creating adds a real invoice in QuickBooks; it does not email the customer or record a payment.
          </p>
        </div>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border bg-secondary p-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Client billable amount</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">
                {savedClientBillableAmount == null ? "Not set" : formatMoney(Number(savedClientBillableAmount))}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Source: {clientBillableSource}</p>
            </div>
            <div className="rounded-md border bg-secondary p-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Costs selected to bill</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{selectedBillableCostIds.length}</p>
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">{formatMoney(selectedBillableCostsTotal)} total</p>
            </div>
            <div className="rounded-md border bg-secondary p-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Supplier quote</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{selectedQuoteId ? "Selected" : "Not selected"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Internal context only</p>
            </div>
            <div className="rounded-md border bg-secondary p-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Invoice state</p>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {invoicePreview?.already_invoiced ? "Created" : invoicePreview?.can_create ? "Ready" : invoicePreview ? "Needs review" : "Not previewed"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Based on the latest preview</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`invoice-notes-${transactionId}`}>Customer memo</Label>
            <Textarea
              id={`invoice-notes-${transactionId}`}
              value={customInvoiceNotes}
              onChange={(event) => {
                setCustomInvoiceNotes(event.target.value);
                invalidateInvoicePreview();
              }}
              maxLength={650}
              placeholder="Optional note visible on the QuickBooks invoice"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              RFQ and client PO references are added automatically. Supplier PO details, quotes, and unselected costs stay internal.
            </p>
          </div>

          {amountsChanged ? (
            <InlineNotice tone="warning">Save the current financial amount edits before previewing. QuickBooks uses only stored backend values.</InlineNotice>
          ) : null}
          {invoiceActionError ? <InlineNotice tone="error">{invoiceActionError}</InlineNotice> : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="button" variant="outline" onClick={handlePreviewInvoice} disabled={previewLoading || invoiceCreating || amountsChanged}>
              {previewLoading ? <LoadingLabel label="Building preview…" /> : <><Eye aria-hidden="true" />Preview invoice</>}
            </Button>

            {invoicePreview?.can_create && !invoicePreview.already_invoiced ? (
              <AlertDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button type="button" disabled={invoiceCreating}>
                    {invoiceCreating ? <LoadingLabel label="Creating invoice…" /> : <><ExternalLink aria-hidden="true" />Create in QuickBooks</>}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Create this QuickBooks invoice?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This creates a real invoice for {invoicePreview.invoice_customer_name || "the QuickBooks customer"}. It cannot be undone from this screen.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="rounded-md border bg-secondary p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Invoice total</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{formatMoney(invoicePreview.totals.invoice_total)}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Includes the client billable amount and exactly {invoicePreview.billable_cost_ids.length} explicitly selected associated {invoicePreview.billable_cost_ids.length === 1 ? "cost" : "costs"}.
                    </p>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void handleCreateInvoice()}
                      className="border-primary bg-primary text-primary-foreground hover:bg-[var(--color-primary-hover)]"
                    >
                      Create invoice
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>

          {invoicePreview ? (
            <section className="space-y-5 rounded-md border bg-card p-4 sm:p-5" aria-labelledby={`invoice-preview-heading-${transactionId}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 id={`invoice-preview-heading-${transactionId}`} className="font-semibold text-foreground">
                    Preview for {invoicePreview.invoice_customer_name || "QuickBooks customer"}
                  </h4>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">Customer memo: {invoicePreview.notes || "No memo"}</p>
                </div>
                {invoicePreview.already_invoiced ? (
                  <Badge className="border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]">Created #{invoicePreview.invoice_number ?? "unknown"}</Badge>
                ) : invoicePreview.can_create ? (
                  <Badge className="border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]">Ready to create</Badge>
                ) : (
                  <Badge className="border-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-warning-foreground)]">Needs review</Badge>
                )}
              </div>

              {invoicePreview.errors.length > 0 || invoicePreview.warnings.length > 0 ? (
                <div className="space-y-2">
                  {invoicePreview.errors.map((message, index) => (
                    <InlineNotice key={`error-${index}-${message}`} tone="error">{message}</InlineNotice>
                  ))}
                  {invoicePreview.warnings.map((message, index) => (
                    <InlineNotice key={`warning-${index}-${message}`} tone="warning">{message}</InlineNotice>
                  ))}
                </div>
              ) : null}

              <div className="rounded-md border">
                <Table className="min-w-[36rem]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice line</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicePreview.line_items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">No invoice lines are available.</TableCell>
                      </TableRow>
                    ) : (
                      invoicePreview.line_items.map((item, index) => (
                        <TableRow key={`${item.source}-${item.cost_id ?? index}`}>
                          <TableCell className="whitespace-normal font-medium text-foreground">{item.description}</TableCell>
                          <TableCell className="whitespace-normal text-muted-foreground">
                            {item.source === "client_billable_amount" ? "Client billable amount" : "Selected associated cost"}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{formatMoney(Number(item.amount))}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-md border border-[var(--color-accent-border)] bg-accent p-3">
                  <p className="text-xs text-accent-foreground">QuickBooks invoice total</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatMoney(invoicePreview.totals.invoice_total)}</p>
                </div>
                <div className="rounded-md border bg-secondary p-3">
                  <p className="text-xs text-muted-foreground">Supplier cost basis</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatMoney(invoicePreview.totals.internal_supplier_cost_basis)}</p>
                </div>
                <div className="rounded-md border bg-secondary p-3">
                  <p className="text-xs text-muted-foreground">All internal associated costs</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatMoney(invoicePreview.totals.internal_associated_costs_total)}</p>
                </div>
                <div className={`rounded-md border p-3 ${invoicePreview.totals.estimated_margin >= 0 ? "border-[var(--color-success)] bg-[var(--color-success-soft)]" : "border-[var(--color-destructive)] bg-[var(--color-destructive-soft)]"}`}>
                  <p className={invoicePreview.totals.estimated_margin >= 0 ? "text-xs text-[var(--color-success)]" : "text-xs text-destructive"}>Estimated margin</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatMoney(invoicePreview.totals.estimated_margin)}</p>
                </div>
              </div>

              {invoicePreview.selected_supplier_quote ? (
                <div className="flex items-start gap-3 rounded-md border bg-secondary p-4">
                  <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Internal supplier quote</p>
                    <p className="mt-1 text-sm leading-5 text-foreground">
                      {invoicePreview.selected_supplier_quote.supplier_name || `Supplier #${invoicePreview.selected_supplier_quote.supplier_id}`} quoted {formatMoney(invoicePreview.selected_supplier_quote.amount, invoicePreview.selected_supplier_quote.currency)}
                      {invoicePreview.selected_supplier_quote.lead_time_days ? ` with a ${invoicePreview.selected_supplier_quote.lead_time_days} day lead time` : ""}.
                    </p>
                  </div>
                </div>
              ) : null}

              <p className="text-xs leading-5 text-muted-foreground">
                Only the invoice lines shown above are sent to QuickBooks. Supplier quote context and unselected costs remain inside IDC Energy.
              </p>
            </section>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      <AlertDialog open={Boolean(costToDelete)} onOpenChange={(open) => { if (!open) setCostToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this associated cost?</AlertDialogTitle>
            <AlertDialogDescription>
              {costToDelete ? `${costToDelete.description} (${formatMoney(Number(costToDelete.amount))}) will be removed from this transaction.` : "This cost will be removed from the transaction."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingCostAction?.kind === "delete"}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (costToDelete) void handleDeleteCost(costToDelete); }}
              disabled={!costToDelete || pendingCostAction?.kind === "delete"}
              className="border-destructive bg-destructive text-destructive-foreground hover:bg-[var(--color-destructive-hover)]"
            >
              Delete cost
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
