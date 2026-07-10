import { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import {
  format, subDays, subMonths, subYears,
  startOfDay, startOfMonth,
  eachMonthOfInterval, eachDayOfInterval,
} from 'date-fns';
import type { Order } from '../types';

interface UserRecord { id: string; role: string; name?: string; email?: string; createdAt: unknown; }
interface RiderRecord { id: string; name?: string; email?: string; totalDeliveries?: number; walletBalance?: number; approvalStatus?: string; }
interface AuditRecord { id: string; action: string; adminEmail: string; details: Record<string, unknown>; timestamp: unknown; }
type Period = '30d' | '6m' | '1y' | 'all';

const COMMISSION = 0.15;
const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  if ((v as Timestamp)?.toDate) return (v as Timestamp).toDate();
  if (v instanceof Date) return v;
  return null;
};
const fmt$ = (n: number) => `N$${n.toFixed(2)}`;
const PERIOD_LABELS: Record<Period, string> = { '30d': 'Last 30 days', '6m': 'Last 6 months', '1y': 'Last year', 'all': 'All time' };
const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  APPROVE_DRIVER:  { label: 'Driver Approved',  color: '#27AE60' },
  REJECT_DRIVER:   { label: 'Driver Rejected',   color: '#E74C3C' },
  SUSPEND_DRIVER:  { label: 'Driver Suspended',  color: '#E74C3C' },
  ACTIVATE_DRIVER: { label: 'Driver Activated',  color: '#27AE60' },
  GIVE_CREDITS:    { label: 'Credits Given',     color: '#F39C12' },
  APPROVE_TOPUP:   { label: 'Top-up Approved',   color: '#27AE60' },
  REJECT_TOPUP:    { label: 'Top-up Rejected',   color: '#E74C3C' },
  CREATE_STAFF:    { label: 'Staff Created',     color: '#2980B9' },
  SUSPEND_STAFF:   { label: 'Staff Suspended',   color: '#E74C3C' },
  ACTIVATE_STAFF:  { label: 'Staff Activated',   color: '#27AE60' },
  UPDATE_SETTINGS: { label: 'Settings Updated',  color: '#8E44AD' },
};

