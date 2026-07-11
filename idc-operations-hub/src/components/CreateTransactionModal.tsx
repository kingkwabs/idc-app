import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, Loader2, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar as CalendarComponent } from "./ui/calendar";
import { createTransaction, fetchClients, type TransactionCreate } from "../lib/api";

interface CreateTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { createdId: number }) => void | Promise<void>;
}

interface TransactionFormData {
  client_id: number | null;
  item_description: string;
  date_received: Date | undefined;
}

interface FormErrors {
  client_id?: string;
  item_description?: string;
  date_received?: string;
}

const EMPTY_FORM: TransactionFormData = {
  client_id: null,
  item_description: "",
  date_received: undefined,
};

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function CreateTransactionModal({ isOpen, onClose, onSubmit }: CreateTransactionModalProps) {
  const [formData, setFormData] = useState<TransactionFormData>(EMPTY_FORM);
  const [clients, setClients] = useState<Array<{ id: number; name: string }>>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [clientRequestKey, setClientRequestKey] = useState(0);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || clients.length > 0) return;

    let cancelled = false;
    setClientsLoading(true);
    setClientsError(null);

    void fetchClients()
      .then((response) => {
        if (!cancelled) setClients(response.items);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setClientsError(error instanceof Error ? error.message : "Could not load clients.");
        }
      })
      .finally(() => {
        if (!cancelled) setClientsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientRequestKey, clients.length, isOpen]);

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setSubmitError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: FormErrors = {};
    if (!formData.client_id) nextErrors.client_id = "Select the client for this transaction.";
    if (!formData.item_description.trim()) {
      nextErrors.item_description = "Enter a concise transaction description.";
    }
    if (!formData.date_received) nextErrors.date_received = "Select the date the RFQ was received.";

    setFormErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0 || !formData.client_id || !formData.date_received) return;

    setIsSubmitting(true);
    try {
      const payload: TransactionCreate = {
        client_id: formData.client_id,
        date_received: formatLocalDate(formData.date_received),
        item_description: formData.item_description.trim(),
      };
      const created = await createTransaction(payload);
      await onSubmit({ createdId: created.id });
      resetForm();
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "The transaction could not be created. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-xl"
        onEscapeKeyDown={(event) => {
          if (isSubmitting) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isSubmitting) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Create transaction</DialogTitle>
          <DialogDescription>
            Start an operational record from the client RFQ. References, documents, suppliers, shipment, and financials can be added next.
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={handleSubmit} className="space-y-5">
          {submitError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive bg-[var(--color-destructive-soft)] p-3 text-sm leading-5 text-destructive"
            >
              <p className="font-medium">Transaction not created</p>
              <p className="mt-1">{submitError}</p>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="transaction-client">
              Client <span className="text-destructive">Required</span>
            </Label>
            <Select
              value={formData.client_id ? String(formData.client_id) : ""}
              disabled={clientsLoading || Boolean(clientsError) || clients.length === 0 || isSubmitting}
              onValueChange={(value) => {
                setFormData((previous) => ({ ...previous, client_id: Number(value) }));
                setFormErrors((previous) => ({ ...previous, client_id: undefined }));
                setSubmitError(null);
              }}
            >
              <SelectTrigger
                id="transaction-client"
                aria-invalid={Boolean(formErrors.client_id)}
                aria-describedby={formErrors.client_id ? "transaction-client-error" : "transaction-client-state"}
              >
                <SelectValue placeholder={clientsLoading ? "Loading clients..." : "Select a client"} />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={String(client.id)}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div id="transaction-client-state" aria-live="polite">
              {clientsLoading ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
                  Loading the client directory...
                </p>
              ) : null}
              {clientsError ? (
                <div className="flex flex-col gap-2 rounded-md border border-destructive bg-[var(--color-destructive-soft)] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-destructive">{clientsError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setClientRequestKey((key) => key + 1)}
                  >
                    <RefreshCw aria-hidden="true" />
                    Retry
                  </Button>
                </div>
              ) : null}
              {!clientsLoading && !clientsError && clients.length === 0 ? (
                <p className="rounded-md border border-border bg-secondary p-3 text-sm text-muted-foreground">
                  No clients are available yet. Create a client before starting a transaction.
                </p>
              ) : null}
            </div>
            {formErrors.client_id ? (
              <p id="transaction-client-error" role="alert" className="text-sm text-destructive">
                {formErrors.client_id}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="transaction-description">
              Description <span className="text-destructive">Required</span>
            </Label>
            <Input
              id="transaction-description"
              type="text"
              autoComplete="off"
              disabled={isSubmitting}
              value={formData.item_description}
              aria-invalid={Boolean(formErrors.item_description)}
              aria-describedby={formErrors.item_description ? "transaction-description-error" : "transaction-description-help"}
              placeholder="e.g. Turbine repair kit, Q4"
              onChange={(event) => {
                setFormData((previous) => ({ ...previous, item_description: event.target.value }));
                setFormErrors((previous) => ({ ...previous, item_description: undefined }));
                setSubmitError(null);
              }}
            />
            <p id="transaction-description-help" className="text-xs text-muted-foreground">
              Use a short description operators can recognize in the transaction list.
            </p>
            {formErrors.item_description ? (
              <p id="transaction-description-error" role="alert" className="text-sm text-destructive">
                {formErrors.item_description}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="transaction-date-received">
              RFQ received date <span className="text-destructive">Required</span>
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="transaction-date-received"
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  aria-invalid={Boolean(formErrors.date_received)}
                  aria-describedby={formErrors.date_received ? "transaction-date-error" : undefined}
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarDays aria-hidden="true" />
                  {formData.date_received ? (
                    formData.date_received.toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  ) : (
                    <span className="text-muted-foreground">Select a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <CalendarComponent
                  mode="single"
                  selected={formData.date_received}
                  onSelect={(date) => {
                    setFormData((previous) => ({ ...previous, date_received: date }));
                    setFormErrors((previous) => ({ ...previous, date_received: undefined }));
                    setSubmitError(null);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {formErrors.date_received ? (
              <p id="transaction-date-error" role="alert" className="text-sm text-destructive">
                {formErrors.date_received}
              </p>
            ) : null}
          </div>

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || clientsLoading || Boolean(clientsError) || clients.length === 0}>
              {isSubmitting ? (
                <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              ) : null}
              {isSubmitting ? "Creating transaction..." : "Create transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
