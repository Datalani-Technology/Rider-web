import { useEffect, useState } from 'react';
import {
  collection, query, orderBy, limit, onSnapshot, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Order } from '../types';
import { format } from 'date-fns';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  accepted: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  picked_up: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  in_transit: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  delivered: 'bg-green-500/15 text-green-400 border-green-500/30',
  cancelled: 'bg-gray-600/15 text-gray-400 border-gray-600/30',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
};

// Display labels — 'car' is stored internally but shown as 'Sedan'
const VEHICLE_LABELS: Record<string, string> = {
  bike: 'Bike', car: 'Sedan', bakkie: 'Bakkie', van: 'Van', truck: 'Truck',
};

const STATUSES = ['all', 'pending', 'accepted', 'in_transit', 'delivered', 'cancelled'];

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if ((v as Timestamp)?.toDate) return (v as Timestamp).toDate();
  if (v instanceof Date) return v;
  return null;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'orders'), orderBy('timeline.createdAt', 'desc'), limit(200)),
      s => setOrders(s.docs.map(d => ({ id: d.id, ...d.data() }) as Order))
    );
  }, []);

  const filtered = orders.filter(o => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.trackingCode?.toLowerCase().includes(q) ||
        o.pickupAddress?.formattedAddress?.toLowerCase().includes(q) ||
        o.deliveryAddress?.formattedAddress?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = STATUSES.slice(1).reduce((acc, s) => {
    acc[s] = orders.filter(o => o.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <>
    <div className="flex h-full">
      {/* ── List panel ── */}
      <div className="flex-1 flex flex-col min-w-0 p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Orders</h1>
            <p className="text-gray-500 text-xs mt-0.5">{filtered.length} of {orders.length} orders</p>
          </div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tracking code, address…"
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 w-64 placeholder-gray-600"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === 'all' ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            All ({orders.length})
          </button>
          {STATUSES.slice(1).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === s ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {s.replace('_', ' ')} {counts[s] > 0 ? `(${counts[s]})` : ''}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-[#111] border border-gray-800/60 rounded-xl overflow-hidden flex-1">
          <div className="overflow-auto h-full">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900/50 border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left font-medium">Tracking</th>
                  <th className="px-4 py-3 text-left font-medium">Route</th>
                  <th className="px-4 py-3 text-left font-medium">Vehicle</th>
                  <th className="px-4 py-3 text-left font-medium">Total</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const d = toDate(o.timeline.createdAt);
                  const isSelected = selected?.id === o.id;
                  return (
                    <tr
                      key={o.id}
                      onClick={() => setSelected(o)}
                      className={`border-b border-gray-800/40 cursor-pointer transition-colors ${isSelected ? 'bg-red-500/5 border-red-500/20' : 'hover:bg-gray-800/30'}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-300 whitespace-nowrap">{o.trackingCode}</td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <div className="text-xs text-green-400 truncate">↑ {o.pickupAddress?.formattedAddress ?? '—'}</div>
                        <div className="text-xs text-red-400 truncate">↓ {o.deliveryAddress?.formattedAddress ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">{VEHICLE_LABELS[o.vehicleType] ?? o.vehicleType}</td>
                      <td className="px-4 py-3 text-white font-semibold text-xs whitespace-nowrap">N${o.price?.total?.toFixed(2) ?? '0.00'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs border px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_COLORS[o.status] ?? 'text-gray-400 border-gray-700'}`}>
                          {o.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {d ? format(d, 'dd MMM, HH:mm') : '—'}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-gray-600 py-12 text-sm">
                      {search ? `No orders matching "${search}"` : 'No orders found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <div className="w-96 border-l border-gray-800 bg-[#0D0D0D] flex flex-col overflow-y-auto">
          <div className="p-5 border-b border-gray-800 flex items-center justify-between">
            <div>
              <div className="text-white font-bold font-mono text-sm">{selected.trackingCode}</div>
              <span className={`text-xs border px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[selected.status] ?? ''}`}>
                {selected.status.replace('_', ' ')}
              </span>
            </div>
            <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
          </div>

          <div className="p-5 space-y-5 flex-1">
            {/* Route */}
            <div>
              <div className="text-gray-400 text-xs uppercase tracking-wider mb-2 font-medium">Route</div>
              <div className="space-y-2">
                <div className="flex gap-2 items-start">
                  <div className="w-2 h-2 rounded-full bg-green-400 mt-1.5 flex-shrink-0" />
                  <div>
                    <div className="text-gray-400 text-xs">Pickup</div>
                    <div className="text-white text-sm">{selected.pickupAddress?.formattedAddress ?? '—'}</div>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <div className="w-2 h-2 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                  <div>
                    <div className="text-gray-400 text-xs">Delivery</div>
                    <div className="text-white text-sm">{selected.deliveryAddress?.formattedAddress ?? '—'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Details */}
            <div>
              <div className="text-gray-400 text-xs uppercase tracking-wider mb-2 font-medium">Order Details</div>
              <div className="bg-gray-900/50 rounded-lg border border-gray-800 divide-y divide-gray-800">
                {[
                  ['Vehicle', VEHICLE_LABELS[selected.vehicleType] ?? selected.vehicleType],
                  ['Distance', `${selected.distanceKm?.toFixed(1) ?? '—'} km`],
                  ['ETA', `~${selected.estimatedMinutes ?? '—'} min`],
                  ['Base fare', `N$${selected.price?.baseFare?.toFixed(2) ?? '0.00'}`],
                  ['Distance fare', `N$${selected.price?.distanceFare?.toFixed(2) ?? '0.00'}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between px-3 py-2 text-xs">
                    <span className="text-gray-400">{k}</span>
                    <span className="text-white font-medium">{v}</span>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-2.5">
                  <span className="text-white font-semibold text-sm">Total</span>
                  <span className="text-green-400 font-bold">N${selected.price?.total?.toFixed(2) ?? '0.00'}</span>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div>
              <div className="text-gray-400 text-xs uppercase tracking-wider mb-2 font-medium">Timeline</div>
              <div className="space-y-2">
                {[
                  ['Created', (selected.timeline as Record<string, unknown>).createdAt],
                  ['Accepted', (selected.timeline as Record<string, unknown>).acceptedAt],
                  ['Picked up', (selected.timeline as Record<string, unknown>).pickedUpAt],
                  ['In transit', (selected.timeline as Record<string, unknown>).inTransitAt],
                  ['Delivered', (selected.timeline as Record<string, unknown>).deliveredAt],
                  ['Cancelled', (selected.timeline as Record<string, unknown>).cancelledAt],
                ].map(([label, ts]) => {
                  if (!ts) return null;
                  const d = toDate(ts);
                  return (
                    <div key={label as string} className="flex justify-between text-xs">
                      <span className="text-gray-400">{label as string}</span>
                      <span className="text-white">{d ? format(d, 'dd MMM HH:mm') : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* IDs */}
            <div className="text-xs text-gray-600 space-y-1 border-t border-gray-800 pt-3">
              <div>Order ID: <span className="font-mono text-gray-500">{selected.id}</span></div>
              {selected.riderId && <div>Rider ID: <span className="font-mono text-gray-500">{selected.riderId}</span></div>}
            </div>

            {/* Admin view only — cancellations are customer/driver initiated */}
            <div className="text-xs text-gray-600 italic pt-1">
              Orders can only be cancelled by the customer or driver.
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
