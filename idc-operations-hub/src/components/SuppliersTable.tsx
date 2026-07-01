import { useMemo } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import type { SupplierMetricOut } from "../lib/api";

type Row = { id: number; name: string; quotes: number; lastQuoted?: string };

interface SuppliersTableProps {
  suppliers: SupplierMetricOut[];
  loading: boolean;
  error: string | null;
}

export function SuppliersTable({ suppliers, loading, error }: SuppliersTableProps) {
  const rows = useMemo<Row[]>(
    () => suppliers.map(s => ({
        id: s.id,
        name: s.name,
        quotes: s.quotes,
        lastQuoted: s.last_quoted ?? undefined,
      })),
    [suppliers]
  );

  return (
    <div className="overflow-hidden rounded-lg glass-table">
      <div className="px-6 py-4 border-b bg-gray-50/80 border-gray-200/50 flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Supplier List</h2>
        <div className="text-sm text-gray-500">{loading ? 'Loading…' : `${rows.length} suppliers`}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50/60">
            <tr>
              <th className="px-6 py-4 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">Supplier Name</th>
              <th className="px-6 py-4 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">Quotes</th>
              <th className="px-6 py-4 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y bg-white/90 divide-gray-200/50">
            {error && (<tr><td colSpan={3} className="px-6 py-4 text-red-600">{error}</td></tr>)}
            {!error && loading && (<tr><td colSpan={3} className="px-6 py-4 text-gray-500">Loading…</td></tr>)}
            {!error && !loading && rows.length === 0 && (<tr><td colSpan={3} className="px-6 py-4 text-gray-500">No suppliers.</td></tr>)}
            {rows.map((s) => (
              <tr key={s.id} className="transition-colors duration-200 hover:bg-gray-50/50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{s.name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-gray-900">{s.quotes}</span>
                </td>
                <td className="px-6 py-4 text-right whitespace-nowrap">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="w-8 h-8 p-0 hover:bg-gray-100">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="glass-card">
                      <DropdownMenuItem className="cursor-pointer">View Linked Transactions</DropdownMenuItem>
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
