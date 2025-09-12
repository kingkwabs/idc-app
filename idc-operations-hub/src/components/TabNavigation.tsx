interface Tab {
  id: string;
  label: string;
}

interface TabNavigationProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  completedTabs?: Record<string, boolean>;
}

import { CheckCircle } from "lucide-react";

export function TabNavigation({ tabs, activeTab, onTabChange, completedTabs = {} }: TabNavigationProps) {
  return (
    <div className="mb-8 border-b border-gray-200">
      <nav className="flex space-x-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center space-x-2 ${
              activeTab === tab.id
                ? "border-teal-600 text-teal-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <span>{tab.label}</span>
            {completedTabs[tab.id] && (
              <CheckCircle className="w-4 h-4 text-green-500" />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}