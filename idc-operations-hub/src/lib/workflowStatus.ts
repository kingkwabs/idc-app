export interface WorkflowStep {
  id: string;
  label: string;
  description: string;
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  { id: "rfq-from-client", label: "RFQ from Client", description: "Client submits RFQ" },
  { id: "rfqs-to-suppliers", label: "Send RFQs to Suppliers", description: "RFQs sent to suppliers" },
  { id: "receive-supplier-quotes", label: "Receive Quotations", description: "Collect supplier quotations" },
  { id: "prepare-proposal", label: "Prepare Proposal", description: "Draft proposal for client" },
  { id: "director-approval", label: "Director Approval", description: "Company directors approve proposal" },
  { id: "proposal-sent-client", label: "Approved Proposal Sent", description: "Approved proposal shared with client" },
  { id: "client-draft-po", label: "Client Draft PO", description: "Client provides draft PO" },
  { id: "po-to-suppliers", label: "PO to Suppliers", description: "Prepare PO and send to suppliers" },
  { id: "client-confirmed-po", label: "Client Confirmed PO", description: "Client provides confirmed PO" },
  { id: "commercial-arrangements", label: "Commercial Arrangements", description: "Complete commercial arrangements" },
  { id: "leadtime-shipping-arrangement", label: "Leadtime & Shipping Arrangement", description: "Plan leadtime and shipping" },
  { id: "shipment-clearance-delivery", label: "Shipment & Delivery", description: "Shipment, clearance, and delivery" },
  { id: "delivery-docs-submitted", label: "Delivery Docs Submitted", description: "Delivery documents submitted" },
  { id: "payment-received", label: "Payment Received", description: "Client payment received" },
  { id: "loans-cleared", label: "Loans Cleared", description: "Bank loans on transaction cleared" },
];

export const MANUAL_WORKFLOW_STATUSES: WorkflowStep[] = [
  ...WORKFLOW_STEPS,
  { id: "on-hold", label: "On Hold", description: "Workflow is paused" },
  { id: "cancelled", label: "Cancelled", description: "Transaction is cancelled" },
];

const STATUS_BY_ID = new Map(MANUAL_WORKFLOW_STATUSES.map(status => [status.id, status]));

export function getCanonicalWorkflowStatus(status?: string | null): string {
  if (!status) return WORKFLOW_STEPS[0].id;
  if (STATUS_BY_ID.has(status)) return status;

  const normalized = status.trim().toLowerCase();
  if (!normalized) return WORKFLOW_STEPS[0].id;
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("hold")) return "on-hold";
  if (normalized.includes("loan") && (normalized.includes("clear") || normalized.includes("settle"))) return "loans-cleared";
  if (normalized.includes("paid") || normalized.includes("payment")) return "payment-received";
  if (normalized.includes("delivery") || normalized.includes("delivered")) return "shipment-clearance-delivery";
  if (normalized.includes("shipping arrangement") || normalized.includes("leadtime")) return "leadtime-shipping-arrangement";
  if (normalized.includes("ship") || normalized.includes("clearance")) return "shipment-clearance-delivery";
  if (normalized.includes("docs") || normalized.includes("documents")) return "delivery-docs-submitted";
  if (normalized.includes("po")) {
    if (normalized.includes("supplier")) return "po-to-suppliers";
    if (normalized.includes("confirm") || normalized.includes("received")) return "client-confirmed-po";
    return "client-draft-po";
  }
  if (normalized.includes("approval") || normalized.includes("approve")) return "director-approval";
  if (normalized.includes("proposal") && normalized.includes("sent")) return "proposal-sent-client";
  if (normalized.includes("proposal")) return "prepare-proposal";
  if (normalized.includes("quotation") || normalized.includes("quote")) return "receive-supplier-quotes";
  if (normalized.includes("rfq") && (normalized.includes("receive") || normalized.includes("received"))) return "rfq-from-client";
  if (normalized.includes("rfq")) return "rfqs-to-suppliers";
  if (normalized.includes("commercial")) return "commercial-arrangements";
  if (normalized.includes("progress") || normalized.includes("processing") || normalized.includes("work")) return "commercial-arrangements";

  return status;
}

export function getWorkflowStepIndex(status?: string | null): number {
  const canonicalStatus = getCanonicalWorkflowStatus(status);
  const index = WORKFLOW_STEPS.findIndex(step => step.id === canonicalStatus);
  return index >= 0 ? index : 0;
}

export function getWorkflowStatusLabel(status?: string | null): string {
  if (!status) return WORKFLOW_STEPS[0].label;
  const canonicalStatus = getCanonicalWorkflowStatus(status);
  return STATUS_BY_ID.get(canonicalStatus)?.label ?? status;
}

export function getWorkflowStatusDescription(status?: string | null): string {
  if (!status) return WORKFLOW_STEPS[0].description;
  const canonicalStatus = getCanonicalWorkflowStatus(status);
  return STATUS_BY_ID.get(canonicalStatus)?.description ?? "Custom status";
}

export function getWorkflowStatusBadgeClass(status?: string | null): string {
  const canonicalStatus = getCanonicalWorkflowStatus(status);
  if (canonicalStatus === "cancelled") return "bg-red-500/90 text-white hover:bg-red-600 border border-red-400/30";
  if (canonicalStatus === "on-hold") return "bg-amber-500/90 text-gray-900 hover:bg-amber-600 border border-amber-400/30";
  if (canonicalStatus === "loans-cleared") return "bg-green-500/90 text-white hover:bg-green-600 border border-green-400/30";
  if (canonicalStatus === "payment-received" || canonicalStatus === "delivery-docs-submitted") {
    return "bg-emerald-500/90 text-white hover:bg-emerald-600 border border-emerald-400/30";
  }
  if (canonicalStatus === "shipment-clearance-delivery" || canonicalStatus === "leadtime-shipping-arrangement") {
    return "bg-sky-500/90 text-white hover:bg-sky-600 border border-sky-400/30";
  }
  return "bg-teal-600/90 text-white hover:bg-teal-700 border border-teal-500/30";
}
