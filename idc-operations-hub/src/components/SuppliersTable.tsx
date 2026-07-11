import { useMemo } from "react";
import { AlertCircle, Truck } from "lucide-react";

import type { SupplierMetricOut } from "../lib/api";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type Row = {
  id: number;
  name: string;
  quotes: number;
  lastQuoted?: string;
};

interface SuppliersTableProps {
  suppliers: SupplierMetricOut[];
  loading: boolean;
  error: string | null;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function supplierCountLabel(count: number): string {
  return `${count} ${count === 1 ? "supplier" : "suppliers"}`;
}

function formatDate(value?: string): string {
  if (!value) return "Not yet quoted";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return dateFormatter.format(date);
}

export function SuppliersTable({ suppliers, loading, error }: SuppliersTableProps) {
  const rows = useMemo<Row[]>(
    () => suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      quotes: supplier.quotes,
      lastQuoted: supplier.last_quoted ?? undefined,
    })),
    [suppliers],
  );

  return (
    <section aria-labelledby="supplier-list-title" aria-busy={loading} className="overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]">
      <header className="flex flex-col gap-1 border-b bg-secondary px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 id="supplier-list-title" className="text-base font-semibold tracking-tight text-foreground">Supplier register</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Sourcing activity and most recent quote by supplier.</p>
        </div>
        <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
          {loading ? "Loading records" : error ? "Records unavailable" : supplierCountLabel(rows.length)}
        </p>
      </header>

      <Table className="min-w-[38rem]">
        <caption className="sr-only">Suppliers with quote counts and latest quote dates.</caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Supplier</TableHead>
            <TableHead scope="col" className="text-right">Quotes</TableHead>
            <TableHead scope="col" className="text-right">Latest quote</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {error ? (
            <TableRow className="hover:bg-card">
              <TableCell colSpan={3}>
                <div role="alert" className="flex items-start gap-3 py-5 text-destructive">
                  <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-medium">Supplier records could not be loaded</p>
                    <p className="mt-1 whitespace-normal text-sm text-muted-foreground">{error}</p>
                  </div>
                </div>
              </TableCell>
            </TableRow>
          ) : loading ? (
            Array.from({ length: 4 }, (_, index) => (
              <TableRow key={index} className="hover:bg-card">
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell><Skeleton className="ml-auto h-5 w-10" /></TableCell>
                <TableCell><Skeleton className="ml-auto h-4 w-24" /></TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-card">
              <TableCell colSpan={3}>
                <div className="flex flex-col items-center px-4 py-10 text-center">
                  <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                    <Truck aria-hidden="true" className="size-5" />
                  </span>
                  <p className="mt-3 font-medium text-foreground">No suppliers yet</p>
                  <p className="mt-1 max-w-md whitespace-normal text-sm text-muted-foreground">Add a supplier to begin recording quotes and sourcing activity.</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((supplier) => (
              <TableRow key={supplier.id}>
                <TableCell className="max-w-[24rem] whitespace-normal font-medium">{supplier.name}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary" data-numeric="true">{supplier.quotes}</Badge>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {supplier.lastQuoted ? <time dateTime={supplier.lastQuoted}>{formatDate(supplier.lastQuoted)}</time> : formatDate()}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}
