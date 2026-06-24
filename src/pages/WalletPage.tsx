import { useEffect, useState } from 'react';
import {
  collection, query, where, orderBy, onSnapshot,
  doc, getDoc, runTransaction, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { WalletTransaction } from '../types';
import { format } from 'date-fns';

function Badge({ status }: { status: string }) {
  const color = status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    : status === 'approved' ? 'bg-green-500/20 text-green-400 border-green-500/30'
    : 'bg-red-500/20 text-red-400 border-red-500/30';
  return <span className={`text-xs border px-2 py-0.5 rounded-full font-medium ${color}`}>{status}</span>;
}

export default function WalletPage() {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [riderNames, setRiderNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const q = filter === 'pending'
      ? query(collection(db, 'wallet_transactions'), where('type', '==', 'topup'), where('status', '==', 'pending'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'wallet_transactions'), where('type', '==', 'topup'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, async snap => {
      const txs = snap.docs.map(d => ({ id: d.id, ...d.data() }) as WalletTransaction);
      setTransactions(txs);
      // Fetch rider names we don't have yet
      const missing = [...new Set(txs.map(t => t.riderId))].filter(id => !riderNames[id]);
      if (missing.length) {
        const names: Record<string, string> = {};
        await Promise.all(missing.map(async id => {
          const snap = await getDoc(doc(db, 'users', id));
          names[id] = snap.exists() ? snap.data().name : id;
        }));
        setRiderNames(prev => ({ ...prev, ...names }));
      }
    });
  }, [filter]);

  const approve = async (tx: WalletTransaction) => {
    if (!auth.currentUser) return;
    setProcessing(tx.id);
    try {
      const riderRef = doc(db, 'riders', tx.riderId);
      const txRef = doc(db, 'wallet_transactions', tx.id);
      await runTransaction(db, async (t) => {
        const riderSnap = await t.get(riderRef);
        const current = (riderSnap.data()?.walletBalance ?? 0) as number;
        const totalBought = (riderSnap.data()?.totalCreditsPurchased ?? 0) as number;
        t.update(riderRef, {
          walletBalance: current + tx.credits,
          totalCreditsPurchased: totalBought + tx.credits,
          updatedAt: serverTimestamp(),
        });
        t.update(txRef, { status: 'approved', processedAt: serverTimestamp(), processedBy: auth.currentUser!.uid });
      });
    } finally {
      setProcessing(null);
    }
  };

  const reject = async (tx: WalletTransaction) => {
    if (!auth.currentUser) return;
    const note = rejectNote[tx.id] || 'Payment not verified.';
    setProcessing(tx.id);
    try {
      await updateDoc(doc(db, 'wallet_transactions', tx.id), {
        status: 'rejected', note, processedAt: serverTimestamp(), processedBy: auth.currentUser!.uid,
      });
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Wallet Approvals</h1>
          <p className="text-gray-400 text-sm mt-1">Review and approve rider top-up requests</p>
        </div>
        <div className="flex gap-2">
          {(['pending', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {f === 'pending' ? 'Pending' : 'All History'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {transactions.length === 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-500">
            {filter === 'pending' ? 'No pending top-up requests' : 'No transactions found'}
          </div>
        )}
        {transactions.map(tx => (
          <div key={tx.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white">{riderNames[tx.riderId] ?? tx.riderId}</span>
                  <Badge status={tx.status} />
                  <span className="text-green-400 font-bold">+{tx.credits} credits</span>
                  <span className="text-gray-400 text-sm">N${tx.priceNAD}</span>
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  Package: <span className="text-white">{tx.packageName}</span>
                  {' · '}{tx.paymentMethod?.toUpperCase()}
                  {tx.paymentRef && <> · Ref: <span className="text-white">{tx.paymentRef}</span></>}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {tx.createdAt ? format((tx.createdAt as unknown as { toDate?: () => Date }).toDate?.() ?? new Date(), 'dd MMM yyyy, HH:mm') : ''}
                </div>
                {tx.proofUrl && (
                  <a href={tx.proofUrl} target="_blank" rel="noreferrer"
                    className="inline-block mt-2 text-xs text-blue-400 hover:text-blue-300 underline">
                    View proof of payment ↗
                  </a>
                )}
                {tx.note && <div className="text-xs text-red-400 mt-1">Note: {tx.note}</div>}
              </div>

              {tx.status === 'pending' && (
                <div className="flex flex-col gap-2 shrink-0">
                  <button onClick={() => approve(tx)} disabled={processing === tx.id}
                    className="px-4 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-sm font-medium hover:bg-green-500/30 disabled:opacity-50 transition-colors">
                    {processing === tx.id ? '…' : 'Approve'}
                  </button>
                  <input
                    placeholder="Reject reason"
                    value={rejectNote[tx.id] ?? ''}
                    onChange={e => setRejectNote(p => ({ ...p, [tx.id]: e.target.value }))}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white w-36"
                  />
                  <button onClick={() => reject(tx)} disabled={processing === tx.id}
                    className="px-4 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm font-medium hover:bg-red-500/30 disabled:opacity-50 transition-colors">
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
