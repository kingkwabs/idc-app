import { useState } from "react";
import { Factory } from "lucide-react";

import type { SupplierCreate } from "../lib/api";
import { SupplierForm } from "./SupplierForm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

interface CreateSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: SupplierCreate) => Promise<void>;
}

export function CreateSupplierModal({ isOpen, onClose, onSubmit }: CreateSupplierModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const handleSubmit = async (data: SupplierCreate) => {
    await onSubmit(data);
  };
  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="max-w-xl"
        onEscapeKeyDown={(event) => { if (isSubmitting) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (isSubmitting) event.preventDefault(); }}
      >
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Factory aria-hidden="true" className="size-5" />
          </div>
          <DialogTitle>Add supplier</DialogTitle>
          <DialogDescription>Register a vendor for RFQs, quotes, and transaction sourcing.</DialogDescription>
        </DialogHeader>

        {isOpen ? (
          <SupplierForm
            mode="create"
            onCancel={handleClose}
            onSubmittingChange={setIsSubmitting}
            onSuccess={onClose}
            onSubmit={handleSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
