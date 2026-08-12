import { useState, type FormEvent } from "react";
import { Factory, LoaderCircle } from "lucide-react";

import { ApiError, type SupplierCreate } from "../lib/api";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";

interface CreateSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: SupplierCreate) => Promise<void>;
}

const supplierCategories = [
  "OEM parts",
  "Raw materials",
  "Custom manufacturing",
  "Control systems",
  "Transportation",
  "Electrical components",
  "Safety equipment",
  "Maintenance services",
  "Other",
];

const emptySupplier: SupplierCreate = {
  name: "",
  contact_name: "",
  email: "",
  phone: "",
  website: "",
  address: "",
  category: "",
  notes: "",
};

function optional(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function CreateSupplierModal({ isOpen, onClose, onSubmit }: CreateSupplierModalProps) {
  const [formData, setFormData] = useState<SupplierCreate>(emptySupplier);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof SupplierCreate, string>>>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field: keyof SupplierCreate, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setSubmissionError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors: Partial<Record<keyof SupplierCreate, string>> = {};
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
        website: optional(formData.website),
        address: optional(formData.address),
        category: optional(formData.category),
        notes: optional(formData.notes),
      });
      setFormData(emptySupplier);
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.payload.error === "supplier_exists") {
        setFieldErrors((current) => ({
          ...current,
          name: "A supplier with this name already exists. Link the existing supplier instead.",
        }));
      } else {
        setSubmissionError(
          error instanceof ApiError ? error.message : "The supplier could not be created. Please try again.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Factory aria-hidden="true" className="size-5" />
          </div>
          <DialogTitle>Add supplier</DialogTitle>
          <DialogDescription>Register a vendor for RFQs, quotes, and transaction sourcing.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {submissionError && (
            <Alert variant="destructive">
              <AlertDescription>{submissionError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="supplier-name">Company name</Label>
            <Input
              id="supplier-name"
              autoFocus
              required
              minLength={2}
              maxLength={160}
              value={formData.name}
              onChange={(event) => updateField("name", event.target.value)}
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={fieldErrors.name ? "supplier-name-error" : undefined}
              placeholder="Vendor organization"
            />
            {fieldErrors.name && <p id="supplier-name-error" className="text-sm text-destructive">{fieldErrors.name}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="supplier-contact">Primary contact</Label>
              <Input
                id="supplier-contact"
                autoComplete="name"
                maxLength={160}
                value={formData.contact_name || ""}
                onChange={(event) => updateField("contact_name", event.target.value)}
                placeholder="Contact name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-category">Category</Label>
              <Select value={formData.category || ""} onValueChange={(value) => updateField("category", value)}>
                <SelectTrigger id="supplier-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {supplierCategories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="supplier-email">Email</Label>
              <Input
                id="supplier-email"
                type="email"
                autoComplete="email"
                value={formData.email || ""}
                onChange={(event) => updateField("email", event.target.value)}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? "supplier-email-error" : undefined}
                placeholder="contact@supplier.com"
              />
              {fieldErrors.email && <p id="supplier-email-error" className="text-sm text-destructive">{fieldErrors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-phone">Phone</Label>
              <Input
                id="supplier-phone"
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
            <Label htmlFor="supplier-website">Website</Label>
            <Input
              id="supplier-website"
              type="url"
              inputMode="url"
              maxLength={500}
              value={formData.website || ""}
              onChange={(event) => updateField("website", event.target.value)}
              placeholder="https://supplier.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-address">Address</Label>
            <Textarea
              id="supplier-address"
              maxLength={1000}
              rows={2}
              value={formData.address || ""}
              onChange={(event) => updateField("address", event.target.value)}
              placeholder="Office or shipping address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-notes">Internal notes</Label>
            <Textarea
              id="supplier-notes"
              maxLength={5000}
              rows={3}
              value={formData.notes || ""}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Capabilities, terms, or useful context"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <LoaderCircle aria-hidden="true" className="animate-spin" />}
              {isSubmitting ? "Creating..." : "Create supplier"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
