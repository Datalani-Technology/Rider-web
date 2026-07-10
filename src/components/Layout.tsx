import { type ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import ConfirmDialog from './ConfirmDialog';

// ─── Live badge counts ────────────────────────────────────────────────────────
function useBadgeCounts() {
  const [pendingRiders, setPendingRiders] = useState(0);
  const [pendingWallet, setPendingWallet] = useState(0);
  const [liveOrders, setLiveOrders] = useState(0);
  const [activeRiders, setActiveRiders] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);

  useEffect(() => {
    const u1 = onSnapshot(
      query(collection(db, 'riders'), where('approvalStatus', '==', 'pending')),
      s => setPendingRiders(s.size)
    );
    const u2 = onSnapshot(
      query(collection(db, 'wallet_transactions'), where('type', '==', 'topup'), where('status', '==', 'pending')),
      s => setPendingWallet(s.size)
    );
    const u3 = onSnapshot(
      query(collection(db, 'orders'), where('status', 'in', ['pending', 'accepted', 'picked_up', 'in_transit'])),
      s => setLiveOrders(s.size)
    );
    const u4 = onSnapshot(
      query(collection(db, 'riders'), where('isOnline', '==', true)),
      s => setActiveRiders(s.size)
    );
    const u5 = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'customer')),
      s => setTotalCustomers(s.size)
    );
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, []);

  return { pendingRiders, pendingWallet, liveOrders, activeRiders, totalCustomers };
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = {
  Dashboard: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  Riders: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  Customers: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Orders: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  Wallet: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  Packages: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  Settings: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Team: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  History: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
};

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/riders': 'Driver Applications',
  '/customers': 'Customers',
  '/orders': 'Orders',
  '/wallet': 'Driver Wallets',
  '/packages': 'Credit Packages',
  '/settings': 'Settings',
  '/team': 'Team Management',
  '/history': 'History & Analytics',
};

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { pendingRiders, pendingWallet, liveOrders, activeRiders, totalCustomers } = useBadgeCounts();
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'Admin';

  const nav = [
    { to: '/dashboard',  label: 'Dashboard',        Icon: Icon.Dashboard, badge: 0 },
    { to: '/riders',     label: 'Driver Review',     Icon: Icon.Riders,    badge: pendingRiders },
    { to: '/customers',  label: 'Customers',         Icon: Icon.Customers, badge: 0 },
    { to: '/orders',     label: 'Orders',            Icon: Icon.Orders,    badge: liveOrders },
    { to: '/wallet',     label: 'Driver Wallets',   Icon: Icon.Wallet,    badge: pendingWallet },
    { to: '/packages',   label: 'Credit Packages',   Icon: Icon.Packages,  badge: 0 },
    { to: '/history',    label: 'History',           Icon: Icon.History,   badge: 0 },
    { to: '/team',       label: 'Team',              Icon: Icon.Team,      badge: 0 },
    { to: '/settings',   label: 'Settings',          Icon: Icon.Settings,  badge: 0 },
  ];

  const now = new Date().toLocaleDateString('en-NA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const [showLogout, setShowLogout] = useState(false);

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-64 bg-[#0D0D0D] border-r border-gray-800/60 flex flex-col shrink-0">
        {/* Brand */}
        <div className="px-6 py-5 border-b border-gray-800/60">
          <div className="flex items-center gap-3">
            <img src="/dash-logo.png" alt="DASH" className="h-10 w-auto object-contain" />
            <div className="h-5 w-px bg-gray-700" />
            <div className="text-gray-500 text-xs font-medium">Admin Console</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, label, Icon: NavIcon, badge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-white border border-transparent'
                }`
              }
            >
              <div className="flex items-center gap-3">
                <NavIcon />
                <span className="font-medium">{label}</span>
              </div>
              {badge > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800/60 space-y-3">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-900/50">
            <div className="w-7 h-7 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-xs font-bold text-red-400">A</div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-white truncate">Admin</div>
              <div className="text-xs text-gray-500 truncate">DASH Admin</div>
            </div>
          </div>
          <button
            onClick={() => setShowLogout(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-[#0D0D0D] border-b border-gray-800/60 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-white font-semibold text-base">{pageTitle}</h1>
            {liveOrders > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                {liveOrders} live {liveOrders === 1 ? 'order' : 'orders'}
              </span>
            )}
            {activeRiders > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                {activeRiders} driver{activeRiders !== 1 ? 's' : ''} online
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              {totalCustomers} customer{totalCustomers !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-500 text-xs">{now}</span>
            {(pendingRiders + pendingWallet) > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-yellow-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {pendingRiders + pendingWallet} pending
              </div>
            )}
            <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center text-xs font-bold text-white">A</div>
          </div>
        </header>

        {/* Page content — full height, scrollable */}
        <main className="flex-1 overflow-y-auto bg-gray-950">
          {children}
        </main>
      </div>

      {/* Logout confirmation */}
      <ConfirmDialog
        open={showLogout}
        title="Sign Out"
        message="You will be signed out of the DASH Admin Console. Any unsaved changes will be lost."
        confirmLabel="Sign Out"
        cancelLabel="Stay"
        variant="warning"
        onConfirm={() => { setShowLogout(false); signOut(auth); }}
        onCancel={() => setShowLogout(false)}
      />
    </div>
  );
}
