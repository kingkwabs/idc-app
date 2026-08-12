import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  ExternalLink,
  Factory,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
} from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";

import { fetchSupplierOverview, type SupplierOverview } from "../lib/api";
import { formatCalendarDate, formatEasternDateTime } from "../lib/dateTime";
import { getWorkflowStatusBadgeClass, getWorkflowStatusLabel } from "../lib/workflowStatus";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

function formatMoney(amount: number, currency?: string | null): string {
  const normalizedCurrency = currency?.trim().toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
    }).format(amount);
  } catch {
    return `${normalizedCurrency} ${amount.toFixed(2)}`;
  }
}

function safeWebsite(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function summaryLabel(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The supplier record could not be loaded";
}

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const supplierId = Number(id);
  const [overview, setOverview] = useState<SupplierOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      setError("This supplier link is invalid.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchSupplierOverview(supplierId)
      .then((response) => {
        if (!cancelled) setOverview(response);
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
  }, [reloadKey, supplierId]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[96rem] space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-32" />
        <div className="space-y-3 border-b pb-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="mx-auto w-full max-w-[96rem] space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/suppliers"><ArrowLeft aria-hidden="true" />Suppliers</Link>
        </Button>
        <section className="rounded-lg border border-destructive bg-[var(--color-destructive-soft)] p-6" role="alert">
          <h1 className="text-lg font-semibold text-foreground">Supplier record unavailable</h1>
          <p className="mt-2 text-sm text-destructive">{error || "The supplier record was not found."}</p>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw aria-hidden="true" />Retry
          </Button>
        </section>
      </div>
    );
  }

  const { supplier, summary, items } = overview;
  const website = safeWebsite(supplier.website);

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6">
      <header className="border-b border-border pb-5">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link to="/suppliers"><ArrowLeft aria-hidden="true" />Suppliers</Link>
        </Button>
        <div className="flex items-start gap-4">
          <span className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-lg border border-[var(--color-accent-border)] bg-accent text-accent-foreground">
            <Factory aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Supplier record</p>
            <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{supplier.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {supplier.category || "Uncategorized supplier"}, sourcing activity and quotation history.
            </p>
          </div>
        </div>
      </header>

      <section aria-label="Supplier activity summary" className="grid divide-y overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[
          ["Active transactions", summary.active_transactions],
          ["Sourcing records", summary.sourcing_records],
          ["Quotations", summary.quotes],
        ].map(([label, value]) => (
          <div key={label} className="px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="supplier-profile-title" className="overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]">
        <header className="border-b bg-secondary px-5 py-4">
          <h2 id="supplier-profile-title" className="text-base font-semibold tracking-tight text-foreground">Supplier profile</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Contact details and internal sourcing context.</p>
        </header>
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Primary contact</dt>
              <dd className="mt-1 text-sm text-foreground">{supplier.contact_name || "Not recorded"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Category</dt>
              <dd className="mt-1 text-sm text-foreground">{supplier.category || "Not recorded"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Email</dt>
              <dd className="mt-1 text-sm">
                {supplier.email ? (
                  <a className="inline-flex items-center gap-2 rounded-sm text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-soft)]" href={`mailto:${supplier.email}`}>
                    <Mail aria-hidden="true" className="size-4 text-muted-foreground" />{supplier.email}
                  </a>
                ) : <span className="text-foreground">Not recorded</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Phone</dt>
              <dd className="mt-1 text-sm">
                {supplier.phone ? (
                  <a className="inline-flex items-center gap-2 rounded-sm text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-soft)]" href={`tel:${supplier.phone}`}>
                    <Phone aria-hidden="true" className="size-4 text-muted-foreground" />{supplier.phone}
                  </a>
                ) : <span className="text-foreground">Not recorded</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Website</dt>
              <dd className="mt-1 text-sm">
                {website ? (
                  <a className="inline-flex items-center gap-2 rounded-sm text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-soft)]" href={website} target="_blank" rel="noreferrer">
                    <ExternalLink aria-hidden="true" className="size-4 text-muted-foreground" />Visit website
                  </a>
                ) : <span className="text-foreground">Not recorded</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Address</dt>
              <dd className="mt-1 flex items-start gap-2 whitespace-pre-wrap text-sm text-foreground">
                {supplier.address ? <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : null}
                {supplier.address || "Not recorded"}
              </dd>
            </div>
          </dl>
          <div className="border-t pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Internal notes</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{supplier.notes || "No internal supplier notes have been recorded."}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="supplier-sourcing-title" className="overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]">
        <header className="flex flex-col gap-1 border-b bg-secondary px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="supplier-sourcing-title" className="text-base font-semibold tracking-tight text-foreground">Products and quotations</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Every transaction sourced from this supplier, with recorded quote terms.</p>
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {summaryLabel(items.length, "record", "records")}
          </p>
        </header>

        {items.length === 0 ? (
          <div className="flex items-start gap-3 px-5 py-8 text-sm text-muted-foreground">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary">
              <Factory aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="font-medium text-foreground">No sourcing activity yet</p>
              <p className="mt-1">Link this supplier from a transaction to begin building its product and quotation history.</p>
            </div>
          </div>
        ) : (
          <Table className="min-w-[72rem]">
            <caption className="sr-only">Products, clients, workflow status, and quotations for {supplier.name}.</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Product or request</TableHead>
                <TableHead scope="col">Client and RFQ</TableHead>
                <TableHead scope="col">RFQ date</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Quotations</TableHead>
                <TableHead scope="col"><span className="sr-only">Open transaction</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.transaction_id}>
                  <TableCell className="max-w-[22rem] whitespace-normal font-medium text-foreground">
                    {item.item_description || "Description not recorded"}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <p className="font-medium text-foreground">{item.client_name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.rfq_number || "RFQ number not recorded"}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.date_received ? <time dateTime={item.date_received}>{formatCalendarDate(item.date_received)}</time> : formatCalendarDate()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getWorkflowStatusBadgeClass(item.status)}>
                      {getWorkflowStatusLabel(item.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="min-w-[18rem] whitespace-normal">
                    {item.quotes.length === 0 ? (
                      <span className="text-sm text-muted-foreground">No quotation recorded</span>
                    ) : (
                      <ul className="space-y-3">
                        {item.quotes.map((quote) => (
                          <li key={quote.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                            <p className="font-semibold tabular-nums text-foreground">{formatMoney(quote.amount, quote.currency)}</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {formatEasternDateTime(quote.created_at)}
                              {quote.lead_time_days ? `, ${quote.lead_time_days} day lead time` : ""}
                            </p>
                            {quote.notes ? <p className="mt-1 text-xs leading-5 text-foreground">{quote.notes}</p> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell className="w-12 text-right">
                    <Link
                      to={`/transactions/${item.transaction_id}`}
                      state={{ transactionReturnTo: location.pathname, transactionBackLabel: supplier.name }}
                      aria-label={`Open transaction for ${item.item_description || supplier.name}`}
                      className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-[background-color,color,transform] duration-150 [transition-timing-function:var(--ease-out-ui)] hover:bg-secondary hover:text-foreground active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--color-ring-soft)] motion-reduce:transition-none motion-reduce:active:scale-100"
                    >
                      <ArrowUpRight aria-hidden="true" className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
