import { Check, Truck, Calendar } from "lucide-react";

export function ShipmentTabConfirmed() {
  // Sample data showing confirmed shipment information
  const shipmentData = {
    leadTime: "7 days",
    trackingNumber: "UPS123456789",
    shippedDate: "2025-08-15",
    etaDate: "2025-08-22",
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-xl font-medium text-gray-900 mb-2">Shipment Details</h2>
        <p className="text-gray-600">Shipment has been confirmed and is now being processed.</p>
      </div>

      {/* Success Notification */}
      <div className="glass-card rounded-lg p-6 bg-green-50/90 border-green-200/50">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <Check className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="text-green-800 font-medium">
              Shipment confirmed on August 15, 2025. Status updated to 'Shipped'.
            </p>
          </div>
        </div>
      </div>

      {/* Read-Only Data Fields */}
      <div className="glass-card rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Lead Time */}
          <div className="space-y-2">
            <label className="text-gray-700 font-medium">Lead Time</label>
            <div className="p-3 bg-gray-50/80 backdrop-blur-sm rounded-lg border border-gray-200/50">
              <span className="text-gray-900">{shipmentData.leadTime}</span>
            </div>
          </div>

          {/* Tracking Number */}
          <div className="space-y-2">
            <label className="text-gray-700 font-medium">Tracking Number</label>
            <div className="p-3 bg-gray-50/80 backdrop-blur-sm rounded-lg border border-gray-200/50">
              <span className="text-gray-900 font-mono">{shipmentData.trackingNumber}</span>
            </div>
          </div>

          {/* Shipped Date */}
          <div className="space-y-2">
            <label className="text-gray-700 font-medium">Shipped Date</label>
            <div className="p-3 bg-gray-50/80 backdrop-blur-sm rounded-lg border border-gray-200/50">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span className="text-gray-900">{formatDate(shipmentData.shippedDate)}</span>
              </div>
            </div>
          </div>

          {/* ETA Date */}
          <div className="space-y-2">
            <label className="text-gray-700 font-medium">ETA Date</label>
            <div className="p-3 bg-gray-50/80 backdrop-blur-sm rounded-lg border border-gray-200/50">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span className="text-gray-900">{formatDate(shipmentData.etaDate)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Shipment Status - Updated */}
        <div className="border-t border-white/20 pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Current Shipment Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-white/30 backdrop-blur-sm rounded-lg border border-white/20 opacity-60">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                <span className="text-sm font-medium text-gray-600">Processing</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Completed</p>
            </div>
            <div className="p-4 bg-yellow-50/80 backdrop-blur-sm rounded-lg border border-yellow-200/50">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-yellow-800">In Transit</span>
              </div>
              <p className="text-xs text-yellow-700 mt-1">Currently shipping</p>
            </div>
            <div className="p-4 bg-white/30 backdrop-blur-sm rounded-lg border border-white/20 opacity-60">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                <span className="text-sm font-medium text-gray-600">Delivered</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Pending</p>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Actions */}
      <div className="glass-card rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Next Steps</h3>
        <div className="space-y-3">
          <div className="flex items-center space-x-3 p-3 bg-blue-50/80 backdrop-blur-sm rounded-lg border border-blue-200/50">
            <Truck className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-blue-800 font-medium">Track your shipment</p>
              <p className="text-blue-600 text-sm">Use tracking number {shipmentData.trackingNumber} to monitor progress</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-gray-50/80 backdrop-blur-sm rounded-lg border border-gray-200/50">
            <Check className="h-5 w-5 text-gray-600" />
            <div>
              <p className="text-gray-800 font-medium">Delivery confirmation</p>
              <p className="text-gray-600 text-sm">You'll receive an email once the package is delivered</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}