import { useEffect, useState } from 'react';
import {
  collection, query, where, orderBy, onSnapshot,
  doc, getDoc, runTransaction, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { Rider, WalletTransaction, WalletCurrency } from '../types';
import { format } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { logAdminAction } from '../utils/auditLog';

// Migration-safe balance reads: legacy walletBalance credits count as ride points.
const cashOf = (r: Rider) => r.cashBalance ?? 0;
const pointsOf = (r: Rider) => r.ridePoints ?? r.walletBalance ?? 0;
const fmtCash = (n: number) => `N$${n.toFixed(2)}`;

const toDate = (v: unknown): Date => {
  if ((v as Timestamp)?.toDate) return (v as Timestamp).toDate();
  if (v instanceof Date) return v;
  return new Date();
};

type FilterType = 'pending' | 'approved' | 'rejected' | 'all';

export default function WalletPage() {
  const [view, setView] = useState<'balances' | 'topups'>('balances');

  // ── Driver balances ──────────────────────────────────────────────────────
  const [riders, setRiders] = useState<Rider[]>([]);
  const [search, setSearch] = useState('');
  const [manageId, setManageId] = useState<string | null>(null);
  const [manageMode, setManageMode] = useState<WalletCurrency>('cash');
  const [amount, setAmount] = useState('');
  const [adjusting, setAdjusting] = useState(false);

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
    setAdjusting(true);
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
      setManageId(null);
    } finally {
      setAdjusting(false);
    }
  };

  // ── Top-up requests ──────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [filter, setFilter] = useState<FilterType>('pending');
  const [riderNames, setRiderNames] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  const [proofModal, setProofModal] = useState<string | null>(null);
  const [selected, setSelected] = useState<WalletTransaction | null>(null);

  useEffect(() => {
    let q;
    if (filter === 'pending')
      q = query(collection(db, 'wallet_transactions'), where('type', '==', 'topup'), where('status', '==', 'pending'), orderBy('createdAt', 'desc'));
    else if (filter === 'all')
      q = query(collection(db, 'wallet_transactions'), where('type', '==', 'topup'), orderBy('createdAt', 'desc'));
    else
      q = query(collection(db, 'wallet_transactions'), where('type', '==', 'topup'), where('status', '==', filter), orderBy('createdAt', 'desc'));

    return onSnapshot(q, async snap => {
      const txs = snap.docs.map(d => ({ id: d.id, ...d.data() }) as WalletTransaction);
      setTransactions(txs);
      const missing = [...new Set(txs.map(t => t.riderId))].filter(id => !riderNames[id]);
      if (missing.length) {
        const names: Record<string, string> = {};
        await Promise.all(missing.map(async id => {
          const s = await getDoc(doc(db, 'riders', id));
          names[id] = s.exists() ? (s.data().name ?? id) : id;
        }));
        setRiderNames(p => ({ ...p, ...names }));
      }
    });
  }, [filter]);

  const pendingTopups = transactions.filter(t => t.status === 'pending').length;

  const approve = async (tx: WalletTransaction) => {
    if (!auth.currentUser) return;
    setProcessing(tx.id);
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
      await logAdminAction('APPROVE_TOPUP', {
        transactionId: tx.id, riderId: tx.riderId,
        credits: tx.credits, packageName: tx.packageName ?? '—',
        riderName: riderNames[tx.riderId] ?? tx.riderId,
      });
      // Notify rider
      await fetch(`https://api.expo.dev/v2/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: `ExponentPushToken[placeholder]`,
          title: `${tx.credits} credits added! 💳`,
          body: `Your ${tx.packageName ?? 'top-up'} has been approved.`,
        }),
      }).catch(() => null);
    } finally {
      setProcessing(null);
      setSelected(null);
    }
  };

  const reject = async (tx: WalletTransaction) => {
    if (!auth.currentUser) return;
    const note = rejectNote[tx.id] || 'Payment could not be verified.';
    setProcessing(tx.id);
    try {
      await updateDoc(doc(db, 'wallet_transactions', tx.id), {
        status: 'rejected',
        note,
        processedAt: serverTimestamp(),
        processedBy: auth.currentUser.uid,
      });
      await logAdminAction('REJECT_TOPUP', {
        transactionId: tx.id, riderId: tx.riderId,
        credits: tx.credits, reason: note,
        riderName: riderNames[tx.riderId] ?? tx.riderId,
      });
    } finally {
      setProcessing(null);
      setSelected(null);
    }
  };

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all', label: 'All History' },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 pb-0 flex items-center justify-between flex-wrap gap-3">
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
        <div className="p-6 space-y-4 overflow-y-auto">
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
        </div>
      )}

      {/* ── Top-up requests ── */}
      {view === 'topups' && (
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 p-6 space-y-4 overflow-y-auto min-w-0">
            <div className="flex gap-2">
              {FILTERS.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f.key ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  {f.label}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {transactions.map(tx => (
                <div
                  key={tx.id}
                  onClick={() => setSelected(tx)}
                  className={`bg-[#111] border rounded-xl p-4 cursor-pointer transition-all hover:border-gray-600 ${selected?.id === tx.id ? 'border-red-500/40 bg-red-500/5' : 'border-gray-800/60'}`}
                >
                  <div className="flex items-start gap-4">
                    {/* Proof thumbnail */}
                    {tx.proofUrl ? (
                      <button
                        onClick={e => { e.stopPropagation(); setProofModal(tx.proofUrl!); }}
                        className="w-14 h-14 rounded-lg overflow-hidden border border-gray-700 flex-shrink-0 hover:border-blue-400 transition-colors group relative"
                      >
                        {tx.proofUrl.includes('.pdf') ? (
                          <div className="w-full h-full bg-gray-800 flex items-center justify-center text-2xl">📄</div>
                        ) : (
                          <img src={tx.proofUrl} alt="Proof" className="w-full h-full object-cover" />
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-white text-xs font-medium">View</span>
                        </div>
                      </button>
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-2xl flex-shrink-0">💳</div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white text-sm">{riderNames[tx.riderId] ?? '…'}</span>
                        <span className={`text-xs border px-2 py-0.5 rounded-full font-medium ${
                          tx.status === 'approved' ? 'bg-green-500/15 text-green-400 border-green-500/30'
                          : tx.status === 'rejected' ? 'bg-red-500/15 text-red-400 border-red-500/30'
                          : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                        }`}>
                          {tx.status}
                        </span>
                        <span className="text-green-400 font-bold text-sm">+N${(tx.priceNAD ?? tx.credits ?? 0).toFixed(2)} to wallet</span>
                      </div>
                      <div className="text-gray-400 text-xs mt-1">
                        <span className="text-white">{tx.packageName ?? 'Top-up'}</span>
                        {' · '}{(tx.paymentMethod ?? '').toUpperCase()}
                        {tx.paymentRef && <> · Ref: <span className="text-gray-200">{tx.paymentRef}</span></>}
                      </div>
                      <div className="text-gray-600 text-xs mt-0.5">
                        {format(toDate(tx.createdAt), 'dd MMM yyyy, HH:mm')}
                      </div>
                      {tx.note && <div className="text-xs text-red-400 mt-1 italic">{tx.note}</div>}
                    </div>

                    {/* Quick approve/reject for pending */}
                    {tx.status === 'pending' && (
                      <div className="flex gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => approve(tx)}
                          disabled={processing === tx.id}
                          className="px-3 py-1.5 bg-green-500/15 text-green-400 border border-green-500/30 rounded-lg text-xs font-medium hover:bg-green-500/25 disabled:opacity-50 transition-colors"
                        >
                          {processing === tx.id ? '…' : '✓ Approve'}
                        </button>
                        <button
                          onClick={() => reject(tx)}
                          disabled={processing === tx.id}
                          className="px-3 py-1.5 bg-red-500/15 text-red-400 border border-red-500/30 rounded-lg text-xs font-medium hover:bg-red-500/25 disabled:opacity-50 transition-colors"
                        >
                          ✗ Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {transactions.length === 0 && (
                <div className="bg-[#111] border border-gray-800/60 rounded-xl p-12 text-center">
                  <div className="text-4xl mb-3">💳</div>
                  <div className="text-gray-400 font-medium">{filter === 'pending' ? 'No pending top-up requests' : 'No transactions found'}</div>
                  <div className="text-gray-600 text-sm mt-1">All clear — check back later</div>
                </div>
              )}
            </div>
          </div>

          {/* ── Detail panel ── */}
          {selected && (
            <div className="w-80 border-l border-gray-800 bg-[#0D0D0D] flex flex-col overflow-y-auto">
              <div className="p-5 border-b border-gray-800 flex items-center justify-between">
                <div className="text-white font-semibold text-sm">Transaction Detail</div>
                <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-5">
                {selected.proofUrl && (
                  <div>
                    <div className="text-gray-400 text-xs uppercase tracking-wider mb-2 font-medium">Proof of Payment</div>
                    <button
                      onClick={() => setProofModal(selected.proofUrl!)}
                      className="w-full rounded-xl overflow-hidden border border-gray-700 hover:border-blue-400 transition-colors"
                    >
                      {selected.proofUrl.includes('.pdf') ? (
                        <div className="h-32 bg-gray-900 flex flex-col items-center justify-center gap-2">
                          <span className="text-4xl">📄</span>
                          <span className="text-xs text-blue-400 underline">View PDF</span>
                        </div>
                      ) : (
                        <img src={selected.proofUrl} alt="Proof" className="w-full object-contain max-h-48" />
                      )}
                    </button>
                  </div>
                )}

                <div>
                  <div className="text-gray-400 text-xs uppercase tracking-wider mb-2 font-medium">Details</div>
                  <div className="bg-gray-900/50 rounded-lg border border-gray-800 divide-y divide-gray-800">
                    {[
                      ['Rider', riderNames[selected.riderId] ?? '—'],
                      ['Package', selected.packageName ?? '—'],
                      ['Amount', `N$${(selected.priceNAD ?? selected.credits ?? 0).toFixed(2)}`],
                      ['Method', (selected.paymentMethod ?? '—').toUpperCase()],
                      ['Reference', selected.paymentRef ?? '—'],
                      ['Status', selected.status],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between px-3 py-2 text-xs">
                        <span className="text-gray-400">{k}</span>
                        <span className="text-white font-medium truncate max-w-[140px]" title={v}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {selected.status === 'pending' && (
                  <div className="space-y-2">
                    <button
                      onClick={() => approve(selected)}
                      disabled={processing === selected.id}
                      className="w-full py-2.5 bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      ✓ Approve — Add N${(selected.priceNAD ?? selected.credits ?? 0).toFixed(2)} to Wallet
                    </button>
                    <textarea
                      placeholder="Rejection reason (optional)"
                      value={rejectNote[selected.id] ?? ''}
                      onChange={e => setRejectNote(p => ({ ...p, [selected.id]: e.target.value }))}
                      rows={2}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-red-500 resize-none"
                    />
                    <button
                      onClick={() => reject(selected)}
                      disabled={processing === selected.id}
                      className="w-full py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      ✗ Reject Request
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
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
                <button onClick={() => adjustBalance(manageRider, manageMode, amountNum)} disabled={adjusting || !amountNum}
                  className="bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">
                  {manageMode === 'cash' ? '+ Add Cash' : '+ Offer Points'}
                </button>
                <button onClick={() => adjustBalance(manageRider, manageMode, -amountNum)} disabled={adjusting || !amountNum}
                  className="bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">
                  {manageMode === 'cash' ? '− Deduct Cash' : '− Deduct Points'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Proof modal ── */}
      {proofModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setProofModal(null)}
        >
          <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setProofModal(null)}
              className="absolute -top-10 right-0 text-white text-2xl hover:text-gray-300"
            >×</button>
            {proofModal.includes('.pdf') ? (
              <iframe src={proofModal} className="w-full h-[80vh] rounded-xl border border-gray-700" title="Proof" />
            ) : (
              <img src={proofModal} alt="Proof of payment" className="w-full rounded-xl border border-gray-700 max-h-[85vh] object-contain" />
            )}
            <a href={proofModal} target="_blank" rel="noreferrer"
              className="block text-center mt-3 text-blue-400 hover:text-blue-300 text-sm underline">
              Open in new tab ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
