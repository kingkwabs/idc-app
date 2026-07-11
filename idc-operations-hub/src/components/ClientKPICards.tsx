import { Activity, CircleDollarSign, Users } from "lucide-react";
import { useMemo } from "react";

import type { ClientMetricOut } from "../lib/api";
import { Skeleton } from "./ui/skeleton";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

interface ClientKPICardsProps {
  clients: ClientMetricOut[];
  loading: boolean;
}

export function ClientKPICards({ clients, loading }: ClientKPICardsProps) {
  const totals = useMemo(() => {
    let totalRevenue = 0;
    let activeTransactions = 0;

    for (const client of clients) {
      totalRevenue += client.total_revenue;
      activeTransactions += client.active_transactions;
    }

    return { totalClients: clients.length, totalRevenue, activeTransactions };
  }, [clients]);

  const metrics = useMemo(
    () => [
      { label: "Client records", value: String(totals.totalClients), icon: Users, context: "Registered accounts" },
      { label: "Recorded client value", value: currencyFormatter.format(totals.totalRevenue), icon: CircleDollarSign, context: "Quoted or ordered across transactions" },
      { label: "Active transactions", value: String(totals.activeTransactions), icon: Activity, context: "Currently in progress" },
    ],
    [totals],
  );

  return (
    <section aria-label="Client summary" aria-busy={loading} className="overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]">
      <p className="sr-only" aria-live="polite">{loading ? "Loading client summary" : "Client summary loaded"}</p>
      <dl className="grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="min-w-0 p-5 sm:p-6">
              <div className="flex items-center gap-2.5 text-muted-foreground">
                <span className="flex size-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <dt className="text-xs font-semibold uppercase tracking-[0.12em]">{metric.label}</dt>
              </div>
              {loading ? (
                <Skeleton className="mt-4 h-7 w-24" />
              ) : (
                <dd className="mt-3 break-words text-xl font-semibold tracking-tight text-foreground" data-numeric="true">
                  {metric.value}
                </dd>
              )}
              <p className="mt-1.5 text-sm text-muted-foreground">{metric.context}</p>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
