import { useState } from "react";
import { Button } from "./ui/button";
import { ShipmentTabConfirmed } from "./ShipmentTabConfirmed";
import { FinancialsTabInvoiced } from "./FinancialsTabInvoiced";

type DemoView = "shipment" | "financials";

export function AfterStateDemo() {
  const [activeView, setActiveView] = useState<DemoView>("shipment");

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <div className="flex space-x-4 mb-8">
        <Button
          onClick={() => setActiveView("shipment")}
          variant={activeView === "shipment" ? "default" : "outline"}
          className={`transition-all duration-200 ${
            activeView === "shipment"
              ? "bg-teal-600 hover:bg-teal-700 text-white"
              : "bg-white/70 hover:bg-white/90 text-gray-700"
          }`}
        >
          Shipment Tab (After Confirmation)
        </Button>
        <Button
          onClick={() => setActiveView("financials")}
          variant={activeView === "financials" ? "default" : "outline"}
          className={`transition-all duration-200 ${
            activeView === "financials"
              ? "bg-teal-600 hover:bg-teal-700 text-white"
              : "bg-white/70 hover:bg-white/90 text-gray-700"
          }`}
        >
          Financials Tab (After Invoicing)
        </Button>
      </div>

      {/* Content */}
      <div className="glass-card rounded-lg p-8">
        {activeView === "shipment" ? (
          <ShipmentTabConfirmed />
        ) : (
          <FinancialsTabInvoiced />
        )}
      </div>
    </div>
  );
}