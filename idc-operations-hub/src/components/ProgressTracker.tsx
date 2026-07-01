import { Check, Clock, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { WORKFLOW_STEPS } from "../lib/workflowStatus";

interface ProgressTrackerProps {
  currentStepIndex?: number;
  isShipmentConfirmed?: boolean;
  isInvoiceCreated?: boolean;
  onStepAdvance?: (stepIndex: number) => void | Promise<void>;
}

export function ProgressTracker({ 
  currentStepIndex = 0, 
  isShipmentConfirmed = false, 
  isInvoiceCreated = false,
  onStepAdvance 
}: ProgressTrackerProps) {
  const [activeStepIndex, setActiveStepIndex] = useState(currentStepIndex);
  const [animatingStep, setAnimatingStep] = useState<number | null>(null);
  const [savingStepIndex, setSavingStepIndex] = useState<number | null>(null);

  useEffect(() => {
    setActiveStepIndex(currentStepIndex);
  }, [currentStepIndex]);

  const shippingIndex = WORKFLOW_STEPS.findIndex((s) => s.id === "shipment-clearance-delivery");
  const paymentIndex = WORKFLOW_STEPS.findIndex((s) => s.id === "payment-received");

  const handleAdvanceStep = useCallback(async (targetIndex?: number) => {
    const nextIndex = targetIndex ?? Math.min(activeStepIndex + 1, WORKFLOW_STEPS.length - 1);

    if (nextIndex > activeStepIndex && savingStepIndex === null) {
      setAnimatingStep(nextIndex);
      setSavingStepIndex(nextIndex);

      try {
        await onStepAdvance?.(nextIndex);
        setActiveStepIndex(nextIndex);
        toast.success(`Workflow updated to ${WORKFLOW_STEPS[nextIndex].label}`, {
          description: WORKFLOW_STEPS[nextIndex].description,
        });
      } catch {
        toast.error("Could not update workflow status", {
          description: "The transaction was not changed. Please try again.",
        });
      } finally {
        setAnimatingStep(null);
        setSavingStepIndex(null);
      }
    }
  }, [activeStepIndex, onStepAdvance, savingStepIndex]);

  useEffect(() => {
    if (isShipmentConfirmed && shippingIndex !== -1 && activeStepIndex < shippingIndex) {
      void handleAdvanceStep(shippingIndex);
    }
  }, [activeStepIndex, handleAdvanceStep, isShipmentConfirmed, shippingIndex]);

  useEffect(() => {
    if (isInvoiceCreated && paymentIndex !== -1 && activeStepIndex < paymentIndex) {
      void handleAdvanceStep(paymentIndex);
    }
  }, [activeStepIndex, handleAdvanceStep, isInvoiceCreated, paymentIndex]);

  const handleStepClick = (stepIndex: number) => {
    if (stepIndex === activeStepIndex + 1) {
      void handleAdvanceStep(stepIndex);
    } else if (stepIndex <= activeStepIndex) {
      toast.info(`Viewing ${WORKFLOW_STEPS[stepIndex].label}`, {
        description: WORKFLOW_STEPS[stepIndex].description,
      });
    }
  };

  const getStepStatus = (stepIndex: number) => {
    if (stepIndex < activeStepIndex) return "completed";
    if (stepIndex === activeStepIndex) return "active";
    return "pending";
  };

  const canAdvance = activeStepIndex < WORKFLOW_STEPS.length - 1;
  const currentStep = WORKFLOW_STEPS[activeStepIndex] ?? WORKFLOW_STEPS[0];
  const nextStep = WORKFLOW_STEPS[activeStepIndex + 1];
  const progressPercent = ((activeStepIndex + 1) / WORKFLOW_STEPS.length) * 100;
  const isSaving = savingStepIndex !== null;

  return (
    <div className="w-full mb-12">
      <div className="glass-card rounded-lg p-4 mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-gray-600" />
            <span className="text-sm text-gray-600">
              Workflow Status: <span className="font-medium text-teal-600">{currentStep.label}</span>
            </span>
          </div>
          <div className="h-4 border-l border-gray-300"></div>
          <span className="text-xs text-gray-500">{currentStep.description}</span>
        </div>

        <div className="flex items-center space-x-2">
          {canAdvance && (
            <Button
              onClick={() => void handleAdvanceStep()}
              disabled={isSaving}
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
            >
              <ArrowRight className="h-4 w-4 mr-1" />
              {isSaving ? "Saving..." : `Mark ${nextStep?.label ?? "Next Step"} Complete`}
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        {WORKFLOW_STEPS.map((step, index) => {
          const status = getStepStatus(index);
          const isAnimating = animatingStep === index;
          const isClickable = !isSaving && (index === activeStepIndex + 1 || index <= activeStepIndex);

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
              {index < WORKFLOW_STEPS.length - 1 && (
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
      
      <div className="mt-6 glass-card rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Overall Progress</span>
          <span className="text-sm font-medium text-teal-600">
            {Math.round(progressPercent)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-teal-500 to-green-500 h-2 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}