function StatCard({ label, value, sub, color = '#fff', iconPath }: { label: string; value: string | number; sub?: string; color?: string; iconPath: string; }) {
  return (
    <div className="bg-[#111] border border-gray-800/60 rounded-xl p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={iconPath} />
        </svg>
      </div>
      <div className="min-w-0">
        <div className="text-gray-400 text-xs uppercase tracking-wider font-medium">{label}</div>
        <div className="text-2xl font-bold mt-0.5 truncate" style={{ color }}>{value}</div>
        {sub && <div className="text-gray-500 text-xs mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [riders, setRiders] = useState<RiderRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);
  const [period, setPeriod] = useState<Period>('6m');
  const [activeTab, setActiveTab] = useState<'growth' | 'revenue' | 'drivers' | 'audit'>('growth');

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'orders'), s => setOrders(s.docs.map(d => ({ id: d.id, ...d.data() }) as Order)));
    const u2 = onSnapshot(collection(db, 'users'), s => setUsers(s.docs.map(d => ({ id: d.id, ...d.data() }) as UserRecord)));
    const u3 = onSnapshot(collection(db, 'riders'), s => setRiders(s.docs.map(d => ({ id: d.id, ...d.data() }) as RiderRecord)));
    const u4 = onSnapshot(query(collection(db, 'adminActions'), orderBy('timestamp', 'desc')), s =>
      setAuditLogs(s.docs.map(d => ({ id: d.id, ...d.data() }) as AuditRecord))
    );
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  const cutoff = useMemo((): Date | null => {
    const now = new Date();
    if (period === '30d') return subDays(now, 30);
    if (period === '6m') return subMonths(now, 6);
    if (period === '1y') return subYears(now, 1);
    return null;
  }, [period]);

  const inPeriod = (ts: unknown) => { if (!cutoff) return true; const d = toDate(ts); return d ? d >= cutoff : false; };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const periodOrders = useMemo(() => orders.filter(o => inPeriod(o.timeline?.createdAt)), [orders, cutoff]);
  const deliveredOrders = useMemo(() => periodOrders.filter(o => o.status === 'delivered'), [periodOrders]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const periodUsers = useMemo(() => users.filter(u => inPeriod(u.createdAt)), [users, cutoff]);
  const periodCustomers = useMemo(() => periodUsers.filter(u => u.role === 'customer'), [periodUsers]);
  const periodDrivers = useMemo(() => periodUsers.filter(u => u.role === 'rider'), [periodUsers]);
  const totalRevenue = useMemo(() => deliveredOrders.reduce((s, o) => s + (o.price?.total ?? 0) * COMMISSION, 0), [deliveredOrders]);
  const avgOrderValue = deliveredOrders.length > 0 ? deliveredOrders.reduce((s, o) => s + (o.price?.total ?? 0), 0) / deliveredOrders.length : 0;

  const allCustomers = users.filter(u => u.role === 'customer').length;
  const allDrivers = riders.filter(r => r.approvalStatus === 'approved').length;
  const allDelivered = orders.filter(o => o.status === 'delivered').length;
  const allRevenue = orders.filter(o => o.status === 'delivered').reduce((s, o) => s + (o.price?.total ?? 0) * COMMISSION, 0);

  const growthChartData = useMemo(() => {
    const now = new Date();
    const useMonths = period === '6m' || period === '1y';
    if (useMonths) {
      const months = eachMonthOfInterval({ start: period === '6m' ? subMonths(now, 5) : subMonths(now, 11), end: now });
      return months.map(month => {
        const start = startOfMonth(month);
        const end = new Date(start); end.setMonth(end.getMonth() + 1);
        return {
          date: format(month, 'MMM yy'),
          customers: users.filter(u => u.role === 'customer' && (() => { const d = toDate(u.createdAt); return d && d >= start && d < end; })()).length,
          drivers: users.filter(u => u.role === 'rider' && (() => { const d = toDate(u.createdAt); return d && d >= start && d < end; })()).length,
        };
      });
    }
    const days = eachDayOfInterval({ start: startOfDay(subDays(now, 29)), end: startOfDay(now) });
    return days.map(day => {
      const end = new Date(day.getTime() + 86_400_000);
      return {
        date: format(day, 'dd MMM'),
        customers: users.filter(u => u.role === 'customer' && (() => { const d = toDate(u.createdAt); return d && d >= day && d < end; })()).length,
        drivers: users.filter(u => u.role === 'rider' && (() => { const d = toDate(u.createdAt); return d && d >= day && d < end; })()).length,
      };
    });
  }, [users, period]);

  const revenueChartData = useMemo(() => {
    const now = new Date();
    const useMonths = period === '6m' || period === '1y' || period === 'all';
    if (useMonths) {
      const months = eachMonthOfInterval({ start: period === '6m' ? subMonths(now, 5) : period === '1y' ? subMonths(now, 11) : subMonths(now, 23), end: now });
      return months.map(month => {
        const start = startOfMonth(month); const end = new Date(start); end.setMonth(end.getMonth() + 1);
        const mo = orders.filter(o => o.status === 'delivered' && (() => { const d = toDate(o.timeline?.createdAt); return d && d >= start && d < end; })());
        return { date: format(month, 'MMM yy'), revenue: +(mo.reduce((s, o) => s + (o.price?.total ?? 0) * COMMISSION, 0)).toFixed(2), orders: mo.length };
      });
    }
    const days = eachDayOfInterval({ start: startOfDay(subDays(now, 29)), end: startOfDay(now) });
    return days.map(day => {
      const end = new Date(day.getTime() + 86_400_000);
      const mo = orders.filter(o => o.status === 'delivered' && (() => { const d = toDate(o.timeline?.createdAt); return d && d >= day && d < end; })());
      return { date: format(day, 'dd MMM'), revenue: +(mo.reduce((s, o) => s + (o.price?.total ?? 0) * COMMISSION, 0)).toFixed(2), orders: mo.length };
    });
  }, [orders, period]);

  const topDrivers = useMemo(() => {
    const map: Record<string, { name: string; deliveries: number; revenue: number }> = {};
    deliveredOrders.forEach(o => {
      if (!o.riderId) return;
      if (!map[o.riderId]) { const r = riders.find(r => r.id === o.riderId); map[o.riderId] = { name: r?.name ?? o.riderId.slice(0, 8), deliveries: 0, revenue: 0 }; }
      map[o.riderId].deliveries += 1;
      map[o.riderId].revenue += (o.price?.total ?? 0) * (1 - COMMISSION);
    });
    return Object.entries(map).map(([id, d]) => ({ id, ...d })).sort((a, b) => b.deliveries - a.deliveries).slice(0, 10);
  }, [deliveredOrders, riders]);

  const RANKS = ['🥇', '🥈', '🥉'];

  return (
    <div className="p-6 space-y-6" style={{ background: '#09090c', minHeight: '100%' }}>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">History & Analytics</h1>
          <p className="text-gray-500 text-sm mt-1">Platform growth, revenue, driver performance and admin activity log.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${period === p ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard iconPath="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          label="Total Customers" value={allCustomers} sub={`+${periodCustomers.length} in ${PERIOD_LABELS[period].toLowerCase()}`} />
        <StatCard iconPath="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          label="Approved Drivers" value={allDrivers} sub={`+${periodDrivers.length} joined in period`} color="#2980B9" />
        <StatCard iconPath="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          label="Total Deliveries" value={allDelivered} sub={`${deliveredOrders.length} in period · ${Math.round(periodOrders.length > 0 ? (deliveredOrders.length / periodOrders.length) * 100 : 0)}% completion rate`} color="#27AE60" />
        <StatCard iconPath="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          label="Total Platform Revenue" value={fmt$(allRevenue)} sub={`${fmt$(totalRevenue)} in period (15% commission)`} color="#27AE60" />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Avg Order Value', value: fmt$(avgOrderValue) },
          { label: 'Completion Rate', value: periodOrders.length > 0 ? `${Math.round((deliveredOrders.length / periodOrders.length) * 100)}%` : '—', color: '#27AE60' },
          { label: 'Pending Driver Apps', value: riders.filter(r => r.approvalStatus === 'pending').length, color: '#F39C12' },
          { label: 'Audit Events Logged', value: auditLogs.length, color: '#8E44AD' },
        ].map(s => (
          <div key={s.label} className="bg-[#111] border border-gray-800/60 rounded-xl p-4 text-center">
            <div className="text-gray-400 text-xs uppercase tracking-wider">{s.label}</div>
            <div className="text-3xl font-bold mt-1" style={{ color: s.color ?? '#fff' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 flex gap-0">
        {(['growth', 'revenue', 'drivers', 'audit'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors capitalize ${activeTab === t ? 'text-red-400 border-red-500' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>
            {t === 'growth' ? 'User Growth' : t === 'revenue' ? 'Revenue' : t === 'drivers' ? 'Driver Performance' : 'Audit Log'}
          </button>
        ))}
      </div>

      {/* ── USER GROWTH ── */}
      {activeTab === 'growth' && (
        <div className="space-y-6">
          <div className="bg-[#111] border border-gray-800/60 rounded-xl p-5">
            <h2 className="text-white font-semibold mb-1">New Registrations — {PERIOD_LABELS[period]}</h2>
            <p className="text-gray-500 text-xs mb-4">Customers and drivers who signed up in this period</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={growthChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #374151', color: '#fff', borderRadius: 8 }} />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                <Bar dataKey="customers" fill="#2980B9" radius={[3, 3, 0, 0]} name="Customers" />
                <Bar dataKey="drivers" fill="#FF3B00" radius={[3, 3, 0, 0]} name="Drivers" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-[#111] border border-gray-800/60 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-800"><h3 className="text-white font-semibold text-sm">Recent Signups</h3></div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Signed Up</th>
                </tr>
              </thead>
              <tbody>
                {periodUsers.sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0)).slice(0, 25).map(u => (
                  <tr key={u.id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                    <td className="px-4 py-2.5 text-white text-xs font-medium">{u.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{u.email ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.role === 'customer' ? 'bg-blue-500/15 text-blue-400' : 'bg-orange-500/15 text-orange-400'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{toDate(u.createdAt) ? format(toDate(u.createdAt)!, 'dd MMM yyyy, HH:mm') : '—'}</td>
                  </tr>
                ))}
                {periodUsers.length === 0 && <tr><td colSpan={4} className="text-center text-gray-600 py-8 text-sm">No signups in this period</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── REVENUE ── */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-[#111] border border-gray-800/60 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-1">Platform Revenue (15% commission)</h2>
              <p className="text-gray-500 text-xs mb-4">Completed deliveries only — {PERIOD_LABELS[period]}</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#111', border: '1px solid #374151', color: '#fff', borderRadius: 8 }}
                    formatter={(v) => [`N$${Number(v).toFixed(2)}`, 'Revenue']} />
                  <Line type="monotone" dataKey="revenue" stroke="#27AE60" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-[#111] border border-gray-800/60 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-1">Delivery Volume</h2>
              <p className="text-gray-500 text-xs mb-4">Completed deliveries per period</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#111', border: '1px solid #374151', color: '#fff', borderRadius: 8 }} />
                  <Bar dataKey="orders" fill="#FF3B00" radius={[3, 3, 0, 0]} name="Deliveries" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-[#111] border border-gray-800/60 rounded-xl p-5">
            <h2 className="text-white font-semibold mb-4 text-sm">Revenue by Vehicle Type</h2>
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
              {(['bike', 'car', 'bakkie', 'van', 'truck'] as const).map(v => {
                const vOrders = deliveredOrders.filter(o => o.vehicleType === v);
                const vRev = vOrders.reduce((s, o) => s + (o.price?.total ?? 0) * COMMISSION, 0);
                const labels: Record<string, string> = { bike: 'Bike', car: 'Sedan', bakkie: 'Bakkie', van: 'Van', truck: 'Truck' };
                return (
                  <div key={v} className="bg-gray-900/50 rounded-lg p-3 text-center border border-gray-800">
                    <div className="text-gray-400 text-xs mb-1">{labels[v]}</div>
                    <div className="text-white font-bold text-sm">{fmt$(vRev)}</div>
                    <div className="text-gray-600 text-xs">{vOrders.length} deliveries</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── DRIVER PERFORMANCE ── */}
      {activeTab === 'drivers' && (
        <div className="space-y-6">
          <div className="bg-[#111] border border-gray-800/60 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-gray-800">
              <h2 className="text-white font-semibold">Top Drivers by Deliveries</h2>
              <p className="text-gray-500 text-xs mt-0.5">{PERIOD_LABELS[period]} · Driver earnings shown at 85% of order total</p>
            </div>
            {topDrivers.length === 0
              ? <div className="text-center text-gray-600 py-12 text-sm">No completed deliveries in this period</div>
              : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                      <th className="px-5 py-3 text-left w-10">#</th>
                      <th className="px-5 py-3 text-left">Driver</th>
                      <th className="px-5 py-3 text-right">Deliveries</th>
                      <th className="px-5 py-3 text-right">Driver Earnings (85%)</th>
                      <th className="px-5 py-3 text-right">Avg / Delivery</th>
                      <th className="px-5 py-3" style={{ minWidth: 120 }}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDrivers.map((d, i) => {
                      const pct = Math.round((d.deliveries / (topDrivers[0]?.deliveries ?? 1)) * 100);
                      return (
                        <tr key={d.id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                          <td className="px-5 py-3 text-sm">{RANKS[i] ?? `#${i + 1}`}</td>
                          <td className="px-5 py-3">
                            <div className="text-white text-xs font-semibold">{d.name}</div>
                            <div className="text-gray-600 text-xs font-mono">{d.id.slice(0, 8)}…</div>
                          </td>
                          <td className="px-5 py-3 text-right text-white font-bold">{d.deliveries}</td>
                          <td className="px-5 py-3 text-right text-green-400 font-bold">{fmt$(d.revenue)}</td>
                          <td className="px-5 py-3 text-right text-gray-400 text-xs">{fmt$(d.deliveries > 0 ? d.revenue / d.deliveries : 0)}</td>
                          <td className="px-5 py-3">
                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-red-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
          </div>

          <div className="bg-[#111] border border-gray-800/60 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-800"><h3 className="text-white font-semibold text-sm">All Approved Drivers — Wallet Status</h3></div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Driver</th>
                  <th className="px-4 py-3 text-right">Total Deliveries</th>
                  <th className="px-4 py-3 text-right">Credits Left</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {riders.filter(r => r.approvalStatus === 'approved').sort((a, b) => (b.totalDeliveries ?? 0) - (a.totalDeliveries ?? 0)).map(r => (
                  <tr key={r.id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                    <td className="px-4 py-2.5"><div className="text-white text-xs font-medium">{r.name ?? '—'}</div></td>
                    <td className="px-4 py-2.5 text-right text-white text-xs font-bold">{r.totalDeliveries ?? 0}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`text-xs font-bold ${(r.walletBalance ?? 0) === 0 ? 'text-red-400' : (r.walletBalance ?? 0) < 5 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {r.walletBalance ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${(r.walletBalance ?? 0) === 0 ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'}`}>
                        {(r.walletBalance ?? 0) === 0 ? 'No credits' : 'Active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── AUDIT LOG ── */}
      {activeTab === 'audit' && (
        <div className="bg-[#111] border border-gray-800/60 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold">Admin Action Log</h2>
              <p className="text-gray-500 text-xs mt-0.5">Every admin action with operator, timestamp and context — immutable record</p>
            </div>
            <span className="text-xs text-gray-500 bg-gray-800 px-3 py-1 rounded-full">{auditLogs.length} total events</span>
          </div>
          {auditLogs.length === 0
            ? <div className="text-center text-gray-600 py-12 text-sm">No audit events yet. Actions will appear here as admins use the console.</div>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="px-5 py-3 text-left">Action</th>
                    <th className="px-5 py-3 text-left">Admin</th>
                    <th className="px-5 py-3 text-left">Details</th>
                    <th className="px-5 py-3 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.slice(0, 100).map(log => {
                    const cfg = ACTION_LABELS[log.action] ?? { label: log.action, color: '#9ca3af' };
                    const ts = toDate(log.timestamp);
                    return (
                      <tr key={log.id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                        <td className="px-5 py-3">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{ background: cfg.color + '22', color: cfg.color }}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-400 text-xs">{log.adminEmail}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs max-w-xs truncate">
                          {Object.entries(log.details ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-500 text-xs whitespace-nowrap">
                          {ts ? format(ts, 'dd MMM yyyy, HH:mm:ss') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </div>
      )}
    </div>
  );
}
