import { Truck, DollarSign, Activity } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchSuppliers, fetchTransactions, getTransactionSuppliers } from "../lib/api";

export function SupplierKPICards() {
  const [totalSuppliers, setTotalSuppliers] = useState<number>(0);
  const [engagedSuppliers, setEngagedSuppliers] = useState<number>(0);
  const [totalSpend, setTotalSpend] = useState<number>(0);

  useEffect(() => {
    (async () => {
      try {
        const [supRes, trxRes] = await Promise.all([
          fetchSuppliers(),
          fetchTransactions(1, 200),
        ]);
        setTotalSuppliers(supRes.items.length);
        // compute engaged suppliers across recent transactions
        const engaged = new Set<number>();
        await Promise.all(trxRes.items.map(async (t) => {
          try {
            const links = await getTransactionSuppliers(t.id);
            links.items.forEach(s => engaged.add(s.id));
          } catch {}
        }));
        setEngagedSuppliers(engaged.size);
        // spend: placeholder until payments are tracked
        setTotalSpend(0);
      } catch {
        setTotalSuppliers(0);
        setEngagedSuppliers(0);
        setTotalSpend(0);
      }
    })();
  }, []);

  const kpiData = useMemo(() => ([
    { title: "Total Suppliers", value: String(totalSuppliers), icon: Truck, description: "Registered supplier partners" },
    { title: "Total Spend (All Time)", value: new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(totalSpend), icon: DollarSign, description: "Cumulative supplier payments" },
    { title: "Suppliers on Active Projects", value: String(engagedSuppliers), icon: Activity, description: "Currently engaged suppliers" },
  ]), [totalSuppliers, totalSpend, engagedSuppliers]);

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