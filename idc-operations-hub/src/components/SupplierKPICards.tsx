import { Activity, CircleDollarSign, Truck } from "lucide-react";
import { useMemo } from "react";

import type { SupplierSummary } from "../lib/api";
import { Skeleton } from "./ui/skeleton";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

interface SupplierKPICardsProps {
  summary: SupplierSummary | null;
  loading: boolean;
}

export function SupplierKPICards({ summary, loading }: SupplierKPICardsProps) {
  const metrics = useMemo(
    () => [
      { label: "Supplier records", value: String(summary?.total_suppliers ?? 0), icon: Truck, context: "Registered vendors" },
      { label: "Supplier PO value", value: currencyFormatter.format(summary?.total_spend ?? 0), icon: CircleDollarSign, context: "Across all supplier orders" },
      { label: "Engaged suppliers", value: String(summary?.engaged_suppliers ?? 0), icon: Activity, context: "Linked to active work" },
    ],
    [summary],
  );

  return (
    <section aria-label="Supplier summary" aria-busy={loading} className="overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]">
      <p className="sr-only" aria-live="polite">{loading ? "Loading supplier summary" : "Supplier summary loaded"}</p>
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
