import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createClient,
  fetchClientMetrics,
  type ClientCreate,
  type ClientMetricOut,
} from "../lib/api";
import { ClientKPICards } from "./ClientKPICards";
import { ClientsTable } from "./ClientsTable";
import { CreateClientModal } from "./CreateClientModal";
import { Button } from "./ui/button";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load clients";
}

export function ClientsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clients, setClients] = useState<ClientMetricOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchClientMetrics()
      .then((response) => {
        if (!cancelled) setClients(response.items);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreateClient = async (payload: ClientCreate) => {
    const created = await createClient(payload);
    setClients((current) =>
      [
        ...current,
        {
          id: created.id,
          name: created.name,
          active_transactions: 0,
          completed_transactions: 0,
          total_revenue: 0,
        },
      ].sort((left, right) => left.name.localeCompare(right.name)),
    );
    toast.success(`${created.name} was added`);
  };

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Relationships</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage customer records and review their transaction history.</p>
        </div>
        <Button type="button" onClick={() => setIsModalOpen(true)}>
          <Plus aria-hidden="true" />
          Add client
        </Button>
      </header>

      <ClientKPICards clients={clients} loading={loading} />
      <ClientsTable clients={clients} loading={loading} error={error} />

      <CreateClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateClient}
      />
    </div>
  );
}
