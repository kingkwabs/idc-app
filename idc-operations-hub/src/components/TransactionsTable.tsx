import { useEffect, useState } from "react";
import { MoreHorizontal, Edit, Eye } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { ManualStatusChangeModal } from "./ManualStatusChangeModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { useNavigate } from "react-router-dom";
import { fetchTransactions, updateTransaction, fetchClients, getTransactionSuppliers } from "../lib/api";
import type { TransactionOut } from "../lib/api";

function getStatusBadge(status: string) {
  switch (status) {
    case "Delivered":
      return (
        <Badge className="bg-green-500/90 text-white hover:bg-green-600 backdrop-blur-sm border border-green-400/30">
          {status}
        </Badge>
      );
    case "Pending PO":
      return (
        <Badge className="bg-yellow-500/90 text-gray-900 hover:bg-yellow-600 backdrop-blur-sm border border-yellow-400/30">
          {status}
        </Badge>
      );
    case "In Progress":
      return (
        <Badge className="bg-blue-500/90 text-white hover:bg-blue-600 backdrop-blur-sm border border-blue-400/30">
          {status}
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status || "—"}</Badge>;
  }
}

function formatCurrency(amount: number | null | undefined) {
  const n = amount ?? 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function SuppliersBadges({ suppliers }: { suppliers: string[] }) {
  const visible = suppliers.slice(0, 2);
  const remaining = suppliers.length - visible.length;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {visible.map((s) => (
        <Badge key={s} className="bg-gray-100 text-gray-800 border border-gray-300/50">
          {s}
        </Badge>
      ))}
      {remaining > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="bg-gray-200 text-gray-700 border border-gray-300/60 cursor-help">
                +{remaining}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="glass">
              <div className="max-w-xs text-sm text-gray-800">
                {suppliers.join(", ")}
              </div>
            </TooltipContent>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterClient, setFilterClient] = useState<string>('');
  const [sortKey, setSortKey] = useState<'date' | 'amount' | 'client'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [suppliersByTransaction, setSuppliersByTransaction] = useState<Map<number, string[]>>(new Map());
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const size = mode === "all" ? 1000 : 20;
      const [trxRes, clientsRes] = await Promise.all([
        fetchTransactions(1, size),
        fetchClients(),
      ]);
      setRows(trxRes.items);
      const map = new Map<number, string>();
      clientsRes.items.forEach(c => map.set(c.id, c.name));
      setClients(map);
      // load suppliers per transaction (best-effort)
      const supplierMap = new Map<number, string[]>();
      await Promise.all(trxRes.items.map(async (t) => {
        try {
          const res = await getTransactionSuppliers(t.id);
          supplierMap.set(t.id, res.items.map(s => s.name));
        } catch {
          supplierMap.set(t.id, []);
        }
      }));
      setSuppliersByTransaction(supplierMap);
    } catch (e: any) {
      setError(e?.message || "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleStatusChange = async (data: { newStatus: string; reason: string }) => {
    if (!selectedTransaction) return;
    try {
      await updateTransaction(selectedTransaction.id, { status: data.newStatus });
      setIsStatusModalOpen(false);
      setSelectedTransaction(null);
      await load();
    } catch (e) {
      console.error("Failed to update status:", e);
    }
  };

  const handleRowNavigate = (id: number) => {
    navigate(`/transactions/${id}`);
  };

  const filteredSorted = rows
    .filter(r => !filterStatus || (r.status || '').toLowerCase().includes(filterStatus.toLowerCase()))
    .filter(r => {
      if (!filterClient) return true;
      const name = clients.get(r.client_id) || '';
      return name.toLowerCase().includes(filterClient.toLowerCase());
    })
    .slice()
    .sort((a, b) => {
      if (sortKey === 'client') {
        const an = (clients.get(a.client_id) || '').toLowerCase();
        const bn = (clients.get(b.client_id) || '').toLowerCase();
        return sortDir === 'asc' ? an.localeCompare(bn) : bn.localeCompare(an);
      }
      if (sortKey === 'amount') {
        const av = (a.client_po_amount ?? a.client_quote_amount ?? 0) as number;
        const bv = (b.client_po_amount ?? b.client_quote_amount ?? 0) as number;
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      // date sort not explicitly present; fallback to id (created order desc)
      return sortDir === 'asc' ? a.id - b.id : b.id - a.id;
    });

  return (
    <div className="glass-table rounded-lg overflow-hidden hover:shadow-2xl transition-all duration-300">
      <div className="p-6 border-b border-white/20 bg-white/5">
        <h2 className="text-lg font-medium text-gray-900">{mode === "all" ? "All Transactions" : "Recent Transactions"}</h2>
        <div className="mt-4 flex flex-wrap gap-3 items-center">
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Filter by client"
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
          />
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Filter by status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          />
          <select className="border rounded px-2 py-1 text-sm" value={sortKey} onChange={(e) => setSortKey(e.target.value as any)}>
            <option value="date">Sort by Date</option>
            <option value="amount">Sort by Amount</option>
            <option value="client">Sort by Client</option>
          </select>
          <select className="border rounded px-2 py-1 text-sm" value={sortDir} onChange={(e) => setSortDir(e.target.value as any)}>
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-white/10 border-b border-white/10 hover:bg-white/20">
            <TableHead className="text-gray-700 font-semibold">Client</TableHead>
            <TableHead className="text-gray-700 font-semibold">Transaction Description</TableHead>
            <TableHead className="text-gray-700 font-semibold">Client PO ($)</TableHead>
            <TableHead className="text-gray-700 font-semibold">Supplier PO ($)</TableHead>
            <TableHead className="text-gray-700 font-semibold">Margin ($)</TableHead>
            <TableHead className="text-gray-700 font-semibold">Margin (%)</TableHead>
            <TableHead className="text-gray-700 font-semibold">Suppliers</TableHead>
            <TableHead className="text-gray-700 font-semibold">Status</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-gray-500">Loading...</TableCell>
            </TableRow>
          )}
          {error && !loading && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-red-600">{error}</TableCell>
            </TableRow>
          )}
          {!loading && !error && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-gray-500">No transactions.</TableCell>
            </TableRow>
          )}
          {filteredSorted.map((transaction, index) => {
            const clientName = clients.get(transaction.client_id) || `Client #${transaction.client_id}`;
            const clientPO = transaction.client_po_amount ?? transaction.client_quote_amount ?? null;
            const supplierPO = transaction.supplier_po_amount ?? null;
            const margin = (clientPO ?? 0) - (supplierPO ?? 0);
            const marginPct = clientPO && clientPO !== 0 ? (margin / clientPO) * 100 : null;
            const supplierNames = suppliersByTransaction.get(transaction.id) || [];
            return (
              <TableRow
                key={transaction.id}
                className="hover:bg-white/10 transition-all duration-200 border-b border-white/5 group cursor-pointer"
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => handleRowNavigate(transaction.id)}
              >
                <TableCell className="group-hover:text-gray-800 transition-colors">{clientName}</TableCell>
                <TableCell className="font-medium group-hover:text-gray-900 transition-colors">{transaction.item_description || "—"}</TableCell>
                <TableCell className="font-medium group-hover:text-gray-900 transition-colors">{clientPO != null ? formatCurrency(clientPO) : "—"}</TableCell>
                <TableCell className="font-medium group-hover:text-gray-900 transition-colors">{supplierPO != null ? formatCurrency(supplierPO) : "—"}</TableCell>
                <TableCell className="font-medium group-hover:text-gray-900 transition-colors">{formatCurrency(margin)}</TableCell>
                <TableCell className="font-medium group-hover:text-gray-900 transition-colors">{formatPercent(marginPct)}</TableCell>
                <TableCell>
                  <SuppliersBadges suppliers={supplierNames} />
                </TableCell>
                <TableCell>{getStatusBadge(transaction.status || "")}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="glass backdrop-blur-sm">
                      <DropdownMenuItem className="cursor-pointer">
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onClick={() => {
                          setSelectedTransaction(transaction);
                          setIsStatusModalOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Change Status
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ManualStatusChangeModal
        isOpen={isStatusModalOpen}
        onClose={() => {
          setIsStatusModalOpen(false);
          setSelectedTransaction(null);
        }}
        onSubmit={handleStatusChange}
        currentStatus={selectedTransaction?.status || undefined}
      />
    </div>
  );
}