import { useEffect, useState } from "react";
import { Calendar, CalendarDays } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar as CalendarComponent } from "./ui/calendar";
import { createTransaction, fetchClients, type TransactionCreate } from "../lib/api";

interface CreateTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { createdId: number }) => void;
}

interface TransactionFormData {
  client_id: number | null;
  item_description: string;
  date_received: Date | undefined;
}

export function CreateTransactionModal({ isOpen, onClose, onSubmit }: CreateTransactionModalProps) {
  const [formData, setFormData] = useState<TransactionFormData>({
    client_id: null,
    item_description: "",
    date_received: undefined,
  });
  const [clients, setClients] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || clients.length > 0) return;
    let cancelled = false;
    (async () => {
      const res = await fetchClients();
      if (!cancelled) setClients(res.items);
    })();
    return () => { cancelled = true; };
  }, [isOpen, clients.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_id || !formData.date_received) return;
    setLoading(true);
    try {
      const payload: TransactionCreate = {
        client_id: formData.client_id,
        date_received: formData.date_received.toISOString().slice(0, 10),
        item_description: formData.item_description,
      };
      const created = await createTransaction(payload);
      onSubmit({ createdId: created.id });
      onClose();
      setFormData({ client_id: null, item_description: "", date_received: undefined });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onClose();
    setFormData({ client_id: null, item_description: "", date_received: undefined });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] glass-card border-white/30 backdrop-blur-xl shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-gray-900">
            Create New Transaction
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-600">
            Fill in the details below to create a new transaction record.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          {/* Client Field */}
          <div className="space-y-2">
            <Label htmlFor="client" className="text-sm font-medium text-gray-900">
              Client
            </Label>
            <Select
              value={formData.client_id ? String(formData.client_id) : ""}
              onValueChange={(value) => setFormData(prev => ({ ...prev, client_id: Number(value) }))}
            >
              <SelectTrigger className="w-full bg-white/50 border-white/30 backdrop-blur-sm hover:bg-white/60 transition-all">
                <SelectValue placeholder="Select a client..." />
              </SelectTrigger>
              <SelectContent className="glass-card border-white/30 backdrop-blur-xl">
                {clients.map((client) => (
                  <SelectItem 
                    key={client.id} 
                    value={String(client.id)}
                    className="hover:bg-white/20 focus:bg-white/20"
                  >
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Transaction Description */}
          <div className="space-y-2">
            <Label htmlFor="item_description" className="text-sm font-medium text-gray-900">
              Transaction Description
            </Label>
            <Input
              id="item_description"
              type="text"
              placeholder="e.g., Turbine Repair Kit Q4"
              value={formData.item_description}
              onChange={(e) => setFormData(prev => ({ ...prev, item_description: e.target.value }))}
              className="bg-white/50 border-white/30 backdrop-blur-sm hover:bg-white/60 focus:bg-white/70 transition-all"
            />
          </div>

          {/* Date RFQ Received Field */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-900">
              Date RFQ Received
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal bg-white/50 border-white/30 backdrop-blur-sm hover:bg-white/60 transition-all"
                >
                  <CalendarDays className="mr-2 h-4 w-4 text-gray-500" />
                  {formData.date_received ? (
                    formData.date_received.toLocaleDateString()
                  ) : (
                    <span className="text-gray-500">Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 glass-card border-white/30 backdrop-blur-xl">
                <CalendarComponent
                  mode="single"
                  selected={formData.date_received}
                  onSelect={(date) => setFormData(prev => ({ ...prev, date_received: date }))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="bg:white border-gray-300 text-gray-700 hover:bg-gray-50 backdrop-blur-sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
              disabled={!formData.client_id || !formData.item_description || !formData.date_received || loading}
            >
              {loading ? "Creating..." : "Create Transaction"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
