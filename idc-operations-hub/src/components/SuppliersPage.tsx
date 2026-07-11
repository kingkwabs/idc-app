import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createSupplier,
  fetchSupplierMetrics,
  fetchSupplierSummary,
  type SupplierCreate,
  type SupplierMetricOut,
  type SupplierSummary,
} from "../lib/api";
import { CreateSupplierModal } from "./CreateSupplierModal";
import { SupplierKPICards } from "./SupplierKPICards";
import { SuppliersTable } from "./SuppliersTable";
import { Button } from "./ui/button";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load suppliers";
}

export function SuppliersPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [summary, setSummary] = useState<SupplierSummary | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierMetricOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([fetchSupplierSummary(), fetchSupplierMetrics()])
      .then(([summaryResponse, metricsResponse]) => {
        if (cancelled) return;
        setSummary(summaryResponse);
        setSuppliers(metricsResponse.items);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(errorMessage(loadError));
        setSummary(null);
        setSuppliers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreateSupplier = async (payload: SupplierCreate) => {
    const created = await createSupplier(payload);
    setSuppliers((current) =>
      [
        ...current,
        { id: created.id, name: created.name, quotes: 0, last_quoted: null },
      ].sort((left, right) => left.name.localeCompare(right.name)),
    );
    setSummary((current) => current ? { ...current, total_suppliers: current.total_suppliers + 1 } : current);
    toast.success(`${created.name} was added`);
  };

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Procurement network</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Suppliers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Maintain vendor records and compare sourcing activity.</p>
        </div>
        <Button type="button" onClick={() => setIsModalOpen(true)}>
          <Plus aria-hidden="true" />
          Add supplier
        </Button>
      </header>

      <SupplierKPICards summary={summary} loading={loading} />
      <SuppliersTable suppliers={suppliers} loading={loading} error={error} />

      <CreateSupplierModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateSupplier}
      />
    </div>
  );
}
