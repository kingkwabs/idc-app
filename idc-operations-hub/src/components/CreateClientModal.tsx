import { useState } from "react";
import { Building2, Mail, Phone, MapPin } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { toast } from "sonner";

interface CreateClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ClientFormData) => void;
}

interface ClientFormData {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

export function CreateClientModal({ isOpen, onClose, onSubmit }: CreateClientModalProps) {
  const [formData, setFormData] = useState<ClientFormData>({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    notes: ""
  });

  const [errors, setErrors] = useState<Partial<ClientFormData>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simple validation
    const newErrors: Partial<ClientFormData> = {};
    if (!formData.companyName.trim()) newErrors.companyName = "Company name is required";
    if (!formData.contactName.trim()) newErrors.contactName = "Contact name is required";
    if (!formData.email.trim()) newErrors.email = "Email is required";
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      onSubmit(formData);
      toast.success("Client created successfully!");
      setFormData({
        companyName: "",
        contactName: "",
        email: "",
        phone: "",
        address: "",
        notes: ""
      });
      onClose();
    }
  };

  const handleInputChange = (field: keyof ClientFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md glass-card">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-gray-900">
            Add New Client
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-gray-600">
            Create a new client record with contact information and details.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Company Name */}
          <div className="space-y-2">
            <Label htmlFor="companyName" className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-500" />
              Company Name *
            </Label>
            <Input
              id="companyName"
              value={formData.companyName}
              onChange={(e) => handleInputChange("companyName", e.target.value)}
              placeholder="Enter company name"
              className={errors.companyName ? "border-red-500" : ""}
            />
            {errors.companyName && (
              <p className="text-sm text-red-600">{errors.companyName}</p>
            )}
          </div>

          {/* Contact Name */}
          <div className="space-y-2">
            <Label htmlFor="contactName">Primary Contact Name *</Label>
            <Input
              id="contactName"
              value={formData.contactName}
              onChange={(e) => handleInputChange("contactName", e.target.value)}
              placeholder="Enter primary contact name"
              className={errors.contactName ? "border-red-500" : ""}
            />
            {errors.contactName && (
              <p className="text-sm text-red-600">{errors.contactName}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-gray-500" />
              Email Address *
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              placeholder="Enter email address"
              className={errors.email ? "border-red-500" : ""}
            />
            {errors.email && (
              <p className="text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-gray-500" />
              Phone Number
            </Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              placeholder="Enter phone number"
            />
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="address" className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-500" />
              Address
            </Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => handleInputChange("address", e.target.value)}
              placeholder="Enter company address"
              rows={2}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              placeholder="Additional notes about the client"
              rows={2}
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 text-white bg-teal-600 hover:bg-teal-700"
            >
              Create Client
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}