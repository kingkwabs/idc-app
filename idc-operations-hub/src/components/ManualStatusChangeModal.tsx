import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";

interface ManualStatusChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { newStatus: string; reason: string }) => void;
  currentStatus?: string;
}

const statusOptions = [
  { value: "rfq-from-client", label: "RFQ from Client" },
  { value: "rfqs-to-suppliers", label: "Send RFQs to Suppliers" },
  { value: "receive-supplier-quotes", label: "Receive Quotations" },
  { value: "prepare-proposal", label: "Prepare Proposal" },
  { value: "director-approval", label: "Director Approval" },
  { value: "proposal-sent-client", label: "Approved Proposal Sent" },
  { value: "client-draft-po", label: "Client Draft PO" },
  { value: "po-to-suppliers", label: "PO to Suppliers" },
  { value: "client-confirmed-po", label: "Client Confirmed PO" },
  { value: "commercial-arrangements", label: "Commercial Arrangements" },
  { value: "leadtime-shipping-arrangement", label: "Leadtime & Shipping Arrangement" },
  { value: "shipment-clearance-delivery", label: "Shipment & Delivery" },
  { value: "delivery-docs-submitted", label: "Delivery Docs Submitted" },
  { value: "payment-received", label: "Payment Received" },
  { value: "loans-cleared", label: "Loans Cleared" },
  { value: "cancelled", label: "Cancelled" },
  { value: "on-hold", label: "On Hold" },
];

export function ManualStatusChangeModal({
  isOpen,
  onClose,
  onSubmit,
  currentStatus = "RFQ from Client"
}: ManualStatusChangeModalProps) {
  const [formData, setFormData] = useState({
    newStatus: "",
    reason: ""
  });
  const [errors, setErrors] = useState<{ newStatus?: string; reason?: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset errors
    const newErrors: { newStatus?: string; reason?: string } = {};
    
    // Validation
    if (!formData.newStatus) {
      newErrors.newStatus = "Please select a new status";
    }
    
    if (!formData.reason.trim()) {
      newErrors.reason = "A reason for the change is required";
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // Submit the form
    onSubmit(formData);
    
    // Reset form and close modal
    setFormData({ newStatus: "", reason: "" });
    setErrors({});
    onClose();
  };

  const handleClose = () => {
    setFormData({ newStatus: "", reason: "" });
    setErrors({});
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="glass-card max-w-md w-full mx-auto backdrop-blur-lg border border-white/20 shadow-2xl">
        <DialogHeader className="relative">
          <DialogTitle className="text-xl font-semibold text-gray-900 pr-8">
            Manually Change Status
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-600">
            Override the current transaction status with manual intervention.
          </DialogDescription>

        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Current Status Display */}
          <div className="glass-card p-4 rounded-lg bg-gray-50/80 border border-gray-200/50">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <Label className="text-sm font-medium text-gray-700">
                Current Status: <span className="text-gray-900">{currentStatus}</span>
              </Label>
            </div>
          </div>

          {/* New Status Selection */}
          <div className="space-y-2">
            <Label htmlFor="newStatus" className="text-sm font-medium text-gray-700">
              New Status <span className="text-red-500">*</span>
            </Label>
            <Select value={formData.newStatus} onValueChange={(value) => {
              setFormData(prev => ({ ...prev, newStatus: value }));
              setErrors(prev => ({ ...prev, newStatus: undefined }));
            }}>
              <SelectTrigger 
                className={`glass backdrop-blur-sm border-white/20 hover:border-white/40 transition-all duration-200 ${
                  errors.newStatus ? 'border-red-300 ring-red-200' : ''
                }`}
              >
                <SelectValue placeholder="Select new status..." />
              </SelectTrigger>
              <SelectContent className="glass backdrop-blur-sm">
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.newStatus && (
              <p className="text-sm text-red-600">{errors.newStatus}</p>
            )}
          </div>

          {/* Reason for Change */}
          <div className="space-y-2">
            <Label htmlFor="reason" className="text-sm font-medium text-gray-700">
              Reason for Change <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reason"
              value={formData.reason}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, reason: e.target.value }));
                setErrors(prev => ({ ...prev, reason: undefined }));
              }}
              placeholder="A mandatory reason is required..."
              rows={4}
              className={`glass backdrop-blur-sm border-white/20 hover:border-white/40 focus:border-white/60 transition-all duration-200 resize-none ${
                errors.reason ? 'border-red-300 ring-red-200' : ''
              }`}
            />
            {errors.reason && (
              <p className="text-sm text-red-600">{errors.reason}</p>
            )}
          </div>

          {/* Warning Message */}
          <div className="glass-card p-3 rounded-lg bg-red-50/80 border border-red-200/50">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">
                This action will override the natural workflow progression. Manual status changes should only be used in exceptional circumstances.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1 glass backdrop-blur-sm border-white/40 hover:bg-white/20 text-gray-700 hover:text-gray-900 transition-all duration-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
              style={{ backgroundColor: '#EF4444' }}
            >
              Update Status
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}