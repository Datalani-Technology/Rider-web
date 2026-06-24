import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { Order } from '../types';
import { format } from 'date-fns';
import { Timestamp } from 'firebase/firestore';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  accepted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  picked_up: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  in_transit: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  delivered: 'bg-green-500/20 text-green-400 border-green-500/30',
  cancelled: 'bg-gray-600/20 text-gray-400 border-gray-600/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'orders'), orderBy('timeline.createdAt', 'desc'), limit(100)),
      snap => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Order))
    );
  }, []);

  const filtered = filterStatus === 'all' ? orders : orders.filter(o => o.status === filterStatus);

  const cancelOrder = async (orderId: string) => {
    if (!confirm('Cancel this order?')) return;
    await updateDoc(doc(db, 'orders', orderId), {
      status: 'cancelled',
      cancellationReason: 'Cancelled by admin',
      'timeline.cancelledAt': serverTimestamp(),
    });
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Orders</h1>
        <p className="text-gray-400 text-sm mt-1">Last 100 orders</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'accepted', 'in_transit', 'delivered', 'cancelled'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === s ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3">Tracking</th>
              <th className="px-4 py-3">Pickup → Delivery</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-4 py-3 font-mono text-xs text-gray-300">{o.trackingCode}</td>
                <td className="px-4 py-3 max-w-xs">
                  <div className="text-xs text-green-400 truncate">{o.pickupAddress?.formattedAddress ?? '—'}</div>
                  <div className="text-xs text-red-400 truncate">{o.deliveryAddress?.formattedAddress ?? '—'}</div>
                </td>
                <td className="px-4 py-3 text-gray-300 capitalize text-xs">{o.vehicleType}</td>
                <td className="px-4 py-3 text-white font-medium">N${o.price.total?.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs border px-2 py-0.5 rounded-full ${STATUS_COLORS[o.status] ?? ''}`}>
                    {o.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {o.timeline.createdAt ? format((o.timeline.createdAt as unknown as Timestamp)?.toDate?.() ?? new Date(), 'dd MMM, HH:mm') : '—'}
                </td>
                <td className="px-4 py-3">
                  {['pending', 'accepted'].includes(o.status) && (
                    <button onClick={() => cancelOrder(o.id)} className="text-xs text-red-400 hover:text-red-300 underline">Cancel</button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-gray-500 py-8">No orders found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
