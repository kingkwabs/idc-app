import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchTransactionSummary } from "../lib/api";

interface KPICardsProps {
  mode: "recent" | "all";
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

export function KPICards({ mode }: KPICardsProps) {
  const navigate = useNavigate();
  const [activeCount, setActiveCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetchTransactionSummary();
        if (cancelled) return;
        setActiveCount(res.active_count);
        setTotalRevenue(res.total_revenue);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode]);

  const kpis = useMemo(() => ([
    { title: "Active Transactions", value: loading ? "—" : `${activeCount}`, route: "/?view=transactions-all" },
    { title: "Total Revenue", value: loading ? "—" : formatCurrency(totalRevenue), route: "/?view=transactions-all" },
  ]), [activeCount, totalRevenue, loading]);

  return (
    <div className="grid grid-cols-1 gap-6 mb-8 md:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi, index) => (
        <button
          key={kpi.title}
          onClick={() => navigate(kpi.route)}
          className="text-left glass-card rounded-lg p-6 hover:shadow-xl transition-all duration-300 hover:scale-[1.02] relative overflow-hidden group"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="absolute inset-0 transition-opacity duration-300 opacity-0 bg-gradient-to-br from-white/10 to-transparent group-hover:opacity-100" />
          <div className="relative z-10">
            <div className="mb-1 text-2xl font-semibold text-gray-900">
              {kpi.value}
            </div>
            <div className="mb-2 text-sm text-gray-600">{kpi.title}</div>
            <div className="text-xs font-medium text-green-600">View details</div>
          </div>
        </button>
      ))}
    </div>
  );
}
