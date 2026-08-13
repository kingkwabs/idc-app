import { useId, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";

import { ApiError, type SupplierCreate, type SupplierOut } from "../lib/api";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";

interface SupplierFormProps {
  mode: "create" | "edit";
  initialSupplier?: SupplierOut;
  onCancel: () => void;
  onSubmittingChange?: (isSubmitting: boolean) => void;
  onSuccess?: () => void;
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
const NO_CATEGORY_VALUE = "__no_category__";

function supplierFormData(supplier?: SupplierOut): SupplierCreate {
  return {
    name: supplier?.name || "",
    contact_name: supplier?.contact_name || "",
    email: supplier?.email || "",
    phone: supplier?.phone || "",
    website: supplier?.website || "",
    address: supplier?.address || "",
    category: supplier?.category || "",
    notes: supplier?.notes || "",
  };
}

function optional(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isValidWebsite(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function SupplierForm({
  mode,
  initialSupplier,
  onCancel,
  onSubmittingChange,
  onSuccess,
  onSubmit,
}: SupplierFormProps) {
  const formId = useId();
  const [formData, setFormData] = useState<SupplierCreate>(() => supplierFormData(initialSupplier));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof SupplierCreate, string>>>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = mode === "edit";
  const currentCategory = formData.category?.trim();
  const categoryOptions = currentCategory && !supplierCategories.includes(currentCategory)
    ? [currentCategory, ...supplierCategories]
    : supplierCategories;

  const fieldId = (name: string) => `${formId}-${name}`;

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
    const website = formData.website?.trim() || "";

    if (name.length < 2) errors.name = "Enter a company name with at least 2 characters.";
    if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.email = "Enter a valid email address.";
    if (website && !isValidWebsite(website)) {
      errors.website = "Enter a complete website address beginning with http:// or https://.";
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    onSubmittingChange?.(true);
    setSubmissionError(null);
    let succeeded = false;
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
      succeeded = true;
    } catch (error) {
      if (error instanceof ApiError && error.payload.error === "supplier_exists") {
        setFieldErrors((current) => ({
          ...current,
          name: isEditing
            ? "Another supplier already uses this name. Choose a different company name."
            : "A supplier with this name already exists. Link the existing supplier instead.",
        }));
      } else {
        setSubmissionError(
          error instanceof ApiError
            ? error.message
            : `The supplier could not be ${isEditing ? "updated" : "created"}. Please try again.`,
        );
      }
    } finally {
      setIsSubmitting(false);
      onSubmittingChange?.(false);
    }
    if (succeeded) onSuccess?.();
  };

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-5">
      {submissionError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{submissionError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={fieldId("name")}>Company name</Label>
        <Input
          id={fieldId("name")}
          autoFocus
          required
          minLength={2}
          maxLength={160}
          value={formData.name}
          onChange={(event) => updateField("name", event.target.value)}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? fieldId("name-error") : undefined}
          placeholder="Vendor organization"
        />
        {fieldErrors.name ? <p id={fieldId("name-error")} className="text-sm text-destructive">{fieldErrors.name}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={fieldId("contact")}>Primary contact</Label>
          <Input
            id={fieldId("contact")}
            autoComplete="name"
            maxLength={160}
            value={formData.contact_name || ""}
            onChange={(event) => updateField("contact_name", event.target.value)}
            placeholder="Contact name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={fieldId("category")}>Category</Label>
          <Select
            value={formData.category || ""}
            onValueChange={(value) => updateField("category", value === NO_CATEGORY_VALUE ? "" : value)}
          >
            <SelectTrigger id={fieldId("category")}><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY_VALUE}>No category</SelectItem>
              {categoryOptions.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={fieldId("email")}>Email</Label>
          <Input
            id={fieldId("email")}
            type="email"
            autoComplete="email"
            value={formData.email || ""}
            onChange={(event) => updateField("email", event.target.value)}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? fieldId("email-error") : undefined}
            placeholder="contact@supplier.com"
          />
          {fieldErrors.email ? <p id={fieldId("email-error")} className="text-sm text-destructive">{fieldErrors.email}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor={fieldId("phone")}>Phone</Label>
          <Input
            id={fieldId("phone")}
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
        <Label htmlFor={fieldId("website")}>Website</Label>
        <Input
          id={fieldId("website")}
          type="url"
          inputMode="url"
          maxLength={500}
          value={formData.website || ""}
          onChange={(event) => updateField("website", event.target.value)}
          aria-invalid={fieldErrors.website ? true : undefined}
          aria-describedby={fieldErrors.website ? fieldId("website-error") : undefined}
          placeholder="https://supplier.com"
        />
        {fieldErrors.website ? <p id={fieldId("website-error")} className="text-sm text-destructive">{fieldErrors.website}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={fieldId("address")}>Address</Label>
        <Textarea
          id={fieldId("address")}
          maxLength={1000}
          rows={2}
          value={formData.address || ""}
          onChange={(event) => updateField("address", event.target.value)}
          placeholder="Office or shipping address"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={fieldId("notes")}>Internal notes</Label>
        <Textarea
          id={fieldId("notes")}
          maxLength={5000}
          rows={3}
          value={formData.notes || ""}
          onChange={(event) => updateField("notes", event.target.value)}
          placeholder="Capabilities, terms, or useful context"
        />
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
          {isSubmitting ? (isEditing ? "Saving..." : "Creating...") : (isEditing ? "Save changes" : "Create supplier")}
        </Button>
      </div>
    </form>
  );
}
