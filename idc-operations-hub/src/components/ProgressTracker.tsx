import { Check, Clock, ArrowRight, RotateCcw } from "lucide-react";
import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface Step {
  id: string;
  label: string;
  description: string;
}

const allSteps: Step[] = [
  { id: "rfq-from-client", label: "RFQ from Client", description: "Client submits RFQ" },
  { id: "rfqs-to-suppliers", label: "Send RFQs to Suppliers", description: "RFQs sent to multiple suppliers" },
  { id: "receive-supplier-quotes", label: "Receive Quotations", description: "Collect multiple supplier quotations" },
  { id: "prepare-proposal", label: "Prepare Proposal", description: "Draft proposal for client" },
  { id: "director-approval", label: "Director Approval", description: "Company directors approve proposal" },
  { id: "proposal-sent-client", label: "Approved Proposal Sent", description: "Approved proposal shared with client" },
  { id: "client-draft-po", label: "Client Draft PO", description: "Client provides online/draft PO" },
  { id: "po-to-suppliers", label: "PO to Suppliers", description: "Prepare PO and send to suppliers" },
  { id: "client-confirmed-po", label: "Client Confirmed PO", description: "Client provides confirmed PO" },
  { id: "commercial-arrangements", label: "Commercial Arrangements", description: "Complete commercial arrangements with suppliers" },
  { id: "leadtime-shipping-arrangement", label: "Leadtime & Shipping Arrangement", description: "Plan leadtime and shipping; email docs" },
  { id: "shipment-clearance-delivery", label: "Shipment & Delivery", description: "Shipment, clearance, and delivery to client" },
  { id: "delivery-docs-submitted", label: "Delivery Docs Submitted", description: "Delivery documents prepared and submitted" },
  { id: "payment-received", label: "Payment Received", description: "Client payments received" },
  { id: "loans-cleared", label: "Loans Cleared", description: "Bank loans on transaction cleared" },
];

interface ProgressTrackerProps {
  currentStepIndex?: number;
  isShipmentConfirmed?: boolean;
  isInvoiceCreated?: boolean;
  onStepAdvance?: (stepIndex: number) => void;
}

