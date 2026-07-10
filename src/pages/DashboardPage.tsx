import { useEffect, useState } from 'react';
import {
  collection, query, where, orderBy, limit,
  onSnapshot, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { format, subDays, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import type { Order, Rider } from '../types';

function KPI({ label, value, sub, color = '#fff', iconPath }: {
  label: string; value: string | number; sub?: string; color?: string; iconPath: string;
}) {
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

const STATUS_COLORS: Record<string, string> = {
  pending: '#F39C12', accepted: '#2980B9', picked_up: '#8E44AD',
  in_transit: '#FF3B00', delivered: '#27AE60', cancelled: '#636380', failed: '#E74C3C',
};

export default function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [customerCount, setCustomerCount] = useState(0);

  useEffect(() => {
    const u1 = onSnapshot(
      query(collection(db, 'orders'), orderBy('timeline.createdAt', 'desc'), limit(500)),
      s => setOrders(s.docs.map(d => ({ id: d.id, ...d.data() }) as Order))
    );
    const u2 = onSnapshot(collection(db, 'riders'), s =>
      setRiders(s.docs.map(d => ({ id: d.id, ...d.data() }) as Rider))
    );
    const u3 = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'customer')),
      s => setCustomerCount(s.size)
    );
    return () => { u1(); u2(); u3(); };
  }, []);

  const toDate = (v: unknown): Date | null => {
    if (!v) return null;
    if ((v as Timestamp)?.toDate) return (v as Timestamp).toDate();
    if (v instanceof Date) return v;
    return null;
  };

  const todayStart = startOfDay(new Date());
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const monthStart = startOfMonth(new Date());

  const byDate = (orders: Order[], from: Date) =>
    orders.filter(o => { const d = toDate(o.timeline.createdAt); return d && d >= from; });

  // Platform takes 15% commission on every completed (delivered) delivery only.
  // Cancelled, pending, and in-progress orders are excluded.
  const COMMISSION_RATE = 0.15;
  const revenue = (orders: Order[]) =>
    orders
      .filter(o => o.status === 'delivered')
      .reduce((s, o) => s + (o.price?.total ?? 0) * COMMISSION_RATE, 0);

  const todayOrders = byDate(orders, todayStart);
  const weekOrders = byDate(orders, weekStart);
  const monthOrders = byDate(orders, monthStart);

  const approvedRiders = riders.filter(r => r.approvalStatus === 'approved');
  const onlineRiders = riders.filter(r => r.isOnline);
  const pendingRiders = riders.filter(r => r.approvalStatus === 'pending');
  const liveOrders = orders.filter(o => ['pending', 'accepted', 'picked_up', 'in_transit'].includes(o.status));

  // 14-day trend
  const chartData = Array.from({ length: 14 }, (_, i) => {
    const day = subDays(new Date(), 13 - i);
    const start = startOfDay(day);
    const end = new Date(start.getTime() + 86_400_000);
    const dayO = orders.filter(o => { const d = toDate(o.timeline.createdAt); return d && d >= start && d < end; });
    return {
      date: format(day, 'MMM d'),
      orders: dayO.length,
      revenue: +revenue(dayO).toFixed(2),
      delivered: dayO.filter(o => o.status === 'delivered').length,
    };
  });

  // Status breakdown
  const statusBreakdown = Object.entries(
    orders.slice(0, 200).reduce((acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1]);

  // Top riders by deliveries
  const topRiders = [...riders]
    .filter(r => r.approvalStatus === 'approved')
    .sort((a, b) => (b.totalDeliveries ?? 0) - (a.totalDeliveries ?? 0))
    .slice(0, 5);

  // Recent orders
  const recentOrders = orders.slice(0, 8);

  const fmt = (n: number) => `N$${n.toFixed(2)}`;

  return (
    <div className="p-6 space-y-6 max-w-none">

      {/* KPI Row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KPI iconPath="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" label="Orders Today" value={todayOrders.length} sub={`${liveOrders.length} live right now`} />
        <KPI iconPath="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" label="Revenue Today" value={fmt(revenue(todayOrders))} sub={`${fmt(revenue(weekOrders))} this week`} color="#27AE60" />
        <KPI iconPath="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" label="Drivers Online" value={`${onlineRiders.length} / ${approvedRiders.length}`} sub={pendingRiders.length > 0 ? `${pendingRiders.length} pending approval` : 'All approved drivers'} color="#2980B9" />
        <KPI iconPath="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" label="Total Customers" value={customerCount} sub={`${monthOrders.length} orders this month`} color="#8E44AD" />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#111] border border-gray-800/60 rounded-xl p-4 text-center">
          <div className="text-gray-400 text-xs uppercase tracking-wider">Total Orders</div>
          <div className="text-3xl font-bold text-white mt-1">{orders.length}</div>
        </div>
        <div className="bg-[#111] border border-gray-800/60 rounded-xl p-4 text-center">
          <div className="text-gray-400 text-xs uppercase tracking-wider">Delivered</div>
          <div className="text-3xl font-bold text-green-400 mt-1">
            {orders.filter(o => o.status === 'delivered').length}
          </div>
        </div>
        <div className="bg-[#111] border border-gray-800/60 rounded-xl p-4 text-center">
          <div className="text-gray-400 text-xs uppercase tracking-wider">Cancelled</div>
          <div className="text-3xl font-bold text-gray-400 mt-1">
            {orders.filter(o => o.status === 'cancelled').length}
          </div>
        </div>
        <div className="bg-[#111] border border-gray-800/60 rounded-xl p-4 text-center">
          <div className="text-gray-400 text-xs uppercase tracking-wider">Month Revenue</div>
          <div className="text-2xl font-bold text-green-400 mt-1">{fmt(revenue(monthOrders))}</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-[#111] border border-gray-800/60 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-1">Orders — Last 14 Days</h2>
          <p className="text-gray-500 text-xs mb-4">Daily order volume trend</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#111', border: '1px solid #374151', color: '#fff', borderRadius: 8 }} />
              <Line type="monotone" dataKey="orders" stroke="#FF3B00" strokeWidth={2} dot={false} name="Orders" />
              <Line type="monotone" dataKey="delivered" stroke="#27AE60" strokeWidth={1.5} dot={false} name="Delivered" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#111] border border-gray-800/60 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-1">Revenue (N$) — Last 14 Days</h2>
          <p className="text-gray-500 text-xs mb-4">Platform commission (15%) from completed deliveries only</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#111', border: '1px solid #374151', color: '#fff', borderRadius: 8 }}
                formatter={(v) => [`N$${Number(v ?? 0).toFixed(2)}`, 'Revenue']}
              />
              <Bar dataKey="revenue" fill="#27AE60" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Status breakdown + Top riders + Recent orders */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Status breakdown */}
        <div className="bg-[#111] border border-gray-800/60 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Order Status Breakdown</h2>
          <div className="space-y-3">
            {statusBreakdown.map(([status, count]) => {
              const pct = orders.length > 0 ? Math.round((count / Math.min(orders.length, 200)) * 100) : 0;
              return (
                <div key={status}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-300 capitalize">{status.replace('_', ' ')}</span>
                    <span className="text-gray-400">{count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[status] ?? '#6b7280' }}
                    />
                  </div>
                </div>
              );
            })}
            {statusBreakdown.length === 0 && <p className="text-gray-600 text-sm text-center py-4">No orders yet</p>}
          </div>
        </div>

        {/* Top riders */}
        <div className="bg-[#111] border border-gray-800/60 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Top Drivers by Deliveries</h2>
          <div className="space-y-3">
            {topRiders.map((r, i) => (
              <div key={r.id} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400">
                  {i + 1}
                </div>
                <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-xs font-bold text-red-400 flex-shrink-0">
                  {(r.name?.[0] ?? '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">{r.name ?? 'Unknown'}</div>
                  <div className="text-gray-500 text-xs">{r.preferredVehicle === 'car' ? 'Sedan' : (r.preferredVehicle ?? '—')} · ⭐ {r.rating?.toFixed(1) ?? '—'}</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-bold text-sm">{r.totalDeliveries ?? 0}</div>
                  <div className="text-gray-500 text-xs">rides</div>
                </div>
              </div>
            ))}
            {topRiders.length === 0 && <p className="text-gray-600 text-sm text-center py-4">No approved riders yet</p>}
          </div>
        </div>

        {/* Recent orders */}
        <div className="bg-[#111] border border-gray-800/60 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Recent Orders</h2>
          <div className="space-y-2.5">
            {recentOrders.map(o => {
              const d = toDate(o.timeline.createdAt);
              return (
                <div key={o.id} className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[o.status] ?? '#6b7280' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs font-mono truncate">{o.trackingCode}</div>
                    <div className="text-gray-500 text-xs truncate">{o.deliveryAddress?.formattedAddress ?? '—'}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-white text-xs font-medium">N${o.price?.total?.toFixed(0) ?? 0}</div>
                    <div className="text-gray-600 text-xs">{d ? format(d, 'HH:mm') : '—'}</div>
                  </div>
                </div>
              );
            })}
            {recentOrders.length === 0 && <p className="text-gray-600 text-sm text-center py-4">No orders yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
