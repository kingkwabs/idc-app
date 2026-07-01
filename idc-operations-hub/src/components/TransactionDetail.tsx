import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ProgressTracker } from "./ProgressTracker";
import { Button } from "./ui/button";
import { FinancialsTab } from "./FinancialsTab";
import { ShipmentTab } from "./ShipmentTab";
import { DocumentsTab } from "./DocumentsTab";
import { ActivityLog } from "./ActivityLog";
import { fetchTransaction, upsertShipment, updateTransaction, addActivity, updateRefs, fetchClients } from "../lib/api";
import type { TransactionOut } from "../lib/api";
import { getWorkflowStepIndex, getWorkflowStatusLabel, WORKFLOW_STEPS } from "../lib/workflowStatus";

interface TransactionDetailProps {
  onBack: () => void;
}

export function TransactionDetail({ onBack }: TransactionDetailProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const trxId = Number(id);
  const [transaction, setTransaction] = useState<TransactionOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentProgressStep, setCurrentProgressStep] = useState(0);
  const [activeTab, setActiveTab] = useState("documents");
  const [isShipmentConfirmed, setIsShipmentConfirmed] = useState(false);
  const [isInvoiceCreated, setIsInvoiceCreated] = useState(false);
  const [clientName, setClientName] = useState<string | null>(null);

  const applyTransaction = useCallback((data: TransactionOut) => {
    setTransaction(data);
    setCurrentProgressStep(getWorkflowStepIndex(data.status));
  }, []);

  const reload = async () => {
    if (!trxId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTransaction(trxId);
      applyTransaction(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load transaction");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id || !trxId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [data, clientsRes] = await Promise.all([
          fetchTransaction(trxId),
          fetchClients(),
        ]);
        if (cancelled) return;
        applyTransaction(data);
        const client = clientsRes.items.find(c => c.id === data.client_id);
        setClientName(client?.name ?? null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load transaction");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applyTransaction, id, trxId]);

  // no-op retained for potential future manual step selection

  const handleTrackerAdvance = async (nextIndex: number) => {
    if (!trxId) return;
    const statusId = WORKFLOW_STEPS[nextIndex]?.id || WORKFLOW_STEPS[0].id;
    await updateTransaction(trxId, { status: statusId });
    await addActivity(trxId, { action: "status-updated", details: statusId });
    setCurrentProgressStep(nextIndex);
    await reload();
  };

  useEffect(() => {
    if (activeTab === "documents" && currentProgressStep > 0) {
      setIsShipmentConfirmed(false);
      setIsInvoiceCreated(false);
    }
  }, [activeTab]);

  const handleShipmentConfirmed = async (payload: { leadTime?: string; trackingNumber?: string; shippedDate?: string; etaDate?: string; }) => {
    if (!trxId) return;
    await upsertShipment(trxId, {
      lead_time_days: payload.leadTime ? Number(payload.leadTime) : undefined,
      tracking_number: payload.trackingNumber,
      shipped_date: payload.shippedDate,
      eta_date: payload.etaDate,
    });
    await updateTransaction(trxId, { status: "shipment-clearance-delivery" });
    await addActivity(trxId, { action: "shipment-confirmed", details: payload.trackingNumber });
    setIsShipmentConfirmed(true);
    await reload();
  };

  const handleInvoiceCreated = async () => {
    if (!trxId) return;
    await updateTransaction(trxId, { status: "payment-received" });
    await addActivity(trxId, { action: "invoice-created", details: "Invoice recorded" });
    setIsInvoiceCreated(true);
    await reload();
  };

  const renderActiveTab = () => {
    if (activeTab === "financials") {
      return isInvoiceCreated ? (
        <div className="p-4">
          <p className="text-green-600">Invoice has already been created and payment is recorded.</p>
        </div>
      ) : (
        <FinancialsTab onInvoiceCreated={handleInvoiceCreated} transactionId={trxId} clientPoAmount={(transaction as any)?.client_po_amount ?? null} supplierPoAmount={(transaction as any)?.supplier_po_amount ?? null} onAmountsSaved={reload} />
      );
    }

    if (activeTab === "shipment") {
      return isShipmentConfirmed ? (
        <div className="p-4">
          <p className="text-green-600">Shipment has already been confirmed.</p>
        </div>
      ) : (
        <ShipmentTab onShipmentConfirmed={handleShipmentConfirmed} />
      );
    }

    return <DocumentsTab transactionId={trxId} />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-800">
          {loading ? "Loading..." : error ? "Transaction Detail" : `Transaction #${transaction?.id}`}
        </h2>
        <div className="space-x-2">
          <Button onClick={() => setActiveTab("documents")} variant={activeTab === "documents" ? "default" : "outline"}>Documents</Button>
          <Button onClick={() => setActiveTab("shipment")} variant={activeTab === "shipment" ? "default" : "outline"}>Shipment</Button>
          <Button onClick={() => setActiveTab("financials")} variant={activeTab === "financials" ? "default" : "outline"}>Financials</Button>
          <Button variant="outline" onClick={() => navigate(-1)}>Back</Button>
          {trxId ? (
            <Button variant="destructive" className="bg-red-600 hover:bg-red-700 text-white shadow-lg" onClick={async () => {
              const confirmed = window.confirm("This will permanently delete the transaction and all associated records (documents, shipment, activity). This action cannot be undone. Continue?");
              if (!confirmed) return;
              try {
                const mod = await import('../lib/api');
                await mod.deleteTransaction(trxId);
                navigate('/');
              } catch (e) {
                console.error(e);
                alert('Failed to delete transaction');
              }
            }}>Delete</Button>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="glass-card rounded-lg p-3 text-red-600">{error}</div>
      )}

      {!error && (
        <div className="glass-card rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-gray-500">Client</div>
              <div className="text-gray-900">{clientName ?? (transaction ? `Client #${transaction.client_id}` : "—")}</div>
            </div>
            <div>
              <div className="text-gray-500">Status</div>
              <div className="text-gray-900">{getWorkflowStatusLabel(transaction?.status)}</div>
            </div>
            <div>
              <div className="text-gray-500">RFQ Number</div>
              <div className="flex items-center gap-2">
                <span className="text-gray-900">{transaction?.rfq_number || "—"}</span>
                {trxId ? (
                  <Button size="sm" variant="outline" onClick={async () => {
                    const val = window.prompt("Enter RFQ Number:", transaction?.rfq_number || "");
                    if (val !== null) {
                      await updateRefs(trxId, { rfq_number: val || undefined });
                      await addActivity(trxId, { action: "refs-updated", details: `rfq:${val}` });
                      await reload();
                    }
                  }}>Edit</Button>
                ) : null}
              </div>
            </div>
            <div>
              <div className="text-gray-500">Client PO Number</div>
              <div className="flex items-center gap-2">
                <span className="text-gray-900">{(transaction as any)?.client_po_number || "—"}</span>
                {trxId ? (
                  <Button size="sm" variant="outline" onClick={async () => {
                    const val = window.prompt("Enter Client PO Number:", (transaction as any)?.client_po_number || "");
                    if (val !== null) {
                      await updateRefs(trxId, { client_po_number: val || undefined });
                      await addActivity(trxId, { action: "refs-updated", details: `cpo:${val}` });
                      await reload();
                    }
                  }}>Edit</Button>
                ) : null}
              </div>
            </div>
            <div>
              <div className="text-gray-500">Supplier PO Number</div>
              <div className="flex items-center gap-2">
                <span className="text-gray-900">{(transaction as any)?.supplier_po_number || "—"}</span>
                {trxId ? (
                  <Button size="sm" variant="outline" onClick={async () => {
                    const val = window.prompt("Enter Supplier PO Number:", (transaction as any)?.supplier_po_number || "");
                    if (val !== null) {
                      await updateRefs(trxId, { supplier_po_number: val || undefined });
                      await addActivity(trxId, { action: "refs-updated", details: `spo:${val}` });
                      await reload();
                    }
                  }}>Edit</Button>
                ) : null}
              </div>
            </div>
            <div className="md:col-span-3">
              <div className="text-gray-500">Description</div>
              <div className="text-gray-900">{transaction?.item_description || "—"}</div>
            </div>
            {/* Supplier quotes now live in Financials tab */}
            {/* Supplier linking moved to Financials tab */}
          </div>
        </div>
      )}

      <ProgressTracker
        currentStepIndex={currentProgressStep}
        isShipmentConfirmed={isShipmentConfirmed}
        isInvoiceCreated={isInvoiceCreated}
        onStepAdvance={handleTrackerAdvance}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="glass-card rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Workspace</h3>
            {renderActiveTab()}
          </div>
        </div>
        <div>
          <div className="glass-card rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Activity Log</h3>
            {trxId ? <ActivityLog transactionId={trxId} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
