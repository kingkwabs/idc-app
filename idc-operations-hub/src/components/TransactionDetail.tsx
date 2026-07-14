import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { ProgressTracker } from "./ProgressTracker";
import { TabNavigation } from "./TabNavigation";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Skeleton } from "./ui/skeleton";
import { FinancialsTab } from "./FinancialsTab";
import { ShipmentTab } from "./ShipmentTab";
import { DocumentsTab } from "./DocumentsTab";
import { ActivityLog } from "./ActivityLog";
import {
  deleteTransaction,
  fetchClients,
  fetchTransaction,
  updateRefs,
  updateTransaction,
  upsertShipment,
} from "../lib/api";
import type { TransactionOut } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getWorkflowStepIndex, getWorkflowStatusLabel, WORKFLOW_STEPS } from "../lib/workflowStatus";

interface TransactionDetailProps {
  onBack: () => void;
  backLabel: string;
}

type WorkspaceTab = "documents" | "shipment" | "financials";
type ReferenceField = "rfq_number" | "client_po_number" | "supplier_po_number";

const WORKSPACE_TABS = [
  { id: "documents", label: "Documents" },
  { id: "shipment", label: "Shipment" },
  { id: "financials", label: "Financials" },
];

const SHIPPING_STEP_INDEX = WORKFLOW_STEPS.findIndex(
  (step) => step.id === "shipment-clearance-delivery",
);

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatReceivedDate(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function TransactionDetail({ onBack, backLabel }: TransactionDetailProps) {
  const { id } = useParams();
  const { user } = useAuth();
  const transactionId = Number(id);
  const hasValidTransactionId = Number.isInteger(transactionId) && transactionId > 0;
  const [transaction, setTransaction] = useState<TransactionOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [currentProgressStep, setCurrentProgressStep] = useState(0);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("documents");
  const [clientName, setClientName] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [loadRequestKey, setLoadRequestKey] = useState(0);
  const [referenceEditor, setReferenceEditor] = useState<{
    field: ReferenceField;
    label: string;
  } | null>(null);
  const [referenceValue, setReferenceValue] = useState("");

  const applyTransaction = useCallback((data: TransactionOut) => {
    setTransaction(data);
    setCurrentProgressStep(getWorkflowStepIndex(data.status));
  }, []);

  useEffect(() => {
    if (!hasValidTransactionId) {
      setTransaction(null);
      setLoadError("This transaction link is invalid.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    setTransaction(null);
    setClientName(null);

    void Promise.allSettled([
      fetchTransaction(transactionId),
      fetchClients(),
    ]).then(([transactionResult, clientResult]) => {
      if (cancelled) return;

      if (transactionResult.status === "rejected") {
        setLoadError(getErrorMessage(transactionResult.reason, "Failed to load this transaction."));
        setLoading(false);
        return;
      }

      applyTransaction(transactionResult.value);
      if (clientResult.status === "fulfilled") {
        const client = clientResult.value.items.find(
          (item) => item.id === transactionResult.value.client_id,
        );
        setClientName(client?.name ?? null);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [applyTransaction, hasValidTransactionId, loadRequestKey, transactionId]);

  const reload = useCallback(async () => {
    if (!hasValidTransactionId) throw new Error("Invalid transaction ID.");
    const data = await fetchTransaction(transactionId);
    applyTransaction(data);
  }, [applyTransaction, hasValidTransactionId, transactionId]);

  const handleTrackerAdvance = async (nextIndex: number) => {
    if (!hasValidTransactionId) throw new Error("Invalid transaction ID.");
    const nextStatus = WORKFLOW_STEPS[nextIndex];
    if (!nextStatus) throw new Error("Invalid workflow stage.");

    const updated = await updateTransaction(transactionId, {
      status: nextStatus.id,
      status_reason: `Advanced through the workflow tracker to ${nextStatus.label}.`,
    });
    applyTransaction(updated);
  };

  const handleShipmentConfirmed = async (payload: {
    leadTime?: string;
    trackingNumber?: string;
    shippedDate?: string;
    etaDate?: string;
  }) => {
    if (!hasValidTransactionId || pendingAction) return;
    setPendingAction("shipment");
    setActionError(null);

    try {
      const result = await upsertShipment(transactionId, {
        lead_time_days: payload.leadTime ? Number(payload.leadTime) : undefined,
        tracking_number: payload.trackingNumber,
        shipped_date: payload.shippedDate,
        eta_date: payload.etaDate,
      });
      const nextStatus = result.status || transaction?.status || "shipment-clearance-delivery";
      setTransaction((current) => current ? { ...current, status: nextStatus } : current);
      setCurrentProgressStep(getWorkflowStepIndex(nextStatus));
    } catch (error) {
      const message = getErrorMessage(error, "Shipment details could not be saved.");
      setActionError(message);
      toast.error("Shipment not confirmed", { description: message });
    } finally {
      setPendingAction(null);
    }
  };

  const handleInvoiceCreated = async () => {
    try {
      await reload();
    } catch (error) {
      const message = getErrorMessage(
        error,
        "The invoice was created, but its status could not be refreshed.",
      );
      setActionError(message);
      toast.warning("Invoice created; transaction refresh needed", {
        description: message,
      });
    }
  };

  const openReferenceEditor = (
    field: ReferenceField,
    label: string,
    currentValue?: string | null,
  ) => {
    if (!hasValidTransactionId || pendingAction) return;
    setReferenceEditor({ field, label });
    setReferenceValue(currentValue ?? "");
  };

  const handleReferenceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!referenceEditor || !hasValidTransactionId || pendingAction) return;

    const { field, label } = referenceEditor;
    const normalizedValue = referenceValue.trim();
    const actionKey = `reference-${field}`;
    setPendingAction(actionKey);
    setActionError(null);

    try {
      const payload: Partial<Record<ReferenceField, string>> = {
        [field]: normalizedValue,
      };
      await updateRefs(transactionId, payload);
      setTransaction((current) => current ? { ...current, [field]: normalizedValue || null } : current);
      setReferenceEditor(null);
      toast.success(`${label} updated`);
    } catch (error) {
      const message = getErrorMessage(error, `${label} could not be updated.`);
      setActionError(message);
      toast.error(`${label} not updated`, { description: message });
    } finally {
      setPendingAction(null);
    }
  };

  const handleDelete = async () => {
    if (!hasValidTransactionId || pendingAction) return;
    const confirmed = window.confirm(
      "This permanently deletes the transaction and its documents, shipment details, and activity history. This action cannot be undone. Continue?",
    );
    if (!confirmed) return;

    setPendingAction("delete");
    setActionError(null);
    try {
      await deleteTransaction(transactionId);
      onBack();
    } catch (error) {
      const message = getErrorMessage(error, "The transaction could not be deleted.");
      setActionError(message);
      toast.error("Transaction not deleted", { description: message });
      setPendingAction(null);
    }
  };

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading transaction" className="space-y-6">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {backLabel}
        </Button>
        <span className="sr-only">Loading transaction details...</span>
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full max-w-lg" />
        </div>
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-56 w-full" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (loadError || !transaction) {
    return (
      <div className="space-y-6">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {backLabel}
        </Button>
        <section
          role="alert"
          className="rounded-lg border border-destructive bg-card p-6 shadow-[var(--shadow-card)]"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">Transaction unavailable</h1>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
                {loadError ?? "This transaction could not be found."}
              </p>
            </div>
          </div>
          {hasValidTransactionId ? (
            <Button
              type="button"
              variant="outline"
              className="mt-5"
              onClick={() => setLoadRequestKey((key) => key + 1)}
            >
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
          ) : null}
        </section>
      </div>
    );
  }

  const isShipmentConfirmed =
    SHIPPING_STEP_INDEX !== -1 && currentProgressStep >= SHIPPING_STEP_INDEX;
  const isInvoiceCreated = Boolean(
    transaction.quickbooks_invoice_id || transaction.quickbooks_invoice_status === "succeeded",
  );
  const hasProtectedQuickBooksHistory = Boolean(
    transaction.quickbooks_invoice_id ||
    transaction.invoiced_at ||
    ["pending", "succeeded", "unknown"].includes(transaction.quickbooks_invoice_status || ""),
  );
  const referenceRows: Array<{ field: ReferenceField; label: string; value?: string | null }> = [
    { field: "rfq_number", label: "RFQ number", value: transaction.rfq_number },
    { field: "client_po_number", label: "Client PO number", value: transaction.client_po_number },
    { field: "supplier_po_number", label: "Supplier PO number", value: transaction.supplier_po_number },
  ];

  const renderActiveTab = () => {
    if (activeTab === "financials") {
      return (
        <div className="space-y-5">
          {isInvoiceCreated ? (
            <div className="rounded-md border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-[var(--color-success)]">
              <div className="flex items-start gap-3">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-semibold">QuickBooks invoice created</p>
                  <p className="mt-1 text-sm leading-5">
                    {transaction.quickbooks_invoice_number
                      ? `Invoice ${transaction.quickbooks_invoice_number} is recorded in QuickBooks. `
                      : "The invoice is recorded in QuickBooks. "}
                    Invoicing does not mean payment was received. Advance to Payment Received only after the client payment lands.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          <FinancialsTab
            onInvoiceCreated={handleInvoiceCreated}
            transactionId={transactionId}
            canManageQuickBooks={user?.role === "admin"}
            clientPoAmount={transaction.client_po_amount ?? null}
            clientQuoteAmount={transaction.client_quote_amount ?? null}
            supplierPoAmount={transaction.supplier_po_amount ?? null}
            onAmountsSaved={reload}
          />
        </div>
      );
    }

    if (activeTab === "shipment") {
      if (isShipmentConfirmed) {
        return (
          <div className="rounded-md border border-[var(--color-success)] bg-[var(--color-success-soft)] p-5 text-[var(--color-success)]">
            <div className="flex items-start gap-3">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-semibold">Shipment confirmed</p>
                <p className="mt-1 text-sm leading-5">
                  Shipment details are recorded and the workflow has reached Shipment &amp; Delivery.
                </p>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div aria-busy={pendingAction === "shipment"} className="space-y-3">
          {pendingAction === "shipment" ? (
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm font-medium text-[var(--color-warning-foreground)]">
              <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
              Saving shipment details and updating workflow status...
            </div>
          ) : null}
          <div className={pendingAction === "shipment" ? "pointer-events-none opacity-60" : undefined}>
            <ShipmentTab onShipmentConfirmed={handleShipmentConfirmed} />
          </div>
        </div>
      );
    }

    return <DocumentsTab transactionId={transactionId} />;
  };

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {backLabel}
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Transaction <span data-numeric="true">#{transaction.id}</span>
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
              {transaction.item_description || "Untitled transaction"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {clientName ?? `Client #${transaction.client_id}`}
            </p>
          </div>

          {user?.role === "admin" && !hasProtectedQuickBooksHistory ? (
            <Button
              type="button"
              variant="destructive"
              disabled={pendingAction !== null}
              onClick={() => void handleDelete()}
              className="w-full sm:w-auto"
            >
              {pendingAction === "delete" ? (
                <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {pendingAction === "delete" ? "Deleting..." : "Delete transaction"}
            </Button>
          ) : null}
        </div>
      </header>

      {actionError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-destructive bg-[var(--color-destructive-soft)] p-4 text-destructive"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Action not completed</p>
            <p className="mt-1 text-sm leading-5">{actionError}</p>
          </div>
        </div>
      ) : null}

      <section aria-labelledby="transaction-summary-title" className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="transaction-summary-title" className="text-base font-semibold text-foreground">
            Transaction summary
          </h2>
          <span className="inline-flex w-fit items-center rounded-full border border-[var(--color-accent-border)] bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
            {getWorkflowStatusLabel(transaction.status)}
          </span>
        </div>

        <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Client</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {clientName ?? `Client #${transaction.client_id}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">RFQ received</dt>
            <dd data-numeric="true" className="mt-1 text-sm font-medium text-foreground">
              {formatReceivedDate(transaction.date_received)}
            </dd>
          </div>

          {referenceRows.map(({ field, label, value }) => {
            const actionKey = `reference-${field}`;
            return (
              <div key={field}>
                <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-1 flex min-h-8 items-center gap-2 text-sm font-medium text-foreground">
                  <span className="min-w-0 truncate" title={value || undefined}>{value || "Not recorded"}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pendingAction !== null}
                    aria-label={`Edit ${label}`}
                    onClick={() => openReferenceEditor(field, label, value)}
                  >
                    {pendingAction === actionKey ? (
                      <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                    ) : (
                      <Pencil aria-hidden="true" />
                    )}
                    Edit
                  </Button>
                </dd>
              </div>
            );
          })}

          <div className="sm:col-span-2 xl:col-span-3">
            <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Description</dt>
            <dd className="mt-1 text-sm leading-5 text-foreground">
              {transaction.item_description || "No description recorded."}
            </dd>
          </div>
        </dl>
      </section>

      <ProgressTracker
        currentStepIndex={currentProgressStep}
        isShipmentConfirmed={isShipmentConfirmed}
        onStepAdvance={handleTrackerAdvance}
      />

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-3">
        <section aria-labelledby="transaction-workspace-title" className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-card)] 2xl:col-span-2">
          <div className="border-b border-border px-4 py-4 sm:px-5">
            <h2 id="transaction-workspace-title" className="text-base font-semibold text-foreground">
              Transaction workspace
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage the documents, fulfillment details, and financial record for this transaction.
            </p>
          </div>
          <div className="px-4 pt-2 sm:px-5">
            <TabNavigation
              tabs={WORKSPACE_TABS}
              activeTab={activeTab}
              onTabChange={(tabId) => setActiveTab(tabId as WorkspaceTab)}
              completedTabs={{ shipment: isShipmentConfirmed, financials: isInvoiceCreated }}
              ariaLabel="Transaction workspace sections"
            />
          </div>
          <div
            role="tabpanel"
            tabIndex={0}
            aria-label={`${WORKSPACE_TABS.find((tab) => tab.id === activeTab)?.label} workspace`}
            className="min-h-72 p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring-soft)] sm:p-5"
          >
            {renderActiveTab()}
          </div>
        </section>

        <aside aria-label="Transaction activity">
          <ActivityLog transactionId={transactionId} />
        </aside>
      </div>

      <Dialog
        open={referenceEditor !== null}
        onOpenChange={(open) => {
          if (!open && pendingAction === null) setReferenceEditor(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {referenceEditor?.label || "reference"}</DialogTitle>
            <DialogDescription>Update the operational reference stored on this transaction.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReferenceSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="transaction-reference-value">{referenceEditor?.label}</Label>
              <Input
                id="transaction-reference-value"
                autoFocus
                maxLength={160}
                value={referenceValue}
                onChange={(event) => setReferenceValue(event.target.value)}
                disabled={pendingAction !== null}
                placeholder="Leave blank to clear"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReferenceEditor(null)} disabled={pendingAction !== null}>Cancel</Button>
              <Button type="submit" disabled={pendingAction !== null}>
                {pendingAction?.startsWith("reference-") ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}
                {pendingAction?.startsWith("reference-") ? "Saving..." : "Save reference"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
