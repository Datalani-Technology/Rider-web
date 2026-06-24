import { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { Rider } from '../types';

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected';

function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: 'bg-green-500/20 text-green-400 border-green-500/30',
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return <span className={`text-xs border px-2 py-0.5 rounded-full font-medium ${map[status] ?? 'bg-gray-700 text-gray-300 border-gray-600'}`}>{status}</span>;
}

export default function RidersPage() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const [search, setSearch] = useState('');
  const [selectedRider, setSelectedRider] = useState<Rider | null>(null);
  const [note, setNote] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    return onSnapshot(collection(db, 'riders'), snap => {
      setRiders(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Rider));
    });
  }, []);

  const filtered = riders.filter(r => {
    if (filter !== 'all' && r.approvalStatus !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q) || r.phone?.includes(q);
    }
    return true;
  });

  const setApproval = async (riderId: string, status: 'approved' | 'rejected', approvalNote: string) => {
    if (!auth.currentUser) return;
    setProcessing(true);
    await updateDoc(doc(db, 'riders', riderId), {
      approvalStatus: status,
      approvalNote,
      approvedAt: status === 'approved' ? serverTimestamp() : null,
    });
    setProcessing(false);
    setSelectedRider(null);
    setNote('');
  };

  const suspend = async (riderId: string, isActive: boolean) => {
    await updateDoc(doc(db, 'users', riderId), { isActive: !isActive });
    await updateDoc(doc(db, 'riders', riderId), { isOnline: false, isAvailableForOrders: false });
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Riders</h1>
        <p className="text-gray-400 text-sm mt-1">{riders.length} registered riders</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, phone…"
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500 w-64"
        />
        <div className="flex gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as FilterStatus[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3">Rider</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Deliveries</th>
              <th className="px-4 py-3">Credits</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Online</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{r.name}</div>
                  <div className="text-gray-500 text-xs">{r.phone}</div>
                </td>
                <td className="px-4 py-3 text-gray-300 capitalize">{r.preferredVehicle}</td>
                <td className="px-4 py-3 text-gray-300">{r.totalDeliveries}</td>
                <td className="px-4 py-3">
                  <span className={r.walletBalance === 0 ? 'text-red-400 font-semibold' : 'text-green-400'}>
                    {r.walletBalance ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3"><Badge status={r.approvalStatus} /></td>
                <td className="px-4 py-3">
                  <span className={`inline-block w-2 h-2 rounded-full ${r.isOnline ? 'bg-green-400' : 'bg-gray-600'}`} />
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => { setSelectedRider(r); setNote(''); }}
                    className="text-xs text-blue-400 hover:text-blue-300 underline">
                    Review
                  </button>
                  <button onClick={() => suspend(r.id, r.isActive)}
                    className={`text-xs underline ${r.isActive ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}`}>
                    {r.isActive ? 'Suspend' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-gray-500 py-8">No riders found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Rider detail modal */}
      {selectedRider && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-800 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">{selectedRider.name}</h2>
                <p className="text-gray-400 text-sm">{selectedRider.email} · {selectedRider.phone}</p>
              </div>
              <button onClick={() => setSelectedRider(null)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-gray-400">Vehicle</div>
                  <div className="text-white capitalize mt-1">{selectedRider.preferredVehicle}</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-gray-400">Wallet Balance</div>
                  <div className={`mt-1 font-semibold ${selectedRider.walletBalance === 0 ? 'text-red-400' : 'text-green-400'}`}>{selectedRider.walletBalance ?? 0} credits</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-gray-400">Rating</div>
                  <div className="text-white mt-1">⭐ {selectedRider.rating?.toFixed(1) ?? '—'} ({selectedRider.ratingCount ?? 0} reviews)</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-gray-400">Deliveries</div>
                  <div className="text-white mt-1">{selectedRider.totalDeliveries}</div>
                </div>
              </div>

              {/* Documents */}
              <div>
                <div className="text-gray-400 text-sm mb-2">Submitted Documents</div>
                <div className="space-y-2">
                  {[
                    { label: 'Vehicle Registration (CR1)', url: selectedRider.vehicleRegDocUrl },
                    { label: 'Certificate of Fitness (Roadworthy)', url: selectedRider.roadworthyDocUrl },
                    { label: 'License Disc', url: selectedRider.licenseDiscDocUrl },
                  ].map(doc => (
                    <div key={doc.label} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                      <span className="text-sm text-gray-300">{doc.label}</span>
                      {doc.url ? (
                        <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300 underline">View ↗</a>
                      ) : (
                        <span className="text-xs text-gray-600">Not uploaded</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {selectedRider.approvalStatus === 'pending' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Note (optional for reject)</label>
                    <input value={note} onChange={e => setNote(e.target.value)}
                      placeholder="Reason for rejection…"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setApproval(selectedRider.id, 'approved', '')} disabled={processing}
                      className="flex-1 bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 rounded-lg py-2 text-sm font-medium disabled:opacity-50 transition-colors">
                      ✓ Approve Rider
                    </button>
                    <button onClick={() => setApproval(selectedRider.id, 'rejected', note)} disabled={processing}
                      className="flex-1 bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 rounded-lg py-2 text-sm font-medium disabled:opacity-50 transition-colors">
                      ✗ Reject Rider
                    </button>
                  </div>
                </div>
              )}
              {selectedRider.approvalStatus !== 'pending' && (
                <div className="flex gap-3">
                  <button onClick={() => setApproval(selectedRider.id, 'approved', '')} disabled={selectedRider.approvalStatus === 'approved' || processing}
                    className="flex-1 bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 rounded-lg py-2 text-sm font-medium disabled:opacity-30 transition-colors">
                    Approve
                  </button>
                  <button onClick={() => setApproval(selectedRider.id, 'rejected', note)} disabled={selectedRider.approvalStatus === 'rejected' || processing}
                    className="flex-1 bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 rounded-lg py-2 text-sm font-medium disabled:opacity-30 transition-colors">
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
