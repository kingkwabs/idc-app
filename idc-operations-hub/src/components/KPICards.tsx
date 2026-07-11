import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, CircleDollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { fetchTransactionSummary } from "../lib/api";
import { Skeleton } from "./ui/skeleton";

interface KPICardsProps {
  mode: "recent" | "all";
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Transaction summary is unavailable";
}

export function KPICards({ mode }: KPICardsProps) {
  const navigate = useNavigate();
  const [activeCount, setActiveCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const summary = await fetchTransactionSummary();
        if (cancelled) return;
        setActiveCount(summary.active_count);
        setTotalRevenue(summary.total_revenue);
      } catch (loadError: unknown) {
        if (!cancelled) setError(errorMessage(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  const metrics = useMemo(
    () => [
      {
        label: "Active transactions",
        value: String(activeCount),
        context: "Open the transaction register",
        icon: Activity,
      },
      {
        label: "Recorded client value",
        value: currencyFormatter.format(totalRevenue),
        context: "Quoted or ordered across transactions",
        icon: CircleDollarSign,
      },
    ],
    [activeCount, totalRevenue],
  );

  return (
    <section
      aria-label="Transaction summary"
      aria-busy={loading}
      className="mb-6 overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]"
    >
      <p className="sr-only" aria-live="polite">
        {loading ? "Loading transaction summary" : error ?? "Transaction summary loaded"}
      </p>

      {error ? (
        <div role="alert" className="border-b bg-[var(--color-warning-soft)] px-5 py-3 text-sm text-[var(--color-warning-foreground)]">
          {error}. The transaction register is still available.
        </div>
      ) : null}

      <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <button
              key={metric.label}
              type="button"
              onClick={() => navigate("/?view=transactions-all")}
              className="group min-w-0 p-5 text-left outline-none transition-[background-color,box-shadow,transform] duration-150 [transition-timing-function:var(--ease-out-ui)] hover:bg-secondary active:scale-[0.99] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring-soft)] motion-reduce:transition-none motion-reduce:active:scale-100 sm:p-6"
              aria-label={`View all transactions. ${metric.label}: ${loading || error ? "not available" : metric.value}`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex size-8 items-center justify-center rounded-md border border-[var(--color-accent-border)] bg-accent text-accent-foreground">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground" />
              </span>
              <span className="mt-5 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {metric.label}
              </span>
              {loading ? (
                <Skeleton className="mt-2 h-7 w-28" />
              ) : (
                <span className="mt-1 block break-words text-xl font-semibold tracking-tight text-foreground" data-numeric="true">
                  {error ? "Not available" : metric.value}
                </span>
              )}
              <span className="mt-2 block text-sm text-muted-foreground">{metric.context}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
