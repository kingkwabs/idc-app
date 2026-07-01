import { useMemo } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import type { ClientMetricOut } from "../lib/api";

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

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

export function ClientsTable({ clients, loading, error }: ClientsTableProps) {
  const formatCurrency = (amount: number) => currencyFormatter.format(amount);

  const rows = useMemo<Row[]>(
    () => clients.map(c => ({
        id: c.id,
        name: c.name,
        activeTransactions: c.active_transactions,
        completedTransactions: c.completed_transactions,
        totalRevenue: c.total_revenue,
      })),
    [clients]
  );

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
