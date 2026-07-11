import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clock3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { WORKFLOW_STEPS } from "../lib/workflowStatus";

interface ProgressTrackerProps {
  currentStepIndex?: number;
  isShipmentConfirmed?: boolean;
  onStepAdvance?: (stepIndex: number) => void | Promise<void>;
}

function clampStepIndex(index: number) {
  return Math.min(Math.max(index, 0), WORKFLOW_STEPS.length - 1);
}

export function ProgressTracker({
  currentStepIndex = 0,
  isShipmentConfirmed = false,
  onStepAdvance,
}: ProgressTrackerProps) {
  const [activeStepIndex, setActiveStepIndex] = useState(() => clampStepIndex(currentStepIndex));
  const [savingStepIndex, setSavingStepIndex] = useState<number | null>(null);
  const shipmentAdvanceAttempted = useRef(false);

  useEffect(() => {
    setActiveStepIndex(clampStepIndex(currentStepIndex));
  }, [currentStepIndex]);

  const handleAdvanceStep = useCallback(async (targetIndex?: number) => {
    const nextIndex = clampStepIndex(targetIndex ?? activeStepIndex + 1);
    if (nextIndex <= activeStepIndex || savingStepIndex !== null) return;

    const targetStep = WORKFLOW_STEPS[nextIndex];
    if (targetStep.id === "payment-received") {
      const confirmed = window.confirm(
        "Confirm that the client payment has actually reached the expected account. Creating a QuickBooks invoice is not payment confirmation.",
      );
      if (!confirmed) return;
    }
    if (targetStep.id === "loans-cleared") {
      const confirmed = window.confirm(
        "Confirm that all bank loans tied to this transaction have been cleared.",
      );
      if (!confirmed) return;
    }

    setSavingStepIndex(nextIndex);
    try {
      await onStepAdvance?.(nextIndex);
      setActiveStepIndex(nextIndex);
      toast.success("Workflow status updated", {
        description: `Transaction moved to ${WORKFLOW_STEPS[nextIndex].label}.`,
      });
    } catch (error) {
      toast.error("Could not update workflow status", {
        description: error instanceof Error
          ? error.message
          : "The transaction was not changed. Please try again.",
      });
    } finally {
      setSavingStepIndex(null);
    }
  }, [activeStepIndex, onStepAdvance, savingStepIndex]);

  const shippingIndex = WORKFLOW_STEPS.findIndex(
    (step) => step.id === "shipment-clearance-delivery",
  );

  useEffect(() => {
    if (!isShipmentConfirmed) {
      shipmentAdvanceAttempted.current = false;
      return;
    }
    if (
      shippingIndex === -1
      || currentStepIndex >= shippingIndex
      || activeStepIndex >= shippingIndex
      || shipmentAdvanceAttempted.current
    ) {
      return;
    }

    shipmentAdvanceAttempted.current = true;
    void handleAdvanceStep(shippingIndex);
  }, [activeStepIndex, currentStepIndex, handleAdvanceStep, isShipmentConfirmed, shippingIndex]);

  const currentStep = WORKFLOW_STEPS[activeStepIndex] ?? WORKFLOW_STEPS[0];
  const nextStep = WORKFLOW_STEPS[activeStepIndex + 1];
  const progressPercent = Math.round(((activeStepIndex + 1) / WORKFLOW_STEPS.length) * 100);
  const isSaving = savingStepIndex !== null;

  return (
    <section aria-labelledby="workflow-progress-title" className="space-y-4">
      <div
        aria-busy={isSaving}
        className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock3 aria-hidden="true" className="size-4" />
              <span id="workflow-progress-title">Current workflow stage</span>
              <span aria-hidden="true">/</span>
              <span data-numeric="true">
                {activeStepIndex + 1} of {WORKFLOW_STEPS.length}
              </span>
            </div>
            <p aria-live="polite" className="mt-2 text-lg font-semibold tracking-[-0.01em] text-foreground">
              {currentStep.label}
            </p>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
              {currentStep.description}
            </p>
          </div>

          {nextStep ? (
            <Button
              type="button"
              onClick={() => void handleAdvanceStep()}
              disabled={isSaving}
              className="w-full lg:w-auto"
            >
              {isSaving ? (
                <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              ) : (
                <ArrowRight aria-hidden="true" />
              )}
              {isSaving ? "Updating status..." : `Move to ${nextStep.label}`}
            </Button>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-md border border-[var(--color-success)] bg-[var(--color-success-soft)] px-3 py-2 text-sm font-medium text-[var(--color-success)]">
              <Check aria-hidden="true" className="size-4" />
              Workflow complete
            </div>
          )}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-4 text-xs font-medium text-muted-foreground">
            <span>Overall progress</span>
            <span data-numeric="true">{progressPercent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Transaction workflow progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150 [transition-timing-function:var(--ease-out-ui)] motion-reduce:transition-none"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <ol aria-label="Transaction workflow stages" className="flex min-w-max gap-2">
          {WORKFLOW_STEPS.map((step, index) => {
            const isCompleted = index < activeStepIndex;
            const isCurrent = index === activeStepIndex;
            const isNext = index === activeStepIndex + 1;
            const isTargetSaving = savingStepIndex === index;
            const stageClassName = `flex min-h-28 w-44 flex-col rounded-lg border p-3 text-left transition-[color,background-color,border-color,box-shadow,transform] duration-150 [transition-timing-function:var(--ease-out-ui)] motion-reduce:transition-none ${
              isCompleted
                ? "border-[var(--color-success)] bg-[var(--color-success-soft)]"
                : isCurrent
                  ? "border-primary bg-accent shadow-[var(--shadow-control)]"
                  : isNext
                    ? "border-[var(--color-warning)] bg-[var(--color-warning-soft)] hover:shadow-[var(--shadow-control)]"
                    : "border-border bg-card"
            }`;

            const stageContent = (
              <>
                <span className="flex items-center justify-between gap-2">
                  <span
                    data-numeric="true"
                    className={`inline-flex size-7 items-center justify-center rounded-full border text-xs font-semibold ${
                      isCompleted
                        ? "border-[var(--color-success)] bg-[var(--color-success)] text-[var(--color-success-foreground)]"
                        : isCurrent
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {isCompleted ? <Check aria-hidden="true" className="size-4" /> : index + 1}
                  </span>
                  {isNext ? (
                    <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-warning-foreground)]">
                      Next
                    </span>
                  ) : null}
                </span>
                <span className="mt-3 text-sm font-semibold leading-5 text-foreground">
                  {step.label}
                </span>
                <span className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">
                  {step.description}
                </span>
              </>
            );

            return (
              <li key={step.id}>
                {isNext ? (
                  <button
                    type="button"
                    disabled={isSaving}
                    aria-label={`Move workflow to ${step.label}`}
                    onClick={() => void handleAdvanceStep(index)}
                    className={`${stageClassName} outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-soft)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:active:scale-100`}
                  >
                    {isTargetSaving ? (
                      <span className="mb-1 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                        Updating
                      </span>
                    ) : null}
                    {stageContent}
                  </button>
                ) : (
                  <div aria-current={isCurrent ? "step" : undefined} className={stageClassName}>
                    {stageContent}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
