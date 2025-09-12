import { LayoutDashboard, Users, Truck, Wallet, UserCheck } from "lucide-react";

type View = 
  | "dashboard"
  | "transaction-detail"
  | "clients"
  | "suppliers";

  interface SidebarProps {
    currentView: View;
    onViewChange: (view: View) => void;
  }
  

const navItems = [
  { name: "Dashboard", icon: LayoutDashboard, view: "dashboard" as View},
  { name: "Clients", icon: Users, view: "clients" as View },
  { name: "Suppliers", icon: Truck, view: "suppliers" as View },
  { name: "Petty Cash", icon: Wallet, view: "dashboard" as View },
  { name: "HR/Payroll", icon: UserCheck, view: "dashboard" as View },
];

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  return (
    <aside className="relative z-40 w-64 h-full glass-sidebar">
      <nav className="p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.view;
            return (
              <li key={item.name}>
                <button
                  onClick={() => onViewChange(item.view)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 ${
                    isActive
                      ? "text-teal-600 bg-white/30 font-medium backdrop-blur-sm border border-white/20"
                      : "text-gray-700 hover:bg-white/20 hover:backdrop-blur-sm"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}