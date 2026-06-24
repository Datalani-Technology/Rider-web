import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';
import type { Order } from '../types';

function StatCard({ label, value, sub, color = 'text-white' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="text-gray-400 text-sm">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-gray-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [riders, setRiders] = useState<number>(0);
  const [onlineRiders, setOnlineRiders] = useState<number>(0);
  const [users, setUsers] = useState<number>(0);

  useEffect(() => {
    // Recent 200 orders for stats
    const unsub = onSnapshot(
      query(collection(db, 'orders'), orderBy('timeline.createdAt', 'desc'), limit(200)),
      snap => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Order))
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'riders')),
      snap => {
        setRiders(snap.size);
        setOnlineRiders(snap.docs.filter(d => d.data().isOnline).length);
      }
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'customer')),
      snap => setUsers(snap.size)
    );
    return unsub;
  }, []);

  const todayStart = startOfDay(new Date());
  const todayOrders = orders.filter(o => {
    const d = (o.timeline.createdAt as unknown as Timestamp)?.toDate?.();
    return d && d >= todayStart;
  });

  const todayRevenue = todayOrders
    .filter(o => o.status === 'delivered')
    .reduce((s, o) => s + (o.price.total ?? 0), 0);

  const pending = orders.filter(o => o.status === 'pending').length;

  // Last 14 days chart data
  const chartData = Array.from({ length: 14 }, (_, i) => {
    const day = subDays(new Date(), 13 - i);
    const dayStart = startOfDay(day);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const dayOrders = orders.filter(o => {
      const d = (o.timeline.createdAt as unknown as Timestamp)?.toDate?.();
      return d && d >= dayStart && d < dayEnd;
    });
    return {
      date: format(day, 'MMM d'),
      orders: dayOrders.length,
      revenue: dayOrders.filter(o => o.status === 'delivered').reduce((s, o) => s + (o.price.total ?? 0), 0),
    };
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Live overview — Windhoek, Namibia</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Orders Today" value={todayOrders.length} sub={`${pending} pending`} />
        <StatCard label="Revenue Today" value={`N$${todayRevenue.toFixed(2)}`} color="text-green-400" />
        <StatCard label="Online Riders" value={`${onlineRiders} / ${riders}`} sub="approved riders" color="text-blue-400" />
        <StatCard label="Total Customers" value={users} color="text-purple-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h2 className="text-white font-semibold mb-4">Orders — Last 14 days</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', color: '#fff' }} />
              <Line type="monotone" dataKey="orders" stroke="#E94560" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h2 className="text-white font-semibold mb-4">Revenue (N$) — Last 14 days</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', color: '#fff' }} formatter={(v) => [`N$${Number(v).toFixed(2)}`, 'Revenue']} />
              <Bar dataKey="revenue" fill="#27AE60" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
