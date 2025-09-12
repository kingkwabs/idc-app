import { useState } from "react";
import { DollarSign, FileText, ExternalLink, CheckCircle, Clock } from "lucide-react";
import { Badge } from "./ui/badge";

export function FinancialsTabInvoiced() {
  const [selectedSupplier, setSelectedSupplier] = useState("supplier1");

  const supplierQuotes = [
    { id: "supplier1", name: "TechSupply Corp", price: "$2,450", deliveryTime: "5-7 days", selected: true },
    { id: "supplier2", name: "Industrial Partners", price: "$2,680", deliveryTime: "3-5 days", selected: false },
    { id: "supplier3", name: "Global Manufacturing", price: "$2,320", deliveryTime: "7-10 days", selected: false },
  ];

  const associatedCosts = [
    { description: "Supplier Quote", amount: "$2,450", status: "confirmed" },
    { description: "Shipping & Handling", amount: "$150", status: "confirmed" },
    { description: "Processing Fee", amount: "$75", status: "confirmed" },
    { description: "Tax", amount: "$198", status: "confirmed" },
  ];

  const totalAmount = "$2,873";

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return (
          <Badge className="bg-green-500/90 text-white hover:bg-green-600 backdrop-blur-sm border border-green-400/30">
            Confirmed
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-500/90 text-gray-900 hover:bg-yellow-600 backdrop-blur-sm border border-yellow-400/30">
            Pending
          </Badge>
        );
      case "processing":
        return (
          <Badge className="bg-blue-500/90 text-white hover:bg-blue-600 backdrop-blur-sm border border-blue-400/30">
            Processing
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-xl font-medium text-gray-900 mb-2">Financial Details</h2>
        <p className="text-gray-600">Invoice has been created and is awaiting payment processing.</p>
      </div>

      {/* Invoice Created Notification */}
      <div className="glass-card rounded-lg p-6 bg-blue-50/90 border-blue-200/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-blue-800 font-medium">
                Invoice #INV-0452 Created in QuickBooks
              </p>
              <p className="text-blue-600 text-sm mt-1">
                Created on August 15, 2025 • Total: {totalAmount}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Badge className="bg-blue-500 text-white hover:bg-blue-600 backdrop-blur-sm border border-blue-400/30">
              <Clock className="h-3 w-3 mr-1" />
              Awaiting Payment
            </Badge>
            <button className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 transition-colors">
              <ExternalLink className="h-4 w-4" />
              <span className="text-sm">View in QuickBooks</span>
            </button>
          </div>
        </div>
      </div>

      {/* Supplier Quotes Section */}
      <div className="glass-card rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Selected Supplier Quote</h3>
        <div className="space-y-4">
          {supplierQuotes.map((quote) => (
            <div
              key={quote.id}
              className={`p-4 rounded-lg border transition-all duration-200 ${
                quote.selected
                  ? "bg-green-50/90 border-green-200/50 ring-2 ring-green-500/20"
                  : "bg-white/50 border-gray-200/50 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    {quote.selected && <CheckCircle className="h-5 w-5 text-green-600" />}
                    <span className="font-medium text-gray-900">{quote.name}</span>
                  </div>
                  {quote.selected && (
                    <Badge className="bg-green-500/90 text-white hover:bg-green-600 backdrop-blur-sm border border-green-400/30">
                      Selected
                    </Badge>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{quote.price}</p>
                  <p className="text-sm text-gray-600">{quote.deliveryTime}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Associated Costs Section */}
      <div className="glass-card rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Cost Breakdown</h3>
        <div className="space-y-4">
          {associatedCosts.map((cost, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-white/50 backdrop-blur-sm rounded-lg border border-white/20">
              <div className="flex items-center space-x-3">
                <DollarSign className="h-4 w-4 text-gray-500" />
                <span className="text-gray-900">{cost.description}</span>
              </div>
              <div className="flex items-center space-x-3">
                <span className="font-semibold text-gray-900">{cost.amount}</span>
                {getStatusBadge(cost.status)}
              </div>
            </div>
          ))}
          
          {/* Total */}
          <div className="border-t border-gray-200/50 pt-4">
            <div className="flex items-center justify-between p-3 bg-gray-50/80 backdrop-blur-sm rounded-lg border border-gray-200/50">
              <div className="flex items-center space-x-3">
                <span className="font-semibold text-gray-900">Total Amount</span>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-xl font-bold text-gray-900">{totalAmount}</span>
                <Badge className="bg-green-500/90 text-white hover:bg-green-600 backdrop-blur-sm border border-green-400/30">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Invoiced
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Status */}
      <div className="glass-card rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Payment Information</h3>
        <div className="space-y-4">
          <div className="p-4 bg-yellow-50/80 backdrop-blur-sm rounded-lg border border-yellow-200/50">
            <div className="flex items-center space-x-3">
              <Clock className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-yellow-800 font-medium">Payment Pending</p>
                <p className="text-yellow-600 text-sm">Invoice sent to client for payment approval</p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 bg-white/50 backdrop-blur-sm rounded-lg border border-white/20">
              <p className="text-sm text-gray-600">Payment Method</p>
              <p className="font-medium text-gray-900">Bank Transfer</p>
            </div>
            <div className="p-3 bg-white/50 backdrop-blur-sm rounded-lg border border-white/20">
              <p className="text-sm text-gray-600">Due Date</p>
              <p className="font-medium text-gray-900">August 30, 2025</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}