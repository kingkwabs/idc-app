import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { getWorkflowStatusLabel, MANUAL_WORKFLOW_STATUSES } from "../lib/workflowStatus";

interface ManualStatusChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { newStatus: string; reason: string }) => void | Promise<void>;
  currentStatus?: string;
}

const EMPTY_FORM = { newStatus: "", reason: "" };

export function ManualStatusChangeModal({
  isOpen,
  onClose,
  onSubmit,
  currentStatus = "rfq-from-client",
}: ManualStatusChangeModalProps) {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<{ newStatus?: string; reason?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) return;
    setFormData(EMPTY_FORM);
    setErrors({});
    setSubmitError(null);
    setIsSubmitting(false);
  }, [isOpen]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: { newStatus?: string; reason?: string } = {};
    if (!formData.newStatus) {
      nextErrors.newStatus = "Select a new status.";
    } else if (formData.newStatus === currentStatus) {
      nextErrors.newStatus = "Choose a status different from the current status.";
    }
    if (!formData.reason.trim()) {
      nextErrors.reason = "Explain why this override is necessary.";
    }

    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        newStatus: formData.newStatus,
        reason: formData.reason.trim(),
      });
      // The parent closes only after its status update succeeds.
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "The status could not be updated. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setFormData(EMPTY_FORM);
    setErrors({});
    setSubmitError(null);
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Override workflow status</DialogTitle>
          <DialogDescription>
            Use this only when the transaction cannot follow its normal sequence. The status remains unchanged until the update succeeds.
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-[var(--color-warning-foreground)]">
            <div className="flex items-start gap-3">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em]">Current status</p>
                <p className="mt-1 text-sm font-medium">{getWorkflowStatusLabel(currentStatus)}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-status">
              New status <span className="text-destructive">Required</span>
            </Label>
            <Select
              value={formData.newStatus}
              disabled={isSubmitting}
              onValueChange={(value) => {
                setFormData((previous) => ({ ...previous, newStatus: value }));
                setErrors((previous) => ({ ...previous, newStatus: undefined }));
                setSubmitError(null);
              }}
            >
              <SelectTrigger
                id="manual-status"
                aria-invalid={Boolean(errors.newStatus)}
                aria-describedby={errors.newStatus ? "manual-status-error" : undefined}
              >
                <SelectValue placeholder="Select a workflow status" />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_WORKFLOW_STATUSES.map((option) => (
                  <SelectItem
                    key={option.id}
                    value={option.id}
                    disabled={option.id === currentStatus}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.newStatus ? (
              <p id="manual-status-error" role="alert" className="text-sm text-destructive">
                {errors.newStatus}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-status-reason">
              Reason for override <span className="text-destructive">Required</span>
            </Label>
            <Textarea
              id="manual-status-reason"
              value={formData.reason}
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.reason)}
              aria-describedby={errors.reason ? "manual-status-reason-error" : "manual-status-reason-help"}
              onChange={(event) => {
                setFormData((previous) => ({ ...previous, reason: event.target.value }));
                setErrors((previous) => ({ ...previous, reason: undefined }));
                setSubmitError(null);
              }}
              placeholder="Describe the operational reason for changing this status"
              rows={4}
            />
            <p id="manual-status-reason-help" className="text-xs leading-4 text-muted-foreground">
              Be specific enough that another operator can understand the exception later.
            </p>
            {errors.reason ? (
              <p id="manual-status-reason-error" role="alert" className="text-sm text-destructive">
                {errors.reason}
              </p>
            ) : null}
          </div>

          <div className="rounded-md border border-[var(--color-accent-border)] bg-accent p-3 text-sm leading-5 text-accent-foreground">
            This bypasses the normal progression and may affect downstream shipment or finance work.
          </div>

          {submitError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive bg-[var(--color-destructive-soft)] p-3 text-sm text-destructive"
            >
              {submitError}
            </div>
          ) : null}

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              ) : null}
              {isSubmitting ? "Updating status..." : "Update status"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
