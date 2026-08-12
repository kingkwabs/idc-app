import { AlertCircle, ArrowUpRight, Truck } from "lucide-react";
import { Link } from "react-router-dom";

import type { SupplierMetricOut } from "../lib/api";
import { formatEasternDate } from "../lib/dateTime";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

interface SuppliersTableProps {
  suppliers: SupplierMetricOut[];
  loading: boolean;
  error: string | null;
}

function supplierCountLabel(count: number): string {
  return `${count} ${count === 1 ? "supplier" : "suppliers"}`;
}

export function SuppliersTable({ suppliers, loading, error }: SuppliersTableProps) {
  return (
    <section aria-labelledby="supplier-list-title" aria-busy={loading} className="overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]">
      <header className="flex flex-col gap-1 border-b bg-secondary px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 id="supplier-list-title" className="text-base font-semibold tracking-tight text-foreground">Supplier register</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Sourcing activity and most recent quote by supplier.</p>
        </div>
        <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
          {loading ? "Loading records" : error ? "Records unavailable" : supplierCountLabel(suppliers.length)}
        </p>
      </header>

      <Table className="min-w-[52rem]">
        <caption className="sr-only">Suppliers with active sourcing, quote counts, and links to supplier records.</caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Supplier</TableHead>
            <TableHead scope="col" className="text-right">Active</TableHead>
            <TableHead scope="col" className="text-right">Sourcing records</TableHead>
            <TableHead scope="col" className="text-right">Quotes</TableHead>
            <TableHead scope="col" className="text-right">Latest quote</TableHead>
            <TableHead scope="col"><span className="sr-only">Open supplier</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {error ? (
            <TableRow className="hover:bg-card">
              <TableCell colSpan={6}>
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
                <TableCell><Skeleton className="ml-auto h-5 w-10" /></TableCell>
                <TableCell><Skeleton className="ml-auto h-5 w-10" /></TableCell>
                <TableCell><Skeleton className="ml-auto h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="ml-auto size-8" /></TableCell>
              </TableRow>
            ))
          ) : suppliers.length === 0 ? (
            <TableRow className="hover:bg-card">
              <TableCell colSpan={6}>
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
            suppliers.map((supplier) => (
              <TableRow key={supplier.id} className="group">
                <TableCell className="max-w-[24rem] whitespace-normal font-medium">
                  <Link
                    to={`/suppliers/${supplier.id}`}
                    className="rounded-sm text-foreground underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-ring-soft)]"
                  >
                    {supplier.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={supplier.active_transactions > 0 ? "default" : "secondary"} data-numeric="true">
                    {supplier.active_transactions}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{supplier.sourcing_records}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary" data-numeric="true">{supplier.quotes}</Badge>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {supplier.last_quoted ? <time dateTime={supplier.last_quoted}>{formatEasternDate(supplier.last_quoted)}</time> : "Not yet quoted"}
                </TableCell>
                <TableCell className="w-12 text-right">
                  <Link
                    to={`/suppliers/${supplier.id}`}
                    aria-label={`Open ${supplier.name}`}
                    className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-[background-color,color,transform] duration-150 [transition-timing-function:var(--ease-out-ui)] hover:bg-secondary hover:text-foreground active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--color-ring-soft)] motion-reduce:transition-none motion-reduce:active:scale-100"
                  >
                    <ArrowUpRight aria-hidden="true" className="size-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}
