import { useMemo } from "react";
import { AlertCircle, Building2 } from "lucide-react";

import type { ClientMetricOut } from "../lib/api";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

type Row = {
  id: number;
  name: string;
  activeTransactions: number;
  completedTransactions: number;
  totalRevenue: number;
};

interface ClientsTableProps {
  clients: ClientMetricOut[];
  loading: boolean;
  error: string | null;
}

function clientCountLabel(count: number): string {
  return `${count} ${count === 1 ? "client" : "clients"}`;
}

export function ClientsTable({ clients, loading, error }: ClientsTableProps) {
  const rows = useMemo<Row[]>(
    () => clients.map((client) => ({
      id: client.id,
      name: client.name,
      activeTransactions: client.active_transactions,
      completedTransactions: client.completed_transactions,
      totalRevenue: client.total_revenue,
    })),
    [clients],
  );

  return (
    <section aria-labelledby="client-list-title" aria-busy={loading} className="overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]">
      <header className="flex flex-col gap-1 border-b bg-secondary px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 id="client-list-title" className="text-base font-semibold tracking-tight text-foreground">Client register</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Transaction activity and recorded client value.</p>
        </div>
        <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
          {loading ? "Loading records" : error ? "Records unavailable" : clientCountLabel(rows.length)}
        </p>
      </header>

      <Table className="min-w-[44rem]">
        <caption className="sr-only">Clients with active transactions, completed transactions, and recorded client value.</caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Client</TableHead>
            <TableHead scope="col" className="text-right">Active</TableHead>
            <TableHead scope="col" className="text-right">Completed</TableHead>
            <TableHead scope="col" className="text-right">Client value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {error ? (
            <TableRow className="hover:bg-card">
              <TableCell colSpan={4}>
                <div role="alert" className="flex items-start gap-3 py-5 text-destructive">
                  <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-medium">Client records could not be loaded</p>
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
                <TableCell><Skeleton className="ml-auto h-4 w-8" /></TableCell>
                <TableCell><Skeleton className="ml-auto h-4 w-24" /></TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-card">
              <TableCell colSpan={4}>
                <div className="flex flex-col items-center px-4 py-10 text-center">
                  <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                    <Building2 aria-hidden="true" className="size-5" />
                  </span>
                  <p className="mt-3 font-medium text-foreground">No clients yet</p>
                  <p className="mt-1 max-w-md whitespace-normal text-sm text-muted-foreground">Add a client to start linking transactions and tracking revenue.</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="max-w-[22rem] whitespace-normal font-medium">{client.name}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary" data-numeric="true">{client.activeTransactions}</Badge>
                </TableCell>
                <TableCell className="text-right text-muted-foreground" data-numeric="true">{client.completedTransactions}</TableCell>
                <TableCell className="text-right font-medium" data-numeric="true">{currencyFormatter.format(client.totalRevenue)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}
