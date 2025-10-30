import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { KPICards } from "./components/KPICards";
import { TransactionsTable } from "./components/TransactionsTable";
import { TransactionDetail } from "./components/TransactionDetail";
import { CreateTransactionModal } from "./components/CreateTransactionModal";
import { ClientsPage } from "./components/ClientsPage";
import { SuppliersPage } from "./components/SuppliersPage";
import { EmployeesPage } from "./components/EmployeesPage";
import { ProfilePage } from "./components/ProfilePage";
import { Button } from "./components/ui/button";
import { Toaster } from "./components/ui/sonner";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { LoginPage } from "./components/LoginPage";

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5001';

export default function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null;
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      fetchUserRole();
    }
  }, [token]);

  const fetchUserRole = async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setUserRole(data.user.role);
      }
    } catch (error) {
      console.error('Failed to fetch user role:', error);
    }
  };

  const path = location.pathname;
  const search = new URLSearchParams(location.search);
  const dashboardMode = search.get('view') === 'transactions-all' ? 'all' : 'recent';
  const currentView = path.startsWith('/clients')
    ? 'clients'
    : path.startsWith('/suppliers')
    ? 'suppliers'
    : path.startsWith('/employees')
    ? 'employees'
    : path.startsWith('/transactions/')
    ? 'transaction-detail'
    : 'dashboard';

  const handleSidebarNavigate = (view: "dashboard" | "transaction-detail" | "clients" | "suppliers" | "employees") => {
    switch (view) {
      case 'dashboard':
        navigate('/');
        break;
      case 'clients':
        navigate('/clients');
        break;
      case 'suppliers':
        navigate('/suppliers');
        break;
      case 'employees':
        navigate('/employees');
        break;
      default:
        navigate('/');
    }
  };

  const Dashboard = () => (
    <div className="p-8 space-y-8">
      <KPICards mode={dashboardMode as any} />

      <div className="flex justify-end mb-6">
        <Button
          onClick={() => setIsModalOpen(true)}
          className="text-white transition-all duration-200 border shadow-lg bg-teal-600/90 hover:bg-teal-700 backdrop-blur-sm border-teal-500/30 hover:shadow-xl hover:scale-105"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Transaction
        </Button>
      </div>

      <TransactionsTable mode={dashboardMode as any} />
    </div>
  );

  if (!token) {
    return <LoginPage onSuccess={() => window.location.reload()} />;
  }

  return (
    <div className="relative flex flex-col h-screen overflow-hidden font-sans">
      <div className="fixed inset-0 z-0">
        <div className="absolute top-0 bg-gray-200 rounded-full -left-4 w-72 h-72 mix-blend-multiply filter blur-xl opacity-40 animate-blob"></div>
        <div className="absolute top-0 bg-gray-300 rounded-full -right-4 w-72 h-72 mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute bg-gray-400 rounded-full -bottom-8 left-20 w-72 h-72 mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative z-10 flex flex-col h-full">
        <Header />

        <div className="flex flex-1 overflow-hidden">
          <Sidebar currentView={currentView as any} onViewChange={handleSidebarNavigate as any} userRole={userRole} />

          <main className="flex-1 overflow-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/transactions/:id" element={<div className="p-8"><TransactionDetail onBack={() => navigate('/')} /></div>} />
              <Route path="/clients" element={<div className="p-8"><ClientsPage /></div>} />
              <Route path="/suppliers" element={<div className="p-8"><SuppliersPage /></div>} />
              <Route path="/employees" element={<div className="p-8"><EmployeesPage /></div>} />
              <Route path="/profile" element={<div className="p-8"><ProfilePage /></div>} />
            </Routes>
          </main>
        </div>
      </div>

      <CreateTransactionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={({ createdId }) => {
          setIsModalOpen(false);
          navigate(`/transactions/${createdId}`);
        }}
      />

      <Toaster />
    </div>
  );
}