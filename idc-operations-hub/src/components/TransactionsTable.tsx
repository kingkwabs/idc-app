import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Edit, Eye, MoreHorizontal } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import {
  fetchClients,
  fetchTransactions,
  getBulkTransactionSuppliers,
  updateTransaction,
  type TransactionOut,
} from "../lib/api";
import { getWorkflowStatusBadgeClass, getWorkflowStatusLabel } from "../lib/workflowStatus";
import { ManualStatusChangeModal } from "./ManualStatusChangeModal";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

type SortKey = "date" | "amount" | "client";
type SortDirection = "asc" | "desc";

function getStatusBadge(status: string) {
  return (
    <Badge className={`${getWorkflowStatusBadgeClass(status)} max-w-48 whitespace-normal text-center leading-4`}>
      {getWorkflowStatusLabel(status)}
    </Badge>
  );
}

function formatCurrency(amount: number | null | undefined) {
  return currencyFormatter.format(amount ?? 0);
}

function formatPercent(value: number | null | undefined) {
  return value == null || Number.isNaN(value) ? "—" : `${value.toFixed(1)}%`;
}

function SuppliersBadges({ suppliers }: { suppliers: string[] }) {
  const visible = suppliers.slice(0, 2);
  const remaining = suppliers.length - visible.length;

  if (suppliers.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((supplier) => (
        <Badge key={supplier} variant="secondary">{supplier}</Badge>
      ))}
      {remaining > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="cursor-help">+{remaining}</Badge>
            </TooltipTrigger>
            <TooltipContent><div className="max-w-xs text-sm">{suppliers.join(", ")}</div></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

interface TransactionsTableProps {
  mode?: "recent" | "all";
}

export function TransactionsTable({ mode = "recent" }: TransactionsTableProps) {
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionOut | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [rows, setRows] = useState<TransactionOut[]>([]);
  const [clients, setClients] = useState<Map<number, string>>(new Map());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [suppliersByTransaction, setSuppliersByTransaction] = useState<Map<number, string[]>>(new Map());
  const deferredClientFilter = useDeferredValue(filterClient);
  const deferredStatusFilter = useDeferredValue(filterStatus);
  const requestSequence = useRef(0);
  const navigate = useNavigate();
  const pageSize = mode === "all" ? 50 : 20;

  useEffect(() => {
    let cancelled = false;
    void fetchClients()
      .then((response) => {
        if (!cancelled) setClients(new Map(response.items.map((client) => [client.id, client.name])));
      })
      .catch(() => {
        if (!cancelled) setClients(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [mode]);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const transactionResponse = await fetchTransactions({
        page: mode === "all" ? page : 1,
        size: pageSize,
        client: deferredClientFilter,
        status: deferredStatusFilter,
        sort: sortKey,
        direction: sortDirection,
      });
      if (sequence !== requestSequence.current) return;

      setRows(transactionResponse.items);
      setTotal(transactionResponse.total);
      const lastPage = Math.max(1, Math.ceil(transactionResponse.total / pageSize));
      if (mode === "all" && page > lastPage) {
        setPage(lastPage);
        return;
      }

      const supplierMap = new Map(transactionResponse.items.map((transaction) => [transaction.id, [] as string[]]));
      try {
        const supplierResponse = await getBulkTransactionSuppliers(transactionResponse.items.map((transaction) => transaction.id));
        supplierResponse.items.forEach((item) => {
          supplierMap.set(item.transaction_id, item.suppliers.map((supplier) => supplier.name));
        });
      } catch {
        // Supplier context is optional; core transaction data should remain usable.
      }
      if (sequence === requestSequence.current) setSuppliersByTransaction(supplierMap);
    } catch (loadError) {
      if (sequence === requestSequence.current) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load transactions");
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [deferredClientFilter, deferredStatusFilter, mode, page, pageSize, sortDirection, sortKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStatusChange = async (data: { newStatus: string; reason: string }) => {
    if (!selectedTransaction) return;
    try {
      await updateTransaction(selectedTransaction.id, {
        status: data.newStatus,
        status_reason: data.reason,
      });
      setIsStatusModalOpen(false);
      setSelectedTransaction(null);
      await load();
      toast.success("Transaction status updated");
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "Failed to update transaction status");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstVisible = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastVisible = Math.min(page * pageSize, total);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-card)]" aria-labelledby="transactions-table-title">
      <div className="border-b border-border p-4 sm:p-5">
        <h2 id="transactions-table-title" className="text-lg font-semibold text-card-foreground">
          {mode === "all" ? "All transactions" : "Recent transactions"}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_11rem_9rem]">
          <div>
            <Label htmlFor="transaction-client-filter" className="sr-only">Filter by client</Label>
            <Input
              id="transaction-client-filter"
              placeholder="Filter by client"
              value={filterClient}
              onChange={(event) => {
                setFilterClient(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <Label htmlFor="transaction-status-filter" className="sr-only">Filter by status</Label>
            <Input
              id="transaction-status-filter"
              placeholder="Filter by status"
              value={filterStatus}
              onChange={(event) => {
                setFilterStatus(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <Label htmlFor="transaction-sort" className="sr-only">Sort transactions</Label>
            <select
              id="transaction-sort"
              className="h-10 w-full rounded-md border border-input bg-input-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-[var(--color-ring-soft)]"
              value={sortKey}
              onChange={(event) => {
                setSortKey(event.target.value as SortKey);
                setPage(1);
              }}
            >
              <option value="date">Date received</option>
              <option value="amount">Client amount</option>
              <option value="client">Client</option>
            </select>
          </div>
          <div>
            <Label htmlFor="transaction-direction" className="sr-only">Sort direction</Label>
            <select
              id="transaction-direction"
              className="h-10 w-full rounded-md border border-input bg-input-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-[var(--color-ring-soft)]"
              value={sortDirection}
              onChange={(event) => {
                setSortDirection(event.target.value as SortDirection);
                setPage(1);
              }}
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Client value</TableHead>
              <TableHead>Supplier PO</TableHead>
              <TableHead>Value spread</TableHead>
              <TableHead>Spread %</TableHead>
              <TableHead>Suppliers</TableHead>
              <TableHead className="sticky right-0 z-10 w-14 border-l border-border bg-muted">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={9} className="h-28 text-center text-muted-foreground">Loading transactions...</TableCell></TableRow>}
            {error && !loading && <TableRow><TableCell colSpan={9} className="h-28 text-center text-destructive">{error}</TableCell></TableRow>}
            {!loading && !error && rows.length === 0 && (
              <TableRow><TableCell colSpan={9} className="h-28 text-center text-muted-foreground">{deferredClientFilter || deferredStatusFilter ? "No transactions match these filters." : "No transactions yet."}</TableCell></TableRow>
            )}
            {!loading && !error && rows.map((transaction) => {
              const clientName = clients.get(transaction.client_id) || `Client #${transaction.client_id}`;
              const clientPO = transaction.client_po_amount ?? transaction.client_quote_amount ?? null;
              const supplierPO = transaction.supplier_po_amount ?? null;
              const margin = (clientPO ?? 0) - (supplierPO ?? 0);
              const marginPercentage = clientPO ? (margin / clientPO) * 100 : null;
              const supplierNames = suppliersByTransaction.get(transaction.id) || [];

              return (
                <TableRow key={transaction.id} className="group">
                  <TableCell>
                    <Link className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" to={`/transactions/${transaction.id}`}>
                      {clientName}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-72">
                    <Link className="block truncate text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" to={`/transactions/${transaction.id}`}>
                      {transaction.item_description || "Untitled transaction"}
                    </Link>
                  </TableCell>
                  <TableCell>{getStatusBadge(transaction.status || "")}</TableCell>
                  <TableCell data-numeric="true">{clientPO != null ? formatCurrency(clientPO) : "—"}</TableCell>
                  <TableCell data-numeric="true">{supplierPO != null ? formatCurrency(supplierPO) : "—"}</TableCell>
                  <TableCell data-numeric="true">{formatCurrency(margin)}</TableCell>
                  <TableCell data-numeric="true">{formatPercent(marginPercentage)}</TableCell>
                  <TableCell><SuppliersBadges suppliers={supplierNames} /></TableCell>
                  <TableCell className="sticky right-0 z-[1] w-14 border-l border-border bg-card group-hover:bg-secondary">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for transaction ${transaction.id}`}>
                          <MoreHorizontal aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/transactions/${transaction.id}`)}>
                          <Eye aria-hidden="true" />
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setSelectedTransaction(transaction);
                          setIsStatusModalOpen(true);
                        }}>
                          <Edit aria-hidden="true" />
                          Change status
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {mode === "all" && !error && (
        <footer className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite">Showing {firstVisible}-{lastVisible} of {total} transactions</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={loading || page <= 1}
            >
              <ChevronLeft aria-hidden="true" />
              Previous
            </Button>
            <span className="min-w-20 text-center" data-numeric="true">Page {page} of {totalPages}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={loading || page >= totalPages}
            >
              Next
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </footer>
      )}

      <ManualStatusChangeModal
        isOpen={isStatusModalOpen}
        onClose={() => {
          setIsStatusModalOpen(false);
          setSelectedTransaction(null);
        }}
        onSubmit={handleStatusChange}
        currentStatus={selectedTransaction?.status || undefined}
      />
    </section>
  );
}
