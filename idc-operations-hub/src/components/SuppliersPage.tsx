import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "./ui/button";
import { SupplierKPICards } from "./SupplierKPICards";
import { SuppliersTable } from "./SuppliersTable";
import { CreateSupplierModal } from "./CreateSupplierModal";
import { fetchSupplierMetrics, fetchSupplierSummary, type SupplierMetricOut, type SupplierSummary } from "../lib/api";

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
  const [summary, setSummary] = useState<SupplierSummary | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierMetricOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [summaryRes, metricsRes] = await Promise.all([
          fetchSupplierSummary(),
          fetchSupplierMetrics(),
        ]);
        if (cancelled) return;
        setSummary(summaryRes);
        setSuppliers(metricsRes.items);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Failed to load suppliers");
        setSummary(null);
        setSuppliers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
      <SupplierKPICards summary={summary} loading={loading} />

      {/* Suppliers Table Section */}
      <SuppliersTable suppliers={suppliers} loading={loading} error={error} />

      {/* Create Supplier Modal */}
      <CreateSupplierModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateSupplier}
      />
    </div>
  );
}
