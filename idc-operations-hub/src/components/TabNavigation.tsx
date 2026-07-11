import { useRef, type KeyboardEvent } from "react";
import { CheckCircle2 } from "lucide-react";

interface Tab {
  id: string;
  label: string;
}

interface TabNavigationProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  completedTabs?: Record<string, boolean>;
  ariaLabel?: string;
}

export function TabNavigation({
  tabs,
  activeTab,
  onTabChange,
  completedTabs = {},
  ariaLabel = "Workspace sections",
}: TabNavigationProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTab = (index: number) => {
    const nextTab = tabs[index];
    if (!nextTab) return;
    onTabChange(nextTab.id);
    tabRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;

    if (nextIndex === null) return;
    event.preventDefault();
    focusTab(nextIndex);
  };

  return (
    <div className="overflow-x-auto border-b border-border">
      <div
        aria-label={ariaLabel}
        className="flex min-w-max gap-1"
        role="tablist"
      >
        {tabs.map((tab, index) => {
          const isActive = activeTab === tab.id;
          const isComplete = completedTabs[tab.id];

          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`relative flex min-h-11 items-center gap-2 rounded-t-md border-b-2 px-4 py-3 text-sm font-medium outline-none transition-[color,background-color,border-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out-ui)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring-soft)] motion-reduce:transition-none ${
                isActive
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span>{tab.label}</span>
              {isComplete ? (
                <>
                  <CheckCircle2
                    aria-hidden="true"
                    className="size-4 text-[var(--color-success)]"
                  />
                  <span className="sr-only">Complete</span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
