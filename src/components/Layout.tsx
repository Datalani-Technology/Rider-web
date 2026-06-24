import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/riders', label: 'Riders', icon: '🏍️' },
  { to: '/customers', label: 'Customers', icon: '👤' },
  { to: '/orders', label: 'Orders', icon: '📦' },
  { to: '/wallet', label: 'Wallet Approvals', icon: '💳' },
  { to: '/packages', label: 'Credit Packages', icon: '🎫' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="px-4 py-5 border-b border-gray-800">
          <div className="text-red-500 font-bold text-xl tracking-wide">DASH</div>
          <div className="text-gray-400 text-xs mt-0.5">Admin Panel</div>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-red-500/20 text-red-400 font-medium'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={() => signOut(auth)}
            className="w-full text-left text-sm text-gray-500 hover:text-red-400 transition-colors px-3 py-2"
          >
            Sign out
          </button>
          <div className="text-xs text-gray-600 mt-2 px-3">Datalani Technology CC</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
