import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { BaseUser } from '../types';
import { format } from 'date-fns';
import { Timestamp } from 'firebase/firestore';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<BaseUser[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'customer')),
      snap => setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() }) as BaseUser))
    );
  }, []);

  const filtered = customers.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q);
  });

  const toggleActive = async (id: string, current: boolean) => {
    await updateDoc(doc(db, 'users', id), { isActive: !current });
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Customers</h1>
        <p className="text-gray-400 text-sm mt-1">{customers.length} registered customers</p>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search name, email, phone…"
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500 w-64"
      />

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{c.name}</div>
                  <div className="text-gray-500 text-xs">{c.email}</div>
                </td>
                <td className="px-4 py-3 text-gray-300">{c.phone}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {c.createdAt ? format((c.createdAt as unknown as Timestamp)?.toDate?.() ?? new Date(), 'dd MMM yyyy') : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${c.isActive ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-gray-700 text-gray-400 border-gray-600'}`}>
                    {c.isActive ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(c.id, c.isActive)}
                    className={`text-xs underline ${c.isActive ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}`}>
                    {c.isActive ? 'Suspend' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="text-center text-gray-500 py-8">No customers found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
