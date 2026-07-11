import { useState, type FormEvent } from "react";
import { Building2, LoaderCircle } from "lucide-react";

import { ApiError, type ClientCreate } from "../lib/api";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

interface CreateClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ClientCreate) => Promise<void>;
}

const emptyClient: ClientCreate = {
  name: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};

function optional(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function CreateClientModal({ isOpen, onClose, onSubmit }: CreateClientModalProps) {
  const [formData, setFormData] = useState<ClientCreate>(emptyClient);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ClientCreate, string>>>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field: keyof ClientCreate, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setSubmissionError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors: Partial<Record<keyof ClientCreate, string>> = {};
    const name = formData.name.trim().replace(/\s+/g, " ");
    const email = formData.email?.trim() || "";

    if (name.length < 2) errors.name = "Enter a company name with at least 2 characters.";
    if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.email = "Enter a valid email address.";

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      await onSubmit({
        name,
        contact_name: optional(formData.contact_name),
        email: optional(formData.email),
        phone: optional(formData.phone),
        address: optional(formData.address),
        notes: optional(formData.notes),
      });
      setFormData(emptyClient);
      onClose();
    } catch (error) {
      setSubmissionError(
        error instanceof ApiError ? error.message : "The client could not be created. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Building2 aria-hidden="true" className="size-5" />
          </div>
          <DialogTitle>Add client</DialogTitle>
          <DialogDescription>Create a customer record now; transaction history will attach to it automatically.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {submissionError && (
            <Alert variant="destructive">
              <AlertDescription>{submissionError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="client-name">Company name</Label>
            <Input
              id="client-name"
              autoFocus
              required
              minLength={2}
              maxLength={160}
              value={formData.name}
              onChange={(event) => updateField("name", event.target.value)}
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={fieldErrors.name ? "client-name-error" : undefined}
              placeholder="Customer organization"
            />
            {fieldErrors.name && <p id="client-name-error" className="text-sm text-destructive">{fieldErrors.name}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="client-contact">Primary contact</Label>
              <Input
                id="client-contact"
                autoComplete="name"
                maxLength={160}
                value={formData.contact_name || ""}
                onChange={(event) => updateField("contact_name", event.target.value)}
                placeholder="Contact name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-phone">Phone</Label>
              <Input
                id="client-phone"
                type="tel"
                autoComplete="tel"
                maxLength={40}
                value={formData.phone || ""}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-email">Email</Label>
            <Input
              id="client-email"
              type="email"
              autoComplete="email"
              value={formData.email || ""}
              onChange={(event) => updateField("email", event.target.value)}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? "client-email-error" : undefined}
              placeholder="contact@company.com"
            />
            {fieldErrors.email && <p id="client-email-error" className="text-sm text-destructive">{fieldErrors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-address">Address</Label>
            <Textarea
              id="client-address"
              maxLength={1000}
              rows={2}
              value={formData.address || ""}
              onChange={(event) => updateField("address", event.target.value)}
              placeholder="Billing or office address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-notes">Internal notes</Label>
            <Textarea
              id="client-notes"
              maxLength={5000}
              rows={3}
              value={formData.notes || ""}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Terms, preferences, or useful context"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <LoaderCircle aria-hidden="true" className="animate-spin" />}
              {isSubmitting ? "Creating..." : "Create client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
