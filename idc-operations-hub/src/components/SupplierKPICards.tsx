import { Truck, DollarSign, Activity } from "lucide-react";
import { useMemo } from "react";
import type { SupplierSummary } from "../lib/api";

const currencyFormatter = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' });

interface SupplierKPICardsProps {
  summary: SupplierSummary | null;
  loading: boolean;
}

export function SupplierKPICards({ summary, loading }: SupplierKPICardsProps) {
  const kpiData = useMemo(() => ([
    { title: "Total Suppliers", value: loading ? "—" : String(summary?.total_suppliers ?? 0), icon: Truck, description: "Registered supplier partners" },
    { title: "Total Spend (All Time)", value: loading ? "—" : currencyFormatter.format(summary?.total_spend ?? 0), icon: DollarSign, description: "Cumulative supplier payments" },
    { title: "Suppliers on Active Projects", value: loading ? "—" : String(summary?.engaged_suppliers ?? 0), icon: Activity, description: "Currently engaged suppliers" },
  ]), [loading, summary]);

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
