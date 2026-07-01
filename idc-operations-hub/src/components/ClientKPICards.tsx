import { DollarSign, Users, Activity } from "lucide-react";
import { useMemo } from "react";
import type { ClientMetricOut } from "../lib/api";

const currencyFormatter = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' });

interface ClientKPICardsProps {
  clients: ClientMetricOut[];
  loading: boolean;
}

export function ClientKPICards({ clients, loading }: ClientKPICardsProps) {
  const totals = useMemo(() => {
    let totalRevenue = 0;
    let activeTransactions = 0;
    for (const client of clients) {
      totalRevenue += client.total_revenue;
      activeTransactions += client.active_transactions;
    }
    return { totalClients: clients.length, totalRevenue, activeTransactions };
  }, [clients]);

  const kpiData = useMemo(() => ([
    { title: "Total Clients", value: loading ? "—" : String(totals.totalClients), icon: Users, description: "Active client accounts" },
    { title: "Total Revenue (All Time)", value: loading ? "—" : currencyFormatter.format(totals.totalRevenue), icon: DollarSign, description: "Cumulative client revenue" },
    { title: "Currently Active Transactions", value: loading ? "—" : String(totals.activeTransactions), icon: Activity, description: "In-progress client projects" },
  ]), [loading, totals]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {kpiData.map((kpi, index) => {
        const Icon = kpi.icon;
        return (
          <div
            key={index}
            className="glass-card rounded-lg p-6 transition-all duration-200 hover:shadow-lg"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-teal-50 rounded-lg">
                <Icon className="h-6 w-6 text-teal-600" />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-semibold text-gray-900 mb-1">
                {kpi.value}
              </h3>
              <p className="text-sm font-medium text-gray-600 mb-1">
                {kpi.title}
              </p>
              <p className="text-xs text-gray-500">
                {kpi.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
