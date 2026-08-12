import { useEffect, useState } from "react";
import { ArrowRight, Building2 } from "lucide-react";
import { Link } from "react-router-dom";

import { fetchClientMetrics, type ClientMetricOut } from "../lib/api";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

const MAX_VISIBLE_CLIENTS = 8;

function transactionLabel(count: number): string {
  return `${count} active ${count === 1 ? "transaction" : "transactions"}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Client activity is unavailable";
}

export function ActiveClientsOverview({ refreshKey = 0 }: { refreshKey?: number }) {
  const [clients, setClients] = useState<ClientMetricOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

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
  }, [refreshKey]);

  const activeClients = clients
    .filter((client) => client.active_transactions > 0)
    .sort((left, right) =>
      right.active_transactions - left.active_transactions || left.name.localeCompare(right.name),
    );
  const visibleClients = activeClients.slice(0, MAX_VISIBLE_CLIENTS);
  const maxActiveCount = visibleClients[0]?.active_transactions ?? 0;

  return (
    <section
      aria-labelledby="active-client-title"
      aria-busy={loading}
      className="mb-6 overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]"
    >
      <header className="flex flex-col gap-3 border-b bg-secondary px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="active-client-title" className="text-base font-semibold tracking-tight text-foreground">
            Active transactions by client
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Current workload ranked by client.</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="self-start sm:self-auto">
          <Link to="/clients">
            Client register
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </header>

      {error ? (
        <div role="alert" className="px-5 py-4 text-sm text-destructive">
          {error}. Transaction totals above remain available.
        </div>
      ) : loading ? (
        <div className="grid gap-x-8 gap-y-5 p-5 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-2">
              <div className="flex justify-between gap-4">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
      ) : visibleClients.length === 0 ? (
        <div className="flex items-start gap-3 px-5 py-6 text-sm text-muted-foreground">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary">
            <Building2 aria-hidden="true" className="size-4" />
          </span>
          <div>
            <p className="font-medium text-foreground">No active client work</p>
            <p className="mt-1">New client transactions will appear here automatically.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-x-8 gap-y-5 p-5 lg:grid-cols-2">
          {visibleClients.map((client) => {
            const percentage = maxActiveCount > 0
              ? Math.max(8, Math.round((client.active_transactions / maxActiveCount) * 100))
              : 0;
            return (
              <div key={client.id}>
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="min-w-0 truncate font-medium text-foreground">{client.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {transactionLabel(client.active_transactions)}
                  </span>
                </div>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                  role="meter"
                  aria-label={`${client.name}: ${transactionLabel(client.active_transactions)}`}
                  aria-valuemin={0}
                  aria-valuemax={maxActiveCount}
                  aria-valuenow={client.active_transactions}
                >
                  <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
          {activeClients.length > MAX_VISIBLE_CLIENTS ? (
            <p className="text-xs text-muted-foreground lg:col-span-2">
              Showing {MAX_VISIBLE_CLIENTS} of {activeClients.length} clients with active transactions.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
