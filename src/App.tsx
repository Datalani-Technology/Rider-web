import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import RidersPage from './pages/RidersPage';
import CustomersPage from './pages/CustomersPage';
import OrdersPage from './pages/OrdersPage';
import WalletPage from './pages/WalletPage';
import PackagesPage from './pages/PackagesPage';
import SettingsPage from './pages/SettingsPage';
import TeamPage from './pages/TeamPage';
import HistoryPage from './pages/HistoryPage';

function InitialLoader() {
  const [dot, setDot] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDot(d => (d + 1) % 4), 400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="min-h-screen w-full bg-[#030303] flex flex-col items-center justify-center gap-5">
      <div className="flex items-center gap-3">
        <img src="/dash-logo.png" alt="DASH" className="h-10 w-auto object-contain" />
        <div className="h-6 w-px bg-gray-700" />
        <span className="text-gray-500 text-sm font-medium">Admin Console</span>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-red-500 transition-all duration-300"
            style={{ opacity: dot > i ? 1 : 0.25 }}
          />
        ))}
      </div>
      <p className="text-gray-600 text-xs">Loading your workspace…</p>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForgot, setShowForgot] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, 'users', u.uid));
        const role = snap.exists() ? snap.data().role : null;
        // Allow admin, reviewer, and support roles into the console
        setIsAdmin(!!role && ['admin', 'reviewer', 'support'].includes(role));
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <InitialLoader />;

  if (!user || !isAdmin) {
    return showForgot
      ? <ForgotPasswordPage onBack={() => setShowForgot(false)} />
      : <LoginPage onForgotPassword={() => setShowForgot(true)} />;
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/riders" element={<RidersPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/packages" element={<PackagesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
