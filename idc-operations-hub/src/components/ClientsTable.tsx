import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { fetchClients, fetchTransactions } from "../lib/api";

type Row = {
  id: number;
  name: string;
  activeTransactions: number;
  completedTransactions: number;
  totalRevenue: number;
};

export function ClientsTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [clientsRes, trxRes] = await Promise.all([
        fetchClients(),
        fetchTransactions(1, 1000),
      ]);
      const trx = trxRes.items;
      const computed: Row[] = clientsRes.items.map(c => {
        const mine = trx.filter(t => t.client_id === c.id);
        const completed = mine.filter(t => (t.status || '') === 'loans-cleared').length;
        const active = mine.length - completed;
        const totalRevenue = mine.reduce((sum, t) => sum + Number(t.client_po_amount ?? t.client_quote_amount ?? 0), 0);
        return { id: c.id, name: c.name, activeTransactions: active, completedTransactions: completed, totalRevenue };
      });
      setRows(computed);
    } catch (e: any) {
      setError(e?.message || 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="glass-table rounded-lg overflow-hidden">
      <div className="bg-gray-50/80 px-6 py-4 border-b border-gray-200/50 flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Client List</h2>
        <div className="text-sm text-gray-500">{loading ? 'Loading…' : `${rows.length} clients`}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50/60">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client Name</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active Transactions</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Completed Transactions</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Revenue</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white/90 divide-y divide-gray-200/50">
            {error && (
              <tr><td colSpan={5} className="px-6 py-4 text-red-600">{error}</td></tr>
            )}
            {!error && loading && (
              <tr><td colSpan={5} className="px-6 py-4 text-gray-500">Loading…</td></tr>
            )}
            {!error && !loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-4 text-gray-500">No clients.</td></tr>
            )}
            {rows.map((client) => (
              <tr key={client.id} className="hover:bg-gray-50/50 transition-colors duration-200">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{client.name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-200">{client.activeTransactions}</Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-gray-900">{client.completedTransactions}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(client.totalRevenue)}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-gray-100">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="glass-card">
                      <DropdownMenuItem className="cursor-pointer">View Transactions</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}