import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, doc, updateDoc, addDoc,
  getDoc, serverTimestamp, increment,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { Rider } from '../types';
import ConfirmDialog from '../components/ConfirmDialog';
import { logAdminAction } from '../utils/auditLog';

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected';

// Migration-safe balance reads: legacy walletBalance credits count as ride points.
const cashOf = (r: Rider) => r.cashBalance ?? 0;
const pointsOf = (r: Rider) => r.ridePoints ?? r.walletBalance ?? 0;
const fmtCash = (n: number) => `N$${n.toFixed(2)}`;

const VEHICLE_LABELS: Record<string, string> = {
  bike: 'Bike', car: 'Sedan', bakkie: 'Bakkie', van: 'Van', truck: 'Truck',
};
const vehicleLabel = (v?: string) => VEHICLE_LABELS[v ?? ''] ?? (v ?? '—');

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  pending:  { bg: 'rgba(243,156,18,0.12)',  text: '#F39C12', dot: '#F39C12', label: 'Pending Review' },
  approved: { bg: 'rgba(39,174,96,0.12)',   text: '#27AE60', dot: '#27AE60', label: 'Approved' },
  rejected: { bg: 'rgba(231,76,60,0.12)',   text: '#E74C3C', dot: '#E74C3C', label: 'Rejected' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.4)', dot: '#666', label: status };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.text,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

const DOCS = [
  { key: 'licenseFrontUrl',    label: "Driver's Licence — Front", hint: 'Contains ID number' },
  { key: 'licenseBackUrl',     label: "Driver's Licence — Back",  hint: 'Vehicle categories' },
  { key: 'vehicleRegDocUrl',   label: 'Vehicle Registration',     hint: 'CR1 document' },
  { key: 'roadworthyDocUrl',   label: 'Certificate of Fitness',   hint: 'Roadworthy certificate' },
  { key: 'licenseDiscDocUrl',  label: 'Licence Disc',             hint: 'Current disc' },
] as const;

export default function RidersPage() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Rider | null>(null);
  const [note, setNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [creditAmount, setCreditAmount] = useState('10');
  const [creditMsg, setCreditMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'docs' | 'credits'>('info');

  const [confirm, setConfirm] = useState<{
    open: boolean; title: string; message: string;
    confirmLabel: string; variant: 'danger' | 'warning' | 'success' | 'info';
    action: () => Promise<void>;
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'info', action: async () => {} });
  const [confirmLoading, setConfirmLoading] = useState(false);

  const ask = (cfg: typeof confirm) => setConfirm({ ...cfg, open: true });
  const runConfirmed = async () => {
    setConfirmLoading(true);
    try { await confirm.action(); } finally {
      setConfirmLoading(false);
      setConfirm(c => ({ ...c, open: false }));
    }
  };

  // isActive lives on the users/{uid} doc, not the rider doc — track it separately
  // so the Suspend/Activate label reflects the real state and toggles both ways.
  const [activeMap, setActiveMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    return onSnapshot(collection(db, 'riders'), async snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Rider);
      const missing = list.filter(r => !r.name);
      if (missing.length) {
        await Promise.all(missing.map(async r => {
          const u = await getDoc(doc(db, 'users', r.id));
          if (u.exists()) { r.name = u.data().name ?? r.name; r.email = u.data().email ?? r.email; r.phone = u.data().phone ?? r.phone; }
        }));
      }
      setRiders(list);
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), snap => {
      const map: Record<string, boolean> = {};
      // Default to active (true) — a rider who was never suspended has no isActive:false
      snap.docs.forEach(d => { map[d.id] = (d.data().isActive as boolean | undefined) ?? true; });
      setActiveMap(map);
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

  const counts = {
    all: riders.length,
    pending: riders.filter(r => r.approvalStatus === 'pending').length,
    approved: riders.filter(r => r.approvalStatus === 'approved').length,
    rejected: riders.filter(r => r.approvalStatus === 'rejected').length,
  };

  const setApproval = async (riderId: string, status: 'approved' | 'rejected', approvalNote: string) => {
    setProcessing(true);
    const riderName = selected?.name ?? riderId;
    try {
      await updateDoc(doc(db, 'riders', riderId), {
        approvalStatus: status, approvalNote,
        approvedAt: status === 'approved' ? serverTimestamp() : null,
        ...(status === 'approved' ? { ridePoints: 10, totalCreditsPurchased: 10 } : {}),
      });
      if (status === 'approved') {
        await addDoc(collection(db, 'wallet_transactions'), {
          riderId, type: 'topup', credits: 10,
          packageName: 'Welcome Credits (10 free rides)',
          paymentMethod: 'admin', paymentRef: 'approval-grant',
          status: 'approved', processedBy: auth.currentUser?.uid ?? 'admin',
          createdAt: serverTimestamp(), processedAt: serverTimestamp(),
        });
        await logAdminAction('APPROVE_DRIVER', { riderId, riderName, starterCredits: 10 });
      } else {
        await logAdminAction('REJECT_DRIVER', { riderId, riderName, reason: approvalNote || 'No reason provided' });
      }
    } finally {
      setProcessing(false);
      setSelected(null);
      setNote('');
    }
  };

  // Suspend/reactivate a rider. isActive lives on users/{uid}; also force them
  // offline in the rider doc so a suspended rider stops receiving orders immediately.
  const suspend = async (riderId: string, isActive: boolean) => {
    await updateDoc(doc(db, 'users', riderId), { isActive: !isActive });
    await updateDoc(doc(db, 'riders', riderId), { isOnline: false, isAvailableForOrders: false });
    const riderName = selected?.name ?? riderId;
    await logAdminAction(isActive ? 'SUSPEND_DRIVER' : 'ACTIVATE_DRIVER', { riderId, riderName });
  };

  const giveCredits = async (riderId: string, riderName: string) => {
    const n = parseInt(creditAmount, 10);
    if (!n || n <= 0 || n > 500) { setCreditMsg({ type: 'err', text: 'Enter a number between 1 and 500.' }); return; }
    setProcessing(true);
    setCreditMsg(null);
    try {
      await updateDoc(doc(db, 'riders', riderId), { ridePoints: increment(n), totalCreditsPurchased: increment(n), updatedAt: serverTimestamp() });
      await addDoc(collection(db, 'wallet_transactions'), {
        riderId, type: 'topup', credits: n, status: 'approved',
        packageName: `Admin grant (${n} credits)`, paymentMethod: 'admin',
        paymentRef: `admin-grant-${Date.now()}`, processedBy: auth.currentUser?.uid ?? 'admin',
        createdAt: serverTimestamp(), processedAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'notifications'), {
        userId: riderId, title: `${n} credits added!`,
        body: `An admin has added ${n} credits to your DASH wallet.`,
        type: 'system', isRead: false, createdAt: new Date(),
      });
      await logAdminAction('GIVE_CREDITS', { riderId, riderName, credits: n });
      setCreditMsg({ type: 'ok', text: `${n} credits added to ${riderName}. Driver notified.` });
    } catch {
      setCreditMsg({ type: 'err', text: 'Failed to add credits. Please try again.' });
    }
    setProcessing(false);
  };

  const S = { // shared inline style tokens
    card:   { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 },
    label:  { fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.3)' },
    value:  { fontSize: 14, fontWeight: 600, color: '#fff', marginTop: 4 },
    subval: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  };

  // Live view of the open rider so balances refresh in the modal after an adjustment.
  const selectedLive = selected
    ? riders.find(r => r.id === selected.id) ?? selected
    : null;

  return (
    <>
      <div style={{ display: 'flex', height: '100%', background: '#09090c' }}>

        {/* ═══════════════════════════════════════
            LEFT — Driver list
        ═══════════════════════════════════════ */}
        <div style={{
          width: 360, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          background: '#0b0b0e',
        }}>
          {/* Header */}
          <div style={{ padding: '20px 20px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h1 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>Driver Applications</h1>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>{riders.length} registered drivers</p>
              </div>
              {counts.pending > 0 && (
                <span style={{
                  background: 'rgba(243,156,18,0.15)', color: '#F39C12',
                  border: '1px solid rgba(243,156,18,0.3)',
                  borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700,
                }}>
                  {counts.pending} pending
                </span>
              )}
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', opacity: 0.3 }}
                width="14" height="14" fill="none" stroke="#fff" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name, email, phone…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: 10, padding: '9px 12px 9px 34px',
                  color: '#fff', fontSize: 13, outline: 'none',
                }}
              />
            </div>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {(['pending', 'approved', 'rejected', 'all'] as FilterStatus[]).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  flex: 1, padding: '6px 4px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
                  background: filter === f ? '#FF3B00' : 'rgba(255,255,255,0.06)',
                  color: filter === f ? '#fff' : 'rgba(255,255,255,0.4)',
                }}>
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                  {f !== 'all' && <span style={{ marginLeft: 4, opacity: 0.7 }}>({counts[f]})</span>}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: 'rgba(255,255,255,0.25)' }}>
                <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <p style={{ fontSize: 13, margin: 0 }}>No drivers found</p>
              </div>
            ) : filtered.map(r => {
              const ss = STATUS_STYLE[r.approvalStatus] ?? STATUS_STYLE.pending;
              const isSelected = selected?.id === r.id;
              return (
                <button key={r.id} onClick={() => { setSelected(r); setNote(''); setCreditMsg(null); setActiveTab('info'); }}
                  style={{
                    width: '100%', textAlign: 'left', display: 'block',
                    background: isSelected ? 'rgba(255,59,0,0.1)' : 'rgba(255,255,255,0.03)',
                    border: isSelected ? '1px solid rgba(255,59,0,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12, padding: '12px 14px', marginBottom: 6, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {/* Avatar */}
                    <div style={{ flexShrink: 0 }}>
                      {r.profileImageUrl ? (
                        <img src={r.profileImageUrl} alt={r.name}
                          style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${ss.dot}40` }} />
                      ) : (
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(255,255,255,0.08)', border: `2px solid ${ss.dot}40`,
                          fontSize: 16, fontWeight: 700, color: ss.dot,
                        }}>
                          {(r.name?.[0] ?? '?').toUpperCase()}
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.name ?? 'Unknown'}
                        </span>
                        <StatusBadge status={r.approvalStatus} />
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.email ?? '—'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)',
                          background: 'rgba(255,255,255,0.07)', borderRadius: 6, padding: '2px 7px',
                        }}>
                          {vehicleLabel(r.preferredVehicle)}
                        </span>
                        {r.isOnline && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#27AE60' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#27AE60' }} />
                            Online
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════
            RIGHT — Driver detail
        ═══════════════════════════════════════ */}
        {selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

            {/* Hero header */}
            <div style={{
              padding: '28px 32px 24px',
              background: 'linear-gradient(180deg, rgba(255,59,0,0.05) 0%, transparent 100%)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
                {/* Large avatar */}
                <div style={{ flexShrink: 0 }}>
                  {selected.profileImageUrl ? (
                    <img src={selected.profileImageUrl} alt={selected.name}
                      style={{ width: 80, height: 80, borderRadius: 20, objectFit: 'cover', border: '2px solid rgba(255,255,255,0.12)' }} />
                  ) : (
                    <div style={{
                      width: 80, height: 80, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(255,59,0,0.12)', border: '2px solid rgba(255,59,0,0.25)',
                      fontSize: 28, fontWeight: 800, color: '#FF3B00',
                    }}>
                      {(selected.name?.[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Name + meta */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: 0 }}>{selected.name ?? 'Unknown'}</h2>
                    <StatusBadge status={selected.approvalStatus} />
                    {selected.isOnline && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#27AE60', background: 'rgba(39,174,96,0.12)', padding: '3px 10px', borderRadius: 999, border: '1px solid rgba(39,174,96,0.25)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#27AE60' }} />
                        Online Now
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{selected.email ?? '—'}</span>
                    <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{selected.phone ?? '—'}</span>
                  </div>
                </div>

                {/* Quick-action buttons */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {selected.approvalStatus === 'pending' && (
                    <>
                      <button
                        onClick={() => ask({
                          open: true, title: `Approve ${selected.name ?? 'Driver'}`,
                          message: `Approve ${selected.name ?? 'this driver'} and grant 10 starter credits. They will be notified and can go online immediately.`,
                          confirmLabel: 'Approve & Grant Credits', variant: 'success',
                          action: async () => setApproval(selected.id, 'approved', ''),
                        })}
                        disabled={processing}
                        style={{
                          padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(39,174,96,0.35)',
                          background: 'rgba(39,174,96,0.12)', color: '#27AE60', fontWeight: 700, fontSize: 13,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
                        }}
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        Approve
                      </button>
                      <button
                        onClick={() => ask({
                          open: true, title: `Reject ${selected.name ?? 'Driver'}`,
                          message: `Reject ${selected.name ?? 'this driver'}'s application. Reason: "${note || 'No reason provided'}".`,
                          confirmLabel: 'Reject Application', variant: 'danger',
                          action: async () => setApproval(selected.id, 'rejected', note),
                        })}
                        disabled={processing}
                        style={{
                          padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(231,76,60,0.35)',
                          background: 'rgba(231,76,60,0.1)', color: '#E74C3C', fontWeight: 700, fontSize: 13,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
                        }}
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Reject
                      </button>
                    </>
                  )}
                  {selected.approvalStatus !== 'pending' && (() => {
                    // isActive lives on users/{uid}, not riders/{uid} — activeMap is the live source of truth.
                    const isActive = activeMap[selected.id] ?? true;
                    return (
                    <button
                      onClick={() => ask({
                        open: true,
                        title: isActive ? `Suspend ${selected.name ?? 'Driver'}` : `Activate ${selected.name ?? 'Driver'}`,
                        message: isActive
                          ? `Suspend ${selected.name ?? 'this driver'}. They will be taken offline immediately.`
                          : `Reactivate ${selected.name ?? 'this driver'} so they can accept orders again.`,
                        confirmLabel: isActive ? 'Suspend' : 'Activate',
                        variant: isActive ? 'danger' : 'success',
                        action: async () => suspend(selected.id, isActive),
                      })}
                      style={{
                        padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        border: isActive ? '1px solid rgba(231,76,60,0.35)' : '1px solid rgba(39,174,96,0.35)',
                        background: isActive ? 'rgba(231,76,60,0.1)' : 'rgba(39,174,96,0.12)',
                        color: isActive ? '#E74C3C' : '#27AE60',
                      }}
                    >
                      {isActive ? 'Suspend' : 'Activate'}
                    </button>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 32px' }}>
              {([
                { id: 'info', label: 'Profile Info' },
                { id: 'docs', label: 'Documents', badge: DOCS.filter(d => (selected as unknown as Record<string, unknown>)[d.key]).length },
                { id: 'credits', label: 'Credits & Wallet' },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '12px 20px', borderBottom: activeTab === tab.id ? '2px solid #FF3B00' : '2px solid transparent',
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    color: activeTab === tab.id ? '#FF3B00' : 'rgba(255,255,255,0.4)',
                    display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.15s',
                  }}
                >
                  {tab.label}
                  {'badge' in tab && tab.badge > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(255,59,0,0.15)', color: '#FF3B00', padding: '1px 6px', borderRadius: 999 }}>
                      {tab.badge}/5
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>

              {/* ── INFO TAB ── */}
              {activeTab === 'info' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                  {/* Stats grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                    {[
                      { label: 'Vehicle Type', value: vehicleLabel(selected.preferredVehicle) },
                      { label: 'Deliveries', value: String(selected.totalDeliveries ?? 0) },
                      { label: 'Rating', value: selected.rating > 0 ? `${selected.rating.toFixed(1)} ★` : 'New', sub: `${selected.ratingCount ?? 0} reviews` },
                      {
                        label: 'Cash Wallet',
                        value: fmtCash(cashOf(selectedLive ?? selected)),
                        color: cashOf(selectedLive ?? selected) < 0 ? '#E74C3C' : '#27AE60',
                      },
                      {
                        label: 'Ride Points',
                        value: String(pointsOf(selectedLive ?? selected)),
                        color: pointsOf(selectedLive ?? selected) === 0 ? '#E74C3C' : pointsOf(selectedLive ?? selected) < 5 ? '#F39C12' : '#27AE60',
                      },
                    ].map(stat => (
                      <div key={stat.label} style={{ ...S.card, padding: '14px 16px' }}>
                        <div style={S.label}>{stat.label}</div>
                        <div style={{ ...S.value, color: stat.color ?? '#fff' }}>{stat.value}</div>
                        {stat.sub && <div style={S.subval}>{stat.sub}</div>}
                      </div>
                    ))}
                  </div>

                  {/* Contact info */}
                  <div style={{ ...S.card, padding: '18px 20px' }}>
                    <div style={{ ...S.label, marginBottom: 14 }}>Contact Information</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {[
                        { label: 'Full Name', value: selected.name ?? '—' },
                        { label: 'Phone', value: selected.phone ?? '—' },
                        { label: 'Email', value: selected.email ?? '—' },
                        { label: 'Licence No.', value: selected.licenseNumber ?? '—' },
                      ].map(f => (
                        <div key={f.label}>
                          <div style={S.label}>{f.label}</div>
                          <div style={S.value}>{f.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Approval note (for rejected) */}
                  {selected.approvalStatus === 'pending' && (
                    <div style={{ ...S.card, padding: '18px 20px' }}>
                      <label style={{ ...S.label, display: 'block', marginBottom: 10 }}>Rejection Note (optional)</label>
                      <textarea
                        value={note} onChange={e => setNote(e.target.value)}
                        placeholder="Enter reason for rejection — the driver will see this…"
                        rows={3}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 13,
                          resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                        }}
                      />
                    </div>
                  )}

                  {selected.approvalNote && (
                    <div style={{ ...S.card, padding: '14px 18px', borderColor: 'rgba(231,76,60,0.2)' }}>
                      <div style={{ ...S.label, color: '#E74C3C', marginBottom: 6 }}>Rejection Reason</div>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.6 }}>{selected.approvalNote}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── DOCUMENTS TAB ── */}
              {activeTab === 'docs' && (
                <div>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>
                    5 documents required. Review each carefully before approving. Click any image to enlarge.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {DOCS.map((d) => {
                      const url = (selected as unknown as Record<string, unknown>)[d.key] as string | undefined;
                      return (
                        <div key={d.key} style={{
                          ...S.card, padding: '16px 20px',
                          borderColor: url ? 'rgba(39,174,96,0.15)' : 'rgba(255,255,255,0.06)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: url ? 14 : 0 }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{d.label}</div>
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{d.hint}</div>
                            </div>
                            {url ? (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#27AE60', background: 'rgba(39,174,96,0.12)', padding: '3px 10px', borderRadius: 999 }}>
                                Uploaded
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: '#E74C3C', background: 'rgba(231,76,60,0.1)', padding: '3px 10px', borderRadius: 999 }}>
                                Missing
                              </span>
                            )}
                          </div>
                          {url && (
                            <div
                              onClick={() => setLightbox(url)}
                              style={{ cursor: 'zoom-in', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}
                            >
                              <img
                                src={url}
                                alt={d.label}
                                style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block' }}
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                              <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Click to enlarge</span>
                                <a href={url} target="_blank" rel="noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  style={{ fontSize: 11, color: '#2980B9', textDecoration: 'none', fontWeight: 600 }}>
                                  Open original ↗
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── CREDITS TAB ── */}
              {activeTab === 'credits' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Balance card */}
                  <div style={{
                    ...S.card, padding: '24px 24px',
                    background: 'linear-gradient(135deg, rgba(39,174,96,0.1), rgba(39,174,96,0.04))',
                    borderColor: 'rgba(39,174,96,0.2)',
                  }}>
                    <div style={S.label}>Current Ride Points</div>
                    <div style={{ fontSize: 48, fontWeight: 900, color: pointsOf(selectedLive ?? selected) === 0 ? '#E74C3C' : '#27AE60', lineHeight: 1, margin: '8px 0 4px' }}>
                      {pointsOf(selectedLive ?? selected)}
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>points · {selected.totalCreditsPurchased ?? 0} total purchased · {fmtCash(cashOf(selectedLive ?? selected))} cash wallet</div>
                    {pointsOf(selectedLive ?? selected) === 0 && (
                      <div style={{ marginTop: 12, fontSize: 13, color: '#E74C3C', background: 'rgba(231,76,60,0.1)', padding: '8px 12px', borderRadius: 8 }}>
                        Driver has zero ride points. Will be forced offline until topped up.
                      </div>
                    )}
                  </div>

                  {/* Add credits */}
                  <div style={{ ...S.card, padding: '20px 24px' }}>
                    <div style={{ ...S.label, marginBottom: 14 }}>Offer Ride Points Manually</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      {[5, 10, 25, 50].map(n => (
                        <button key={n} onClick={() => setCreditAmount(String(n))} style={{
                          padding: '8px 16px', borderRadius: 8, border: '1px solid',
                          borderColor: creditAmount === String(n) ? '#FF3B00' : 'rgba(255,255,255,0.1)',
                          background: creditAmount === String(n) ? 'rgba(255,59,0,0.12)' : 'rgba(255,255,255,0.04)',
                          color: creditAmount === String(n) ? '#FF3B00' : 'rgba(255,255,255,0.5)',
                          fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        }}>
                          {n}
                        </button>
                      ))}
                      <input
                        type="number" value={creditAmount}
                        onChange={e => { setCreditAmount(e.target.value); setCreditMsg(null); }}
                        min="1" max="500"
                        style={{
                          flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none',
                        }}
                      />
                    </div>
                    <button
                      onClick={() => {
                        const n = parseInt(creditAmount, 10);
                        if (!n || n <= 0 || n > 500) { setCreditMsg({ type: 'err', text: 'Enter a number between 1 and 500.' }); return; }
                        ask({
                          open: true, title: `Add ${n} Ride Points`,
                          message: `Add ${n} ride points to ${selected.name ?? 'this driver'}? Balance: ${pointsOf(selectedLive ?? selected)} → ${pointsOf(selectedLive ?? selected) + n}. Driver will be notified.`,
                          confirmLabel: `Add ${n} Points`, variant: 'success',
                          action: async () => giveCredits(selected.id, selected.name ?? 'Driver'),
                        });
                      }}
                      disabled={processing}
                      style={{
                        width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                        background: 'linear-gradient(135deg, #FF3B00, #CC2F00)', color: '#fff',
                        fontWeight: 700, fontSize: 14, cursor: 'pointer',
                        opacity: processing ? 0.6 : 1,
                      }}
                    >
                      Add {creditAmount} Ride Points
                    </button>
                    {creditMsg && (
                      <div style={{
                        marginTop: 10, fontSize: 13, fontWeight: 600,
                        color: creditMsg.type === 'ok' ? '#27AE60' : '#E74C3C',
                        background: creditMsg.type === 'ok' ? 'rgba(39,174,96,0.1)' : 'rgba(231,76,60,0.1)',
                        padding: '9px 14px', borderRadius: 8,
                      }}>
                        {creditMsg.text}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Empty state */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)' }}>
            <svg width="56" height="56" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginBottom: 16, opacity: 0.3 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px' }}>Select a driver to review</p>
            <p style={{ fontSize: 13, margin: 0 }}>Click any driver from the list to view their full application</p>
          </div>
        )}
      </div>

      {/* ── Lightbox ── */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out',
          }}
        >
          <img src={lightbox} alt="Document" style={{ maxWidth: '90%', maxHeight: '90vh', borderRadius: 12, boxShadow: '0 32px 80px rgba(0,0,0,0.8)', objectFit: 'contain' }} />
          <button onClick={() => setLightbox(null)} style={{
            position: 'fixed', top: 20, right: 20, background: 'rgba(255,255,255,0.1)', border: 'none',
            color: '#fff', width: 40, height: 40, borderRadius: '50%', fontSize: 20, cursor: 'pointer', lineHeight: '40px', textAlign: 'center',
          }}>×</button>
        </div>
      )}

      <ConfirmDialog
        open={confirm.open} title={confirm.title} message={confirm.message}
        confirmLabel={confirm.confirmLabel} variant={confirm.variant}
        loading={confirmLoading} onConfirm={runConfirmed}
        onCancel={() => setConfirm(c => ({ ...c, open: false }))}
      />
    </>
  );
}
