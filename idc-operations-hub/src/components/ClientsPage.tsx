import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "./ui/button";
import { ClientKPICards } from "./ClientKPICards";
import { ClientsTable } from "./ClientsTable";
import { CreateClientModal } from "./CreateClientModal";

interface ClientFormData {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

export function ClientsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCreateClient = (data: ClientFormData) => {
    console.log("Creating client:", data);
    // Here you would typically send the data to your backend
    // For now, we'll just log it and close the modal
  };

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Clients</h1>
        <Button 
          onClick={() => setIsModalOpen(true)}
          className="bg-teal-600/90 hover:bg-teal-700 text-white backdrop-blur-sm border border-teal-500/30 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add New Client
        </Button>
      </div>

      {/* KPI Cards Section */}
      <ClientKPICards />

      {/* Clients Table Section */}
      <ClientsTable />

      {/* Create Client Modal */}
      <CreateClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateClient}
      />
    </div>
  );
}