import { useState, type FormEvent } from "react";
import { Info, LoaderCircle, Truck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface ShipmentData {
  leadTime: string;
  trackingNumber: string;
  shippedDate: string;
  etaDate: string;
}

interface ShipmentTabProps {
  onShipmentConfirmed: (data: Partial<ShipmentData>) => void | Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Shipment could not be confirmed. Try again.";
}

export function ShipmentTab({ onShipmentConfirmed }: ShipmentTabProps) {
  const [shipmentData, setShipmentData] = useState<ShipmentData>({
    leadTime: "",
    trackingNumber: "",
    shippedDate: "",
    etaDate: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (field: keyof ShipmentData, value: string) => {
    setShipmentData((current) => ({ ...current, [field]: value }));
    if (error) setError(null);
  };

  const handleConfirmShipment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (shipmentData.leadTime) {
      const leadTime = Number(shipmentData.leadTime);
      if (!Number.isInteger(leadTime) || leadTime < 0) {
        setError("Lead time must be a whole number of days or left blank.");
        return;
      }
    }

    if (shipmentData.shippedDate && shipmentData.etaDate && shipmentData.etaDate < shipmentData.shippedDate) {
      setError("ETA date cannot be earlier than the shipped date.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onShipmentConfirmed({ ...shipmentData });
      toast.success("Shipment confirmed", {
        description: "The transaction moved to shipment, clearance, and delivery.",
      });
    } catch (submitError: unknown) {
      const message = errorMessage(submitError);
      setError(message);
      toast.error("Shipment was not confirmed", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleConfirmShipment} className="space-y-6" aria-busy={submitting}>
      <header className="border-b pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Logistics</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Confirm shipment</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Record the available carrier details before advancing this transaction.</p>
      </header>

      <section aria-labelledby="shipment-fields-title" className="overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]">
        <div className="border-b bg-secondary px-5 py-4">
          <h3 id="shipment-fields-title" className="text-base font-semibold text-foreground">Carrier details</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Fields can be left blank when the carrier has not provided them.</p>
        </div>

        <fieldset disabled={submitting} className="grid grid-cols-1 gap-5 p-5 sm:p-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="leadTime">Lead time</Label>
            <Input
              id="leadTime"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="Days"
              value={shipmentData.leadTime}
              onChange={(event) => handleInputChange("leadTime", event.target.value)}
              aria-describedby="lead-time-help"
            />
            <p id="lead-time-help" className="text-xs text-muted-foreground">Whole calendar days.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="trackingNumber">Tracking number</Label>
            <Input
              id="trackingNumber"
              type="text"
              autoComplete="off"
              placeholder="Carrier reference"
              value={shipmentData.trackingNumber}
              onChange={(event) => handleInputChange("trackingNumber", event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="shippedDate">Shipped date</Label>
            <Input
              id="shippedDate"
              type="date"
              value={shipmentData.shippedDate}
              onChange={(event) => handleInputChange("shippedDate", event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="etaDate">Estimated arrival</Label>
            <Input
              id="etaDate"
              type="date"
              min={shipmentData.shippedDate || undefined}
              value={shipmentData.etaDate}
              onChange={(event) => handleInputChange("etaDate", event.target.value)}
            />
          </div>
        </fieldset>

        <div className="flex items-start gap-3 border-t bg-[var(--color-warning-soft)] px-5 py-4 text-[var(--color-warning-foreground)]">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p className="max-w-3xl text-sm">Confirming saves these details and moves the transaction to shipment, clearance, and delivery. This does not mark the shipment as delivered.</p>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        {error ? (
          <p role="alert" className="flex-1 text-sm font-medium text-destructive">{error}</p>
        ) : (
          <p className="flex-1 text-sm text-muted-foreground">Review the dates and tracking reference before confirming.</p>
        )}
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Truck aria-hidden="true" />}
          {submitting ? "Confirming shipment" : "Confirm shipment"}
        </Button>
      </div>
    </form>
  );
}
