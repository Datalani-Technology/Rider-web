import { useEffect, useState } from 'react';
import {
  collection, query, where, orderBy, onSnapshot,
  doc, getDoc, runTransaction, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { Rider, WalletTransaction, WalletCurrency } from '../types';
import { format } from 'date-fns';

// Migration-safe balance reads: legacy walletBalance credits count as ride points.
const cashOf = (r: Rider) => r.cashBalance ?? 0;
const pointsOf = (r: Rider) => r.ridePoints ?? r.walletBalance ?? 0;
const fmtCash = (n: number) => `N$${n.toFixed(2)}`;

function Badge({ status }: { status: string }) {
  const color = status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    : status === 'approved' ? 'bg-green-500/20 text-green-400 border-green-500/30'
    : 'bg-red-500/20 text-red-400 border-red-500/30';
  return <span className={`text-xs border px-2 py-0.5 rounded-full font-medium ${color}`}>{status}</span>;
}

export default function WalletPage() {
  const [view, setView] = useState<'balances' | 'topups'>('balances');

  // ── Driver balances ──────────────────────────────────────────────────────
  const [riders, setRiders] = useState<Rider[]>([]);
  const [search, setSearch] = useState('');
  const [manageId, setManageId] = useState<string | null>(null);
  const [manageMode, setManageMode] = useState<WalletCurrency>('cash');
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  const openManage = (riderId: string, mode: WalletCurrency) => {
    setManageId(riderId);
    setManageMode(mode);
    setAmount('');
  };

  useEffect(() => {
    return onSnapshot(collection(db, 'riders'), snap => {
      setRiders(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Rider));
    });
  }, []);

  const filteredRiders = riders.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q) || r.phone?.includes(q);
  });

  const manageRider = manageId ? riders.find(r => r.id === manageId) ?? null : null;
  const amountNum = parseFloat(amount) || 0;

  // Admin adjusts a rider's cash wallet (N$) or ride points. Cash may go negative;
  // ride points are floored at 0. Atomic, and writes a ledger entry the rider sees.
  const adjustBalance = async (rider: Rider, currency: WalletCurrency, rawAmount: number) => {
    if (!auth.currentUser || !rawAmount) return;
    const amt = currency === 'points' ? Math.round(rawAmount) : Math.round(rawAmount * 100) / 100;
    if (!amt) return;
    const label = currency === 'cash' ? fmtCash(Math.abs(amt)) : `${Math.abs(amt)} points`;
    if (!confirm(`${amt > 0 ? 'Add' : 'Remove'} ${label} ${amt > 0 ? 'to' : 'from'} ${rider.name}?`)) return;
    setProcessing(true);
    try {
      const riderRef = doc(db, 'riders', rider.id);
      const field = currency === 'cash' ? 'cashBalance' : 'ridePoints';
      await runTransaction(db, async (t) => {
        const snap = await t.get(riderRef);
        const data = snap.data() ?? {};
        const current =
          currency === 'cash'
            ? (data.cashBalance as number) ?? 0
            : (data.ridePoints as number) ?? (data.walletBalance as number) ?? 0;
        const next = currency === 'cash' ? current + amt : Math.max(0, current + amt);
        t.update(riderRef, { [field]: next, updatedAt: serverTimestamp() });
        t.set(doc(collection(db, 'wallet_transactions')), {
          riderId: rider.id,
          type: amt > 0 ? 'topup' : 'deduction',
          currency,
          credits: amt,
          status: 'approved',
          packageName: currency === 'cash' ? 'Admin cash adjustment' : 'Admin points adjustment',
          processedBy: auth.currentUser!.uid,
          createdAt: serverTimestamp(),
          processedAt: serverTimestamp(),
        });
      });
      setAmount('');
    } finally {
      setProcessing(false);
    }
  };

  // ── Top-up requests ──────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [topupFilter, setTopupFilter] = useState<'pending' | 'all'>('pending');
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  const [txProcessing, setTxProcessing] = useState<string | null>(null);
  const [riderNames, setRiderNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const q = topupFilter === 'pending'
      ? query(collection(db, 'wallet_transactions'), where('type', '==', 'topup'), where('status', '==', 'pending'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'wallet_transactions'), where('type', '==', 'topup'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, async snap => {
      const txs = snap.docs.map(d => ({ id: d.id, ...d.data() }) as WalletTransaction);
      setTransactions(txs);
      const missing = [...new Set(txs.map(t => t.riderId))].filter(id => !riderNames[id]);
      if (missing.length) {
        const names: Record<string, string> = {};
        await Promise.all(missing.map(async id => {
          const s = await getDoc(doc(db, 'users', id));
          names[id] = s.exists() ? s.data().name : id;
        }));
        setRiderNames(prev => ({ ...prev, ...names }));
      }
    });
  }, [topupFilter]);

  const pendingTopups = transactions.filter(t => t.status === 'pending').length;

  const approve = async (tx: WalletTransaction) => {
    if (!auth.currentUser) return;
    setTxProcessing(tx.id);
    try {
      const riderRef = doc(db, 'riders', tx.riderId);
      const txRef = doc(db, 'wallet_transactions', tx.id);
      // A paid top-up credits the rider's CASH wallet by the money they paid (priceNAD).
      const cashAmount = typeof tx.priceNAD === 'number' ? tx.priceNAD : (tx.credits ?? 0);
      await runTransaction(db, async (t) => {
        const riderSnap = await t.get(riderRef);
        const current = (riderSnap.data()?.cashBalance ?? 0) as number;
        const totalBought = (riderSnap.data()?.totalCreditsPurchased ?? 0) as number;
        t.update(riderRef, {
          cashBalance: current + cashAmount,
          totalCreditsPurchased: totalBought + cashAmount,
          updatedAt: serverTimestamp(),
        });
        t.update(txRef, { status: 'approved', currency: 'cash', processedAt: serverTimestamp(), processedBy: auth.currentUser!.uid });
      });
    } finally {
      setTxProcessing(null);
    }
  };

  const reject = async (tx: WalletTransaction) => {
    if (!auth.currentUser) return;
    const note = rejectNote[tx.id] || 'Payment not verified.';
    setTxProcessing(tx.id);
    try {
      await updateDoc(doc(db, 'wallet_transactions', tx.id), {
        status: 'rejected', note, processedAt: serverTimestamp(), processedBy: auth.currentUser!.uid,
      });
    } finally {
      setTxProcessing(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Driver Wallets</h1>
          <p className="text-gray-400 text-sm mt-1">Manage driver balances, ride points and top-up requests</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('balances')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'balances' ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            Balances
          </button>
          <button onClick={() => setView('topups')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'topups' ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            Top-up Requests
            {pendingTopups > 0 && <span className="ml-2 bg-yellow-500 text-black text-xs rounded-full px-1.5 py-0.5">{pendingTopups}</span>}
          </button>
        </div>
      </div>

      {/* ── Driver balances table ── */}
      {view === 'balances' && (
        <>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500 w-72"
          />
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-left">
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3">Cash Wallet</th>
                  <th className="px-4 py-3">Ride Points</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRiders.map(r => (
                  <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{r.name}</div>
                      <div className="text-gray-500 text-xs">{r.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-300 capitalize">{r.preferredVehicle}</td>
                    <td className="px-4 py-3">
                      <span className={cashOf(r) < 0 ? 'text-red-400 font-semibold' : 'text-gray-200'}>{fmtCash(cashOf(r))}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={pointsOf(r) > 0 ? 'text-green-400' : 'text-gray-500'}>{pointsOf(r)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openManage(r.id, 'cash')}
                          className="px-3 py-1.5 bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 rounded-lg text-xs font-medium">
                          Update Balance
                        </button>
                        <button onClick={() => openManage(r.id, 'points')}
                          className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 rounded-lg text-xs font-medium">
                          Offer Points
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredRiders.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-gray-500 py-8">No drivers found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Top-up requests ── */}
      {view === 'topups' && (
        <>
          <div className="flex gap-2">
            {(['pending', 'all'] as const).map(f => (
              <button key={f} onClick={() => setTopupFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${topupFilter === f ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                {f === 'pending' ? 'Pending' : 'All History'}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {transactions.length === 0 && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-500">
                {topupFilter === 'pending' ? 'No pending top-up requests' : 'No transactions found'}
              </div>
            )}
            {transactions.map(tx => (
              <div key={tx.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{riderNames[tx.riderId] ?? tx.riderId}</span>
                      <Badge status={tx.status} />
                      <span className="text-green-400 font-bold">+N${(tx.priceNAD ?? tx.credits ?? 0).toFixed(2)} to wallet</span>
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
                      <button onClick={() => approve(tx)} disabled={txProcessing === tx.id}
                        className="px-4 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-sm font-medium hover:bg-green-500/30 disabled:opacity-50 transition-colors">
                        {txProcessing === tx.id ? '…' : 'Approve'}
                      </button>
                      <input
                        placeholder="Reject reason"
                        value={rejectNote[tx.id] ?? ''}
                        onChange={e => setRejectNote(p => ({ ...p, [tx.id]: e.target.value }))}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white w-36"
                      />
                      <button onClick={() => reject(tx)} disabled={txProcessing === tx.id}
                        className="px-4 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm font-medium hover:bg-red-500/30 disabled:opacity-50 transition-colors">
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Manage modal — focused on either cash or points ── */}
      {manageRider && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md">
            <div className="p-5 border-b border-gray-800 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">
                  {manageMode === 'cash' ? 'Update Cash Balance' : 'Offer Ride Points'}
                </h2>
                <p className="text-gray-400 text-sm">{manageRider.name} · {manageRider.phone}</p>
              </div>
              <button onClick={() => setManageId(null)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Current balance for the selected mode */}
              <div className="bg-gray-800 rounded-lg p-4 text-center">
                <div className="text-gray-400 text-xs uppercase tracking-wide">
                  {manageMode === 'cash' ? 'Current Cash Wallet' : 'Current Ride Points'}
                </div>
                {manageMode === 'cash' ? (
                  <div className={`mt-1 text-2xl font-bold ${cashOf(manageRider) < 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {fmtCash(cashOf(manageRider))}
                  </div>
                ) : (
                  <div className="mt-1 text-2xl font-bold text-white">{pointsOf(manageRider)} points</div>
                )}
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-1">
                  {manageMode === 'cash' ? 'Amount (N$)' : 'Number of points'}
                </label>
                <input
                  type="number"
                  autoFocus
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder={manageMode === 'cash' ? 'e.g. 50.00' : 'e.g. 5'}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => adjustBalance(manageRider, manageMode, amountNum)} disabled={processing || !amountNum}
                  className="bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">
                  {manageMode === 'cash' ? '+ Add Cash' : '+ Offer Points'}
                </button>
                <button onClick={() => adjustBalance(manageRider, manageMode, -amountNum)} disabled={processing || !amountNum}
                  className="bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">
                  {manageMode === 'cash' ? '− Deduct Cash' : '− Deduct Points'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
