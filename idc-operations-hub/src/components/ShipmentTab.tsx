import React, { useState } from "react";
import { Calendar, Check, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface ShipmentTabProps {
  onShipmentConfirmed: (data: { leadTime?: string; trackingNumber?: string; shippedDate?: string; etaDate?: string }) => void;
}

export function ShipmentTab({ onShipmentConfirmed }: ShipmentTabProps) {
  const [shipmentData, setShipmentData] = useState({
    leadTime: "",
    trackingNumber: "",
    shippedDate: "",
    etaDate: "",
  });

  const handleInputChange = (field: string, value: string) => {
    setShipmentData(prev => ({ ...prev, [field]: value }));
  };

  const handleConfirmShipment = () => {
    onShipmentConfirmed({
      leadTime: shipmentData.leadTime,
      trackingNumber: shipmentData.trackingNumber,
      shippedDate: shipmentData.shippedDate,
      etaDate: shipmentData.etaDate,
    });
    toast.success("Shipment confirmed successfully!", {
      description: "Progress automatically advanced to 'Shipped' status.",
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-xl font-medium text-gray-900 mb-2">Shipment Details</h2>
        <p className="text-gray-600">Manage and track shipment information for this transaction.</p>
      </div>

      {/* Form Fields */}
      <div className="glass-card rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Lead Time */}
          <div className="space-y-2">
            <Label htmlFor="leadTime" className="text-gray-700">
              Lead Time (days)
            </Label>
            <Input
              id="leadTime"
              type="number"
              placeholder="Enter lead time in days"
              value={shipmentData.leadTime}
              onChange={(e) => handleInputChange("leadTime", e.target.value)}
              className="glass border-white/20 bg-white/50 backdrop-blur-sm focus:bg-white/80 transition-all duration-200"
            />
          </div>

          {/* Tracking Number */}
          <div className="space-y-2">
            <Label htmlFor="trackingNumber" className="text-gray-700">
              Tracking Number
            </Label>
            <Input
              id="trackingNumber"
              type="text"
              placeholder="Enter tracking number"
              value={shipmentData.trackingNumber}
              onChange={(e) => handleInputChange("trackingNumber", e.target.value)}
              className="glass border-white/20 bg-white/50 backdrop-blur-sm focus:bg-white/80 transition-all duration-200"
            />
          </div>

          {/* Shipped Date */}
          <div className="space-y-2">
            <Label htmlFor="shippedDate" className="text-gray-700">
              Shipped Date
            </Label>
            <div className="relative">
              <Input
                id="shippedDate"
                type="date"
                value={shipmentData.shippedDate}
                onChange={(e) => handleInputChange("shippedDate", e.target.value)}
                className="glass border-white/20 bg-white/50 backdrop-blur-sm focus:bg-white/80 transition-all duration-200 pr-10"
              />
              <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
            </div>
          </div>

          {/* ETA Date */}
          <div className="space-y-2">
            <Label htmlFor="etaDate" className="text-gray-700">
              ETA Date
            </Label>
            <div className="relative">
              <Input
                id="etaDate"
                type="date"
                value={shipmentData.etaDate}
                onChange={(e) => handleInputChange("etaDate", e.target.value)}
                className="glass border-white/20 bg-white/50 backdrop-blur-sm focus:bg-white/80 transition-all duration-200 pr-10"
              />
              <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Additional Information Section */}
        <div className="border-t border-white/20 pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Shipment Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-white/30 backdrop-blur-sm rounded-lg border border-white/20">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-sm font-medium text-gray-700">Processing</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">Order is being prepared</p>
            </div>
            <div className="p-4 bg-white/30 backdrop-blur-sm rounded-lg border border-white/20">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <span className="text-sm font-medium text-gray-700">In Transit</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">Package is on the way</p>
            </div>
            <div className="p-4 bg-white/30 backdrop-blur-sm rounded-lg border border-white/20">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-gray-700">Delivered</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">Package has arrived</p>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Action Button */}
      <div className="flex justify-center pt-4">
        <Button
          onClick={handleConfirmShipment}
          className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-3 text-base font-medium shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 backdrop-blur-sm border border-teal-500/30"
          size="lg"
        >
          <Truck className="h-5 w-5 mr-2" />
          Confirm Shipment
        </Button>
      </div>
    </div>
  );
}