import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "./ui/button";
import { SupplierKPICards } from "./SupplierKPICards";
import { SuppliersTable } from "./SuppliersTable";
import { CreateSupplierModal } from "./CreateSupplierModal";

interface SupplierFormData {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  category: string;
  notes: string;
}

export function SuppliersPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCreateSupplier = (data: SupplierFormData) => {
    console.log("Creating supplier:", data);
    // Here you would typically send the data to your backend
    // For now, we'll just log it and close the modal
  };

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Suppliers</h1>
        <Button 
          onClick={() => setIsModalOpen(true)}
          className="text-white transition-all duration-200 border shadow-lg bg-teal-600/90 hover:bg-teal-700 backdrop-blur-sm border-teal-500/30 hover:shadow-xl hover:scale-105"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add New Supplier
        </Button>
      </div>

      {/* KPI Cards Section */}
      <SupplierKPICards />

      {/* Suppliers Table Section */}
      <SuppliersTable />

      {/* Create Supplier Modal */}
      <CreateSupplierModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateSupplier}
      />
    </div>
  );
}