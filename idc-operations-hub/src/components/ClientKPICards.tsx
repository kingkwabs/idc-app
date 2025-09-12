import { DollarSign, Users, Activity } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchClients, fetchTransactions } from "../lib/api";

export function ClientKPICards() {
  const [totalClients, setTotalClients] = useState<number>(0);
  const [totalRevenue, setTotalRevenue] = useState<number>(0);
  const [activeTransactions, setActiveTransactions] = useState<number>(0);

  useEffect(() => {
    (async () => {
      try {
        const [clientsRes, trxRes] = await Promise.all([
          fetchClients(),
          fetchTransactions(1, 1000),
        ]);
        setTotalClients(clientsRes.items.length);
        const trx = trxRes.items;
        const revenue = trx.reduce((sum, t) => sum + Number(t.client_po_amount ?? t.client_quote_amount ?? 0), 0);
        setTotalRevenue(revenue);
        const active = trx.filter(t => {
          const s = (t.status || '').toLowerCase();
          return s !== 'loans-cleared' && s !== 'cancelled';
        }).length;
        setActiveTransactions(active);
      } catch {
        // fallback to zeros
        setTotalClients(0);
        setTotalRevenue(0);
        setActiveTransactions(0);
      }
    })();
  }, []);

  const kpiData = useMemo(() => ([
    { title: "Total Clients", value: String(totalClients), icon: Users, description: "Active client accounts" },
    { title: "Total Revenue (All Time)", value: new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(totalRevenue), icon: DollarSign, description: "Cumulative client revenue" },
    { title: "Currently Active Transactions", value: String(activeTransactions), icon: Activity, description: "In-progress client projects" },
  ]), [totalClients, totalRevenue, activeTransactions]);

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