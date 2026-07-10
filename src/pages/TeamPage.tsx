import { useEffect, useState } from 'react';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { collection, onSnapshot, doc, setDoc, updateDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import ConfirmDialog from '../components/ConfirmDialog';

type StaffRole = 'admin' | 'reviewer' | 'support';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  isActive: boolean;
  createdAt: { toDate?: () => Date } | Date | null;
}

const ROLE_CONFIG: Record<StaffRole, { label: string; desc: string; color: string; bg: string; permissions: string[] }> = {
  admin: {
    label: 'Admin', desc: 'Full system access',
    color: '#FF3B00', bg: 'rgba(255,59,0,0.12)',
    permissions: ['Dashboard', 'All orders', 'All drivers', 'All customers', 'Wallet approvals', 'Settings', 'Team management'],
  },
  reviewer: {
    label: 'Driver Reviewer', desc: 'Reviews driver applications',
    color: '#2980B9', bg: 'rgba(41,128,185,0.12)',
    permissions: ['View driver applications', 'Approve / reject drivers', 'View driver documents', 'Add credits to drivers'],
  },
  support: {
    label: 'Support', desc: 'Customer & order support',
    color: '#27AE60', bg: 'rgba(39,174,96,0.12)',
    permissions: ['View all orders', 'View customers', 'Cancel orders', 'View wallet requests'],
  },
};

// Secondary Firebase app — creates users without signing out the current admin
function getSecondaryAuth() {
  const cfg = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
  const existing = getApps().find(a => a.name === 'secondary');
  const secondary = existing ?? initializeApp(cfg, 'secondary');
  return getAuth(secondary);
}

function RoleBadge({ role }: { role: StaffRole }) {
  const c = ROLE_CONFIG[role];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.color,
    }}>
      {c.label}
    </span>
  );
}

export default function TeamPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'reviewer' as StaffRole });
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedRole, setSelectedRole] = useState<StaffRole | null>(null);

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

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', 'in', ['admin', 'reviewer', 'support']));
    return onSnapshot(q, snap => {
      setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() }) as StaffMember));
    });
  }, []);

  const createStaff = async () => {
    if (!form.name.trim()) { setFormError('Full name is required.'); return; }
    if (!form.email.trim()) { setFormError('Email is required.'); return; }
    if (form.password.length < 8) { setFormError('Password must be at least 8 characters.'); return; }
    setFormError('');
    setCreating(true);
    try {
      const secondaryAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email.trim(), form.password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await secondaryAuth.signOut();
      setForm({ name: '', email: '', password: '', role: 'reviewer' });
      setShowAdd(false);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/email-already-in-use') setFormError('This email is already registered.');
      else if (code === 'auth/weak-password') setFormError('Password is too weak. Use at least 8 characters.');
      else setFormError('Failed to create account. Please try again.');
    }
    setCreating(false);
  };

  const toggleActive = async (member: StaffMember) => {
    await updateDoc(doc(db, 'users', member.id), { isActive: !member.isActive, updatedAt: serverTimestamp() });
  };

  const formatDate = (v: StaffMember['createdAt']) => {
    if (!v) return '—';
    const d = typeof v === 'object' && 'toDate' in v && v.toDate ? v.toDate() : v instanceof Date ? v : null;
    if (!d) return '—';
    return d.toLocaleDateString('en-NA', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const S = {
    card: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 } as React.CSSProperties,
    label: { fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.3)', marginBottom: 7, display: 'block' as const },
    input: {
      width: '100%', boxSizing: 'border-box' as const,
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: 14, outline: 'none',
    },
  };

  return (
    <>
      <div style={{ padding: 28, minHeight: '100%', background: '#09090c' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>Team Management</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: 0 }}>
              Manage who has access to the DASH Admin Console and what they can do.
            </p>
          </div>
          <button
            onClick={() => { setShowAdd(true); setFormError(''); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #FF3B00, #CC2F00)',
              color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(255,59,0,0.25)',
            }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Add Staff Member
          </button>
        </div>

        {/* Role cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
          {(Object.entries(ROLE_CONFIG) as [StaffRole, typeof ROLE_CONFIG[StaffRole]][]).map(([role, cfg]) => {
            const count = staff.filter(s => s.role === role).length;
            return (
              <div key={role} style={{
                ...S.card, padding: '18px 20px', cursor: 'pointer',
                borderColor: selectedRole === role ? cfg.color + '40' : 'rgba(255,255,255,0.07)',
                background: selectedRole === role ? cfg.bg : 'rgba(255,255,255,0.04)',
                transition: 'all 0.15s',
              }} onClick={() => setSelectedRole(selectedRole === role ? null : role)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <RoleBadge role={role} />
                  <span style={{ fontSize: 22, fontWeight: 900, color: cfg.color }}>{count}</span>
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 12, lineHeight: 1.5 }}>{cfg.desc}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {cfg.permissions.map(p => (
                    <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                      <svg width="10" height="10" fill="none" stroke={cfg.color} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Staff table */}
        <div style={{ ...S.card, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
              {selectedRole ? `${ROLE_CONFIG[selectedRole].label}s` : 'All Staff Members'} ({selectedRole ? staff.filter(s => s.role === selectedRole).length : staff.length})
            </span>
            {selectedRole && (
              <button onClick={() => setSelectedRole(null)} style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Clear filter ×
              </button>
            )}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['Member', 'Role', 'Status', 'Added', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(selectedRole ? staff.filter(s => s.role === selectedRole) : staff).map(member => (
                <tr key={member.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: ROLE_CONFIG[member.role]?.bg ?? 'rgba(255,255,255,0.06)',
                        fontSize: 14, fontWeight: 700, color: ROLE_CONFIG[member.role]?.color ?? '#fff', flexShrink: 0,
                      }}>
                        {(member.name?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{member.name}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px' }}><RoleBadge role={member.role} /></td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                      background: member.isActive ? 'rgba(39,174,96,0.12)' : 'rgba(255,255,255,0.06)',
                      color: member.isActive ? '#27AE60' : 'rgba(255,255,255,0.3)',
                    }}>
                      {member.isActive ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
                    {formatDate(member.createdAt)}
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <button
                      onClick={() => ask({
                        open: true,
                        title: member.isActive ? `Suspend ${member.name}` : `Activate ${member.name}`,
                        message: member.isActive
                          ? `${member.name} will lose access to the Admin Console immediately.`
                          : `${member.name} will regain access to the Admin Console.`,
                        confirmLabel: member.isActive ? 'Suspend' : 'Activate',
                        variant: member.isActive ? 'danger' : 'success',
                        action: async () => toggleActive(member),
                      })}
                      style={{
                        padding: '6px 14px', borderRadius: 8, border: '1px solid',
                        borderColor: member.isActive ? 'rgba(231,76,60,0.3)' : 'rgba(39,174,96,0.3)',
                        background: member.isActive ? 'rgba(231,76,60,0.08)' : 'rgba(39,174,96,0.08)',
                        color: member.isActive ? '#E74C3C' : '#27AE60',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {member.isActive ? 'Suspend' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '48px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
                    No staff members yet. Add your first team member above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add Staff Modal ── */}
      {showAdd && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div style={{
            background: '#0f0f13', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 20, width: '100%', maxWidth: 480, padding: 28,
            boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>Add Staff Member</h2>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: '4px 0 0' }}>
                  They will receive an email to set their password.
                </p>
              </div>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Full Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. John Shilongo" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Email Address</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="john@dash.co.na" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Temporary Password</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Minimum 8 characters" style={S.input} />
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', margin: '6px 0 0' }}>
                  Share this securely. Staff should change it on first login.
                </p>
              </div>
              <div>
                <label style={S.label}>Role</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(Object.entries(ROLE_CONFIG) as [StaffRole, typeof ROLE_CONFIG[StaffRole]][]).map(([role, cfg]) => (
                    <label key={role} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
                      padding: '12px 14px', borderRadius: 10,
                      border: `1px solid ${form.role === role ? cfg.color + '40' : 'rgba(255,255,255,0.07)'}`,
                      background: form.role === role ? cfg.bg : 'rgba(255,255,255,0.03)',
                      transition: 'all 0.15s',
                    }}>
                      <input type="radio" name="role" value={role} checked={form.role === role}
                        onChange={() => setForm(f => ({ ...f, role }))} style={{ marginTop: 2, accentColor: cfg.color }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: form.role === role ? cfg.color : '#fff' }}>{cfg.label}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                          {cfg.permissions.slice(0, 3).join(' · ')}{cfg.permissions.length > 3 ? '…' : ''}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {formError && (
                <div style={{
                  padding: '10px 14px', borderRadius: 10, fontSize: 13,
                  background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.25)', color: '#E74C3C',
                }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={() => setShowAdd(false)} style={{
                  flex: 1, padding: '12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                  background: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>
                  Cancel
                </button>
                <button onClick={createStaff} disabled={creating} style={{
                  flex: 2, padding: '12px', borderRadius: 10, border: 'none',
                  background: creating ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #FF3B00, #CC2F00)',
                  color: '#fff', fontSize: 14, fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer',
                  opacity: creating ? 0.7 : 1,
                }}>
                  {creating ? 'Creating Account…' : 'Create Staff Account'}
                </button>
              </div>
            </div>
          </div>
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
