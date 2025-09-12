import { useState } from "react";
import { Building2, Mail, Phone, MapPin, Tag, Globe } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { toast } from "sonner";

interface CreateSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: SupplierFormData) => void;
}

interface SupplierFormData {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  category: string;
  rfq: string;
  notes: string;
}

const supplierCategories = [
  "OEM Parts Specialist",
  "Raw Materials Provider",
  "Custom Manufacturing",
  "Control Systems Supplier",
  "Transportation Services",
  "Specialty Alloys",
  "Electrical Components",
  "Safety Equipment",
  "Maintenance Services",
  "Other"
];

export function CreateSupplierModal({ isOpen, onClose, onSubmit }: CreateSupplierModalProps) {
  const [formData, setFormData] = useState<SupplierFormData>({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    category: "",
    rfq: "",
    notes: ""
  });

  const [errors, setErrors] = useState<Partial<SupplierFormData>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simple validation
    const newErrors: Partial<SupplierFormData> = {};
    if (!formData.companyName.trim()) newErrors.companyName = "Company name is required";
    if (!formData.contactName.trim()) newErrors.contactName = "Contact name is required";
    if (!formData.email.trim()) newErrors.email = "Email is required";
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }
    if (!formData.category) newErrors.category = "Please select a category";

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      onSubmit(formData);
      toast.success("Supplier created successfully!");
      setFormData({
        companyName: "",
        contactName: "",
        email: "",
        phone: "",
        website: "",
        address: "",
        category: "",
        rfq: "",
        notes: ""
      });
      onClose();
    }
  };

  const handleInputChange = (field: keyof SupplierFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass-card max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-gray-900">
            Add New Supplier
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-gray-600">
            Register a new supplier with contact information and business category.
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
              placeholder="Enter supplier company name"
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

          {/* Website */}
          <div className="space-y-2">
            <Label htmlFor="website" className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-gray-500" />
              Website
            </Label>
            <Input
              id="website"
              value={formData.website}
              onChange={(e) => handleInputChange("website", e.target.value)}
              placeholder="Enter website URL"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category" className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-gray-500" />
              Category *
            </Label>
            <Select onValueChange={(value) => handleInputChange("category", value)}>
              <SelectTrigger className={errors.category ? "border-red-500" : ""}>
                <SelectValue placeholder="Select supplier category" />
              </SelectTrigger>
              <SelectContent className="glass-card">
                {supplierCategories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && (
              <p className="text-sm text-red-600">{errors.category}</p>
            )}
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

          {/* RFQ */}
          <div className="space-y-2">
            <Label htmlFor="rfq" className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-gray-500" />
              RFQ Details
            </Label>
            <Textarea
              id="rfq"
              value={formData.rfq}
              onChange={(e) => handleInputChange("rfq", e.target.value)}
              placeholder="Details about the RFQ"
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
              placeholder="Additional notes about the supplier"
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
              Create Supplier
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}