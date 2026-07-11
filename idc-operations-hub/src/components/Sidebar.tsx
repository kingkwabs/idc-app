import {
  BookOpenCheck,
  Building2,
  Factory,
  ReceiptText,
  UserCog,
} from "lucide-react";
import type { RefObject } from "react";

import { cn } from "./ui/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";

export type SidebarView =
  | "dashboard"
  | "transaction-detail"
  | "clients"
  | "suppliers"
  | "employees"
  | "quickbooks";

interface SidebarProps {
  currentView: SidebarView;
  onViewChange: (view: SidebarView) => void;
  userRole?: string;
  className?: string;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  mobileTriggerRef?: RefObject<HTMLButtonElement | null>;
}

interface NavItem {
  name: string;
  icon: typeof ReceiptText;
  view: SidebarView;
}

const navItems: NavItem[] = [
  { name: "Transactions", icon: ReceiptText, view: "dashboard" },
  { name: "Clients", icon: Building2, view: "clients" },
  { name: "Suppliers", icon: Factory, view: "suppliers" },
];

const adminNavItems: NavItem[] = [
  { name: "Employees", icon: UserCog, view: "employees" },
  { name: "QuickBooks", icon: BookOpenCheck, view: "quickbooks" },
];

const navButtonClassName =
  "flex h-10 w-full items-center gap-3 rounded-md border text-sm font-medium outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 [transition-timing-function:var(--ease-out-ui)] active:scale-[0.98] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-[var(--color-ring-soft)] motion-reduce:transition-none motion-reduce:active:scale-100";

function SidebarItems({
  items,
  currentView,
  onViewChange,
  mobile = false,
}: {
  items: NavItem[];
  currentView: SidebarView;
  onViewChange: (view: SidebarView) => void;
  mobile?: boolean;
}) {
  return (
    <ul className="space-y-1" role="list">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          currentView === item.view ||
          (item.view === "dashboard" && currentView === "transaction-detail");

        return (
          <li key={item.name}>
            <button
              type="button"
              aria-current={isActive ? "page" : undefined}
              aria-label={item.name}
              title={item.name}
              onClick={() => onViewChange(item.view)}
              className={cn(
                navButtonClassName,
                mobile ? "justify-start px-3" : "justify-center px-2 sm:justify-start sm:px-3",
                isActive
                  ? "border-[var(--color-accent-border)] bg-accent text-accent-foreground shadow-[var(--shadow-control)] [&_svg]:text-primary"
                  : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className={cn("min-w-0 truncate", mobile ? "inline" : "hidden sm:inline")}>{item.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar({
  currentView,
  onViewChange,
  userRole,
  className,
  mobileOpen = false,
  onMobileOpenChange,
  mobileTriggerRef,
}: SidebarProps) {
  const isAdmin = userRole?.toLowerCase() === "admin";

  const navigation = (mobile: boolean) => (
    <nav aria-label="Primary" className="flex min-h-full flex-col px-3 py-4">
      <SidebarItems
        items={navItems}
        currentView={currentView}
        onViewChange={onViewChange}
        mobile={mobile}
      />

      {isAdmin && (
        <section aria-labelledby={mobile ? "mobile-admin-navigation" : "admin-navigation"} className="mt-5 border-t pt-4">
          <h2
            id={mobile ? "mobile-admin-navigation" : "admin-navigation"}
            className="mb-2 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
          >
            Administration
          </h2>
          <SidebarItems
            items={adminNavItems}
            currentView={currentView}
            onViewChange={onViewChange}
            mobile={mobile}
          />
        </section>
      )}
    </nav>
  );

  return (
    <>
      <aside
        aria-label="Application navigation"
        data-slot="app-sidebar"
        className={cn(
          "hidden h-full w-64 shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar lg:block",
          className,
        )}
      >
        {navigation(false)}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="w-[min(20rem,calc(100vw-2rem))] gap-0 border-sidebar-border bg-sidebar p-0 lg:hidden"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            mobileTriggerRef?.current?.focus();
          }}
        >
          <SheetHeader className="border-b border-sidebar-border px-5 py-5 pr-14">
            <SheetTitle>Operations workspace</SheetTitle>
            <SheetDescription>Navigate records and administration.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{navigation(true)}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
