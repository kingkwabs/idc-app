import { useEffect, useState } from "react";
import { Clock, FileText, DollarSign, User } from "lucide-react";
import { listActivity } from "../lib/api";

interface ActivityLogProps {
  transactionId: number;
}

interface ActivityItem {
  id: number;
  action: string;
  details?: string;
  created_at: string;
}

export function ActivityLog({ transactionId }: ActivityLogProps) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await listActivity(transactionId);
        if (cancelled) return;
        setItems(res.items);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [transactionId]);

  return (
    <div className="glass-card rounded-lg p-6 hover:shadow-xl transition-all duration-300">
      <h3 className="text-lg font-medium text-gray-900 mb-6">Activity Log</h3>
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-4">
          {items.map((activity) => (
            <div 
              key={activity.id} 
              className="flex items-start gap-4 p-3 rounded-lg hover:bg-white/30 transition-all duration-200 group"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-white/40 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20 group-hover:bg-white/50 transition-all duration-200">
                <Clock className="w-4 h-4 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">
                  <span className="font-medium">{activity.action}</span>{activity.details ? ` — ${activity.details}` : ""}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(activity.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-gray-500">No recent activity.</p>
          )}
        </div>
      )}
    </div>
  );
}