import { useEffect, useState } from "react";
import { AlertCircle, Clock3 } from "lucide-react";

import { listActivity } from "../lib/api";
import { Skeleton } from "./ui/skeleton";

interface ActivityLogProps {
  transactionId: number;
}

interface ActivityItem {
  id: number;
  action: string;
  details?: string;
  created_at: string;
}

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Activity history is unavailable";
}

function formatAction(action: string): string {
  const label = action.replace(/[-_]+/g, " ").trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "Transaction updated";
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return timestampFormatter.format(date);
}

export function ActivityLog({ transactionId }: ActivityLogProps) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await listActivity(transactionId);
        if (!cancelled) setItems(response.items);
      } catch (loadError: unknown) {
        if (!cancelled) setError(errorMessage(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  return (
    <section aria-labelledby="activity-log-title" aria-busy={loading} className="overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]">
      <header className="flex items-center justify-between gap-4 border-b bg-secondary px-5 py-4">
        <div>
          <h3 id="activity-log-title" className="text-base font-semibold tracking-tight text-foreground">Activity log</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Recorded changes to this transaction.</p>
        </div>
        <span className="text-sm font-medium text-muted-foreground" aria-live="polite">
          {loading ? "Loading" : error ? "Unavailable" : `${items.length} ${items.length === 1 ? "event" : "events"}`}
        </span>
      </header>

      {loading ? (
        <div className="space-y-1 p-3 sm:p-4">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-start gap-3 px-2 py-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="flex items-start gap-3 px-5 py-8 text-destructive">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Activity could not be loaded</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center px-5 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <Clock3 aria-hidden="true" className="size-5" />
          </span>
          <p className="mt-3 font-medium text-foreground">No activity recorded yet</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Status changes, uploads, and financial updates will appear here.</p>
        </div>
      ) : (
        <ol className="divide-y">
          {items.map((activity) => (
            <li key={activity.id} className="flex items-start gap-3 px-5 py-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-secondary text-muted-foreground">
                <Clock3 aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm text-foreground">
                  <span className="font-medium">{formatAction(activity.action)}</span>
                  {activity.details ? <span className="text-muted-foreground">: {activity.details}</span> : null}
                </p>
                <time dateTime={activity.created_at} className="mt-1 block text-xs text-muted-foreground">
                  {formatTimestamp(activity.created_at)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