export function ProgressTracker({ 
  currentStepIndex = 0, 
  isShipmentConfirmed = false, 
  isInvoiceCreated = false,
  onStepAdvance 
}: ProgressTrackerProps) {
  const [activeStepIndex, setActiveStepIndex] = useState(currentStepIndex);
  const [animatingStep, setAnimatingStep] = useState<number | null>(null);

  // Sync internal state when parent-provided step changes (persisted status per transaction)
  useEffect(() => {
    setActiveStepIndex(currentStepIndex);
  }, [currentStepIndex]);

  const shippingIndex = allSteps.findIndex((s) => s.id === "shipment-clearance-delivery");
  const paymentIndex = allSteps.findIndex((s) => s.id === "payment-received");

  // Auto-advance based on actions
  useEffect(() => {
    if (isShipmentConfirmed && shippingIndex !== -1 && activeStepIndex < shippingIndex) {
      setTimeout(() => handleAdvanceStep(shippingIndex), 500);
    }
  }, [isShipmentConfirmed]);

  useEffect(() => {
    if (isInvoiceCreated && paymentIndex !== -1 && activeStepIndex < paymentIndex) {
      setTimeout(() => handleAdvanceStep(paymentIndex), 500);
    }
  }, [isInvoiceCreated]);

  const handleAdvanceStep = (targetIndex?: number) => {
    const nextIndex = targetIndex ?? Math.min(activeStepIndex + 1, allSteps.length - 1);
    
    if (nextIndex > activeStepIndex) {
      setAnimatingStep(nextIndex);
      
      // Animate step by step if jumping multiple steps
      const stepDifference = nextIndex - activeStepIndex;
      for (let i = 1; i <= stepDifference; i++) {
        setTimeout(() => {
          setActiveStepIndex(activeStepIndex + i);
          if (activeStepIndex + i === nextIndex) {
            setAnimatingStep(null);
            toast.success(`Progress updated to ${allSteps[nextIndex].label}!`, {
              description: allSteps[nextIndex].description,
            });
          }
        }, i * 500);
      }
      
      onStepAdvance?.(nextIndex);
    }
  };

  const handleStepClick = (stepIndex: number) => {
    // Allow clicking on current step or next step only
    if (stepIndex === activeStepIndex + 1) {
      handleAdvanceStep(stepIndex);
    } else if (stepIndex <= activeStepIndex) {
      // Allow viewing previous steps
      toast.info(`Viewing ${allSteps[stepIndex].label}`, {
        description: allSteps[stepIndex].description,
      });
    }
  };

  const getStepStatus = (stepIndex: number) => {
    if (stepIndex < activeStepIndex) return "completed";
    if (stepIndex === activeStepIndex) return "active";
    return "pending";
  };

  const canAdvance = activeStepIndex < allSteps.length - 1;

  const handleResetProgress = () => {
    setActiveStepIndex(0);
    setAnimatingStep(null);
    onStepAdvance?.(0);
    toast.info("Progress reset to 'RFQ from Client'", {
      description: "Demo has been reset for testing purposes.",
    });
  };
  return (
    <div className="w-full mb-12">
      {/* Demo Controls */}
      <div className="glass-card rounded-lg p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-gray-600" />
            <span className="text-sm text-gray-600">
              Current: <span className="font-medium text-teal-600">{allSteps[activeStepIndex].label}</span>
            </span>
          </div>
          <div className="h-4 border-l border-gray-300"></div>
          <span className="text-xs text-gray-500">{allSteps[activeStepIndex].description}</span>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button 
            onClick={handleResetProgress}
            size="sm"
            variant="outline"
            className="bg-white/70 hover:bg-white/90 text-gray-600 border-gray-300/50 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset Demo
          </Button>
          
          {canAdvance && (
            <Button 
              onClick={() => handleAdvanceStep()}
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
            >
              <ArrowRight className="h-4 w-4 mr-1" />
              Advance Step
            </Button>
          )}
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between">
        {allSteps.map((step, index) => {
          const status = getStepStatus(index);
          const isAnimating = animatingStep === index;
          const isClickable = index === activeStepIndex + 1 || index <= activeStepIndex;
          
          return (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  onClick={() => isClickable && handleStepClick(index)}
                  className={`w-12 h-12 rounded-full flex items-center justify-center border-2 mb-3 transition-all duration-300 transform ${
                    status === "completed"
                      ? "bg-green-500 border-green-500 text-white shadow-lg"
                      : status === "active"
                      ? "bg-teal-600 border-teal-600 text-white shadow-lg ring-4 ring-teal-600/20"
                      : "bg-white border-gray-300 text-gray-400"
                  } ${
                    isAnimating 
                      ? "scale-110 ring-4 ring-teal-600/40" 
                      : ""
                  } ${
                    isClickable 
                      ? "cursor-pointer hover:scale-105 hover:shadow-lg" 
                      : "cursor-default"
                  }`}
                >
                  {status === "completed" ? (
                    <Check className="w-6 h-6" />
                  ) : status === "active" ? (
                    <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                  ) : (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </div>
                <span
                  className={`text-sm font-medium transition-colors duration-300 ${
                    status === "completed"
                      ? "text-green-600"
                      : status === "active"
                      ? "text-teal-600"
                      : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
                <span className="text-xs text-gray-500 mt-1 text-center max-w-24 leading-tight">
                  {step.description}
                </span>
              </div>
              {index < allSteps.length - 1 && (
                <div className="flex-1 mx-6 mt-[-40px]">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      getStepStatus(index + 1) !== "pending"
                        ? "bg-gradient-to-r from-green-400 to-green-500 shadow-sm"
                        : "bg-gray-200"
                    }`}
                  ></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Progress Percentage */}
      <div className="mt-6 glass-card rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Overall Progress</span>
          <span className="text-sm font-medium text-teal-600">
            {Math.round(((activeStepIndex + 1) / allSteps.length) * 100)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-teal-500 to-green-500 h-2 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${((activeStepIndex + 1) / allSteps.length) * 100}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}