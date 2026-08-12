import { lazy, Suspense, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, LoaderCircle, Plus } from "lucide-react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { Header } from "./components/Header";
import { LegalPage } from "./components/LegalPage";
import { LoginPage } from "./components/LoginPage";
import { QuickBooksDisconnectedPage } from "./components/QuickBooksDisconnectedPage";
import { Sidebar, type SidebarView } from "./components/Sidebar";
import { Button } from "./components/ui/button";
import { Toaster } from "./components/ui/sonner";
import { useAuth } from "./lib/auth";

const KPICards = lazy(() =>
  import("./components/KPICards").then(({ KPICards }) => ({ default: KPICards })),
);
const ActiveClientsOverview = lazy(() =>
  import("./components/ActiveClientsOverview").then(({ ActiveClientsOverview }) => ({ default: ActiveClientsOverview })),
);
const TransactionsTable = lazy(() =>
  import("./components/TransactionsTable").then(({ TransactionsTable }) => ({ default: TransactionsTable })),
);
const TransactionDetail = lazy(() =>
  import("./components/TransactionDetail").then(({ TransactionDetail }) => ({ default: TransactionDetail })),
);
const CreateTransactionModal = lazy(() =>
  import("./components/CreateTransactionModal").then(({ CreateTransactionModal }) => ({ default: CreateTransactionModal })),
);
const ClientsPage = lazy(() =>
  import("./components/ClientsPage").then(({ ClientsPage }) => ({ default: ClientsPage })),
);
const SuppliersPage = lazy(() =>
  import("./components/SuppliersPage").then(({ SuppliersPage }) => ({ default: SuppliersPage })),
);
const SupplierDetailPage = lazy(() =>
  import("./components/SupplierDetailPage").then(({ SupplierDetailPage }) => ({ default: SupplierDetailPage })),
);
const EmployeesPage = lazy(() =>
  import("./components/EmployeesPage").then(({ EmployeesPage }) => ({ default: EmployeesPage })),
);
const ProfilePage = lazy(() =>
  import("./components/ProfilePage").then(({ ProfilePage }) => ({ default: ProfilePage })),
);
const QuickBooksSettingsPage = lazy(() =>
  import("./components/QuickBooksSettingsPage").then(({ QuickBooksSettingsPage }) => ({ default: QuickBooksSettingsPage })),
);

function PageLoading() {
  return (
    <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
      Loading workspace...
    </div>
  );
}

function SessionLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6" role="status">
      <div className="flex flex-col items-center gap-5 text-center">
        <img src="/idce_logo.avif" alt="IDC Energy" className="h-14 w-auto" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-primary" />
          Securing your workspace...
        </div>
      </div>
    </main>
  );
}

function AdminOnly({ isAdmin, children }: { isAdmin: boolean; children: ReactNode }) {
  return isAdmin ? children : <Navigate to="/" replace />;
}

function getTransactionReturnPath(value?: string): string {
  if (value === "/" || value === "/transactions" || /^\/suppliers\/\d+$/.test(value || "")) {
    return value;
  }
  return "/transactions";
}

function TransactionWorkspace({ mode, onCreate }: { mode: "recent" | "all"; onCreate: () => void }) {
  const isRegister = mode === "all";
  const [summaryRevision, setSummaryRevision] = useState(0);

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {isRegister && (
            <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
              <Link to="/">
                <ArrowLeft aria-hidden="true" />
                Dashboard
              </Link>
            </Button>
          )}
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {isRegister ? "Transaction register" : "Operations"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {isRegister ? "All transactions" : "Operations overview"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isRegister
              ? "Search the complete RFQ history, organized by year."
              : "Monitor current activity and the latest client RFQs."}
          </p>
        </div>
        <Button type="button" onClick={onCreate}>
          <Plus aria-hidden="true" />
          New transaction
        </Button>
      </div>

      {!isRegister ? (
        <>
          <KPICards refreshKey={summaryRevision} />
          <ActiveClientsOverview refreshKey={summaryRevision} />
        </>
      ) : null}
      <TransactionsTable
        mode={mode}
        onTransactionChanged={isRegister ? undefined : () => setSummaryRevision((revision) => revision + 1)}
      />
    </div>
  );
}

export default function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const mobileNavigationButtonRef = useRef<HTMLButtonElement>(null);
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const path = location.pathname;
  const isPublicLegalRoute = path === "/privacy-policy" || path === "/eula";

  if (isPublicLegalRoute) {
    return <LegalPage kind={path === "/privacy-policy" ? "privacy" : "eula"} />;
  }

  if (path === "/quickbooks/disconnected") {
    return <QuickBooksDisconnectedPage />;
  }

  if (isLoading) return <SessionLoading />;
  if (!isAuthenticated || !user) return <LoginPage />;

  if (user.must_change_password && path !== "/profile") {
    return <Navigate to="/profile" replace />;
  }

  const currentView: SidebarView = path.startsWith("/clients")
    ? "clients"
    : path.startsWith("/suppliers")
      ? "suppliers"
      : path.startsWith("/employees")
        ? "employees"
        : path.startsWith("/quickbooks")
          ? "quickbooks"
          : path.startsWith("/transactions/")
            ? "transaction-detail"
            : path === "/transactions"
              ? "transactions"
              : "dashboard";

  const transactionReturnState = location.state as {
    transactionReturnTo?: string;
    transactionBackLabel?: string;
  } | null;
  const requestedTransactionReturnTo = transactionReturnState?.transactionReturnTo;
  const transactionReturnTo = getTransactionReturnPath(requestedTransactionReturnTo);
  const transactionBackLabel = transactionReturnTo === "/"
    ? "Recent transactions"
    : transactionReturnTo === "/transactions"
      ? "All transactions"
      : transactionReturnState?.transactionBackLabel?.trim() || "Supplier record";

  const handleSidebarNavigate = (view: SidebarView) => {
    const destinations: Partial<Record<SidebarView, string>> = {
      dashboard: "/",
      transactions: "/transactions",
      clients: "/clients",
      suppliers: "/suppliers",
      employees: "/employees",
      quickbooks: "/quickbooks",
    };
    setIsMobileNavigationOpen(false);
    navigate(destinations[view] || "/");
  };

  if (user.must_change_password) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <Header />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Suspense fallback={<PageLoading />}>
            <ProfilePage />
          </Suspense>
        </main>
        <Toaster />
      </div>
    );
  }

  const isAdmin = user.role === "admin";

  return (
    <div className="flex h-dvh min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <Header
        navigationButtonRef={mobileNavigationButtonRef}
        onOpenNavigation={() => setIsMobileNavigationOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          currentView={currentView}
          onViewChange={handleSidebarNavigate}
          userRole={user.role}
          mobileOpen={isMobileNavigationOpen}
          onMobileOpenChange={setIsMobileNavigationOpen}
          mobileTriggerRef={mobileNavigationButtonRef}
        />

        <main className="min-w-0 flex-1 overflow-y-auto bg-background">
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<TransactionWorkspace mode="recent" onCreate={() => setIsModalOpen(true)} />} />
              <Route path="/transactions" element={<TransactionWorkspace mode="all" onCreate={() => setIsModalOpen(true)} />} />
              <Route
                path="/transactions/:id"
                element={(
                  <div className="p-4 sm:p-6 lg:p-8">
                    <TransactionDetail
                      onBack={() => navigate(transactionReturnTo)}
                      backLabel={transactionBackLabel}
                    />
                  </div>
                )}
              />
              <Route path="/clients" element={<div className="p-4 sm:p-6 lg:p-8"><ClientsPage /></div>} />
              <Route path="/suppliers" element={<div className="p-4 sm:p-6 lg:p-8"><SuppliersPage /></div>} />
              <Route path="/suppliers/:id" element={<div className="p-4 sm:p-6 lg:p-8"><SupplierDetailPage /></div>} />
              <Route path="/employees" element={<AdminOnly isAdmin={isAdmin}><div className="p-4 sm:p-6 lg:p-8"><EmployeesPage /></div></AdminOnly>} />
              <Route path="/quickbooks" element={<AdminOnly isAdmin={isAdmin}><div className="p-4 sm:p-6 lg:p-8"><QuickBooksSettingsPage userRole={user.role} /></div></AdminOnly>} />
              <Route path="/profile" element={<div className="p-4 sm:p-6 lg:p-8"><ProfilePage /></div>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      {isModalOpen && (
        <Suspense fallback={null}>
          <CreateTransactionModal
            isOpen
            onClose={() => setIsModalOpen(false)}
            onSubmit={({ createdId }) => {
              setIsModalOpen(false);
              const returnTo = path === "/transactions" ? "/transactions" : "/";
              navigate(`/transactions/${createdId}`, {
                state: { transactionReturnTo: returnTo },
              });
            }}
          />
        </Suspense>
      )}

      <Toaster />
    </div>
  );
}
