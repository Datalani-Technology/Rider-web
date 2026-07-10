import { useEffect, useState } from 'react';
import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  writeBatch,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { AppConfig, CreditPackage } from '../types';

// ─── Professional credit pricing ─────────────────────────────────────────────
// 1 credit = 1 delivery acceptance
// Based on 5km avg delivery @ N$10/km = N$50 fare | Rider earns 70% = N$35
// Credit price chosen so rider nets ≥ N$20 per delivery (sustainable gig income)
const PROFESSIONAL_PACKAGES: Omit<CreditPackage, 'id'>[] = [
  {
    name: 'Starter',
    creditsAmount: 5,
    priceNAD: 65,
    isActive: true,
    description: 'Perfect to get started — 5 deliveries at N$13/credit',
    sortOrder: 1,
  },
  {
    name: 'Standard',
    creditsAmount: 10,
    priceNAD: 120,
    isActive: true,
    description: 'Most popular choice — 10 deliveries at N$12/credit',
    sortOrder: 2,
  },
  {
    name: 'Pro',
    creditsAmount: 25,
    priceNAD: 275,
    isActive: true,
    description: 'Best value for serious riders — 25 deliveries at N$11/credit',
    sortOrder: 3, // sortOrder 3 gets "BEST VALUE" badge in the rider app
  },
  {
    name: 'Full-Time',
    creditsAmount: 60,
    priceNAD: 600,
    isActive: true,
    description: 'For full-time riders — 60 deliveries at N$10/credit',
    sortOrder: 4,
  },
];

const defaultConfig: AppConfig = {
  maintenanceMode: false,
  commissionRate: 0.15,
  creditLimit: 0,
  adminEmail: '',
  paymentEwalletNumber: '',
  paymentEwalletName: 'DASH Delivery',
  paymentBankName: '',
  paymentAccountNumber: '',
  paymentBranchCode: '',
};

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [seedingPkgs, setSeedingPkgs] = useState(false);
  const [pkgMsg, setPkgMsg] = useState('');

  // NOTE: the mobile app reads config from appConfig/settings — this MUST match, or
  // commission, credit limit and maintenance mode won't take effect in the app.
  useEffect(() => {
    getDoc(doc(db, 'appConfig', 'settings')).then(snap => {
      if (snap.exists()) setConfig(prev => ({ ...prev, ...snap.data() }));
    });
    loadPackages();
  }, []);

  const loadPackages = async () => {
    const snap = await getDocs(collection(db, 'credit_packages'));
    const pkgs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }) as CreditPackage)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    setPackages(pkgs);
  };

  const save = async () => {
    setSaving(true);
    await setDoc(doc(db, 'appConfig', 'settings'), { ...config, updatedAt: serverTimestamp() }, { merge: true });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const commissionPercent = Math.round((config.commissionRate ?? 0.15) * 100);

  const reseedPackages = async () => {
    setSeedingPkgs(true);
    setPkgMsg('');
    try {
      // Delete all existing packages
      const existing = await getDocs(collection(db, 'credit_packages'));
      if (!existing.empty) {
        const batch = writeBatch(db);
        existing.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      // Create professional packages
      await Promise.all(
        PROFESSIONAL_PACKAGES.map(pkg =>
          addDoc(collection(db, 'credit_packages'), { ...pkg, createdAt: serverTimestamp() })
        )
      );
      await loadPackages();
      setPkgMsg('✓ Credit packages updated with professional pricing');
    } catch {
      setPkgMsg('✗ Failed to update packages. Try again.');
    }
    setSeedingPkgs(false);
  };

  const PER_CREDIT = (priceNAD: number, credits: number) =>
    (priceNAD / credits).toFixed(2);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 text-sm mt-1">App configuration, payment details and credit pricing</p>
      </div>

      {/* ── Admin Notifications Email ── */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h2 className="text-white font-semibold mb-1">Admin Notifications Email</h2>
        <p className="text-gray-500 text-xs mb-4">
          Receive email alerts for new rider approvals and credit top-up requests.
          Requires the <a href="https://extensions.dev/extensions/firebase/firestore-send-email" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline">Firebase Trigger Email Extension</a>.
        </p>
        <div>
          <label className="text-gray-400 text-xs block mb-1">Admin Email Address</label>
          <input
            type="email"
            value={config.adminEmail ?? ''}
            onChange={e => setConfig(p => ({ ...p, adminEmail: e.target.value }))}
            placeholder="e.g. admin@dash.co.na"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500 placeholder-gray-600"
          />
          <p className="text-gray-600 text-xs mt-1.5">
            You'll be emailed when: a new rider registers (needs approval) or a rider submits a top-up request.
          </p>
        </div>
      </div>

      {/* ── App Status ── */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h2 className="text-white font-semibold mb-1">App Status</h2>
        <p className="text-gray-500 text-xs mb-4">Maintenance mode blocks all new orders and displays a notice to users</p>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-white text-sm font-medium">Maintenance Mode</div>
            <div className="text-gray-400 text-xs mt-0.5">
              {config.maintenanceMode ? '🔴 App is currently offline for users' : '🟢 App is live and accepting orders'}
            </div>
          </div>
          <button
            onClick={() => setConfig(p => ({ ...p, maintenanceMode: !p.maintenanceMode }))}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${config.maintenanceMode ? 'bg-red-500' : 'bg-gray-600'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${config.maintenanceMode ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {/* Commission & wallet */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
        <h2 className="text-white font-semibold">Commission &amp; Wallet</h2>
        <p className="text-gray-400 text-xs">
          The platform commission is charged from a rider&apos;s cash wallet after each completed
          ride — unless they use a ride point (free ride). The credit limit is the lowest cash
          balance a rider may go online at (may be negative to extend credit).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-gray-400 text-xs block mb-1">Commission (% of fare)</label>
            <div className="relative">
              <input
                type="number" min={0} max={100} value={commissionPercent}
                onChange={e => setConfig(p => ({ ...p, commissionRate: (parseFloat(e.target.value) || 0) / 100 }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-8 text-white text-sm focus:outline-none focus:border-red-500"
              />
              <span className="absolute right-3 top-2 text-gray-500 text-sm">%</span>
            </div>
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Credit limit (N$)</label>
            <input
              type="number" value={config.creditLimit ?? 0}
              onChange={e => setConfig(p => ({ ...p, creditLimit: parseFloat(e.target.value) || 0 }))}
              placeholder="e.g. 0 or -50"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
            />
          </div>
        </div>
      </div>

      {/* ── Payment Details ── */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-5">
        <div>
          <h2 className="text-white font-semibold">Payment Details</h2>
          <p className="text-gray-400 text-xs mt-1">
            These are displayed to riders on the Top-Up screen when they purchase credits.
            Fill in your actual payment information so riders know where to send money.
          </p>
        </div>

        {/* eWallet */}
        <div className="space-y-3">
          <div className="text-gray-300 text-xs font-semibold uppercase tracking-wider">MTC eWallet</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-gray-400 text-xs block mb-1">eWallet Number</label>
              <input
                value={config.paymentEwalletNumber ?? ''}
                onChange={e => setConfig(p => ({ ...p, paymentEwalletNumber: e.target.value }))}
                placeholder="e.g. 081 123 4567"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500 placeholder-gray-600"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">Account Name</label>
              <input
                value={config.paymentEwalletName ?? ''}
                onChange={e => setConfig(p => ({ ...p, paymentEwalletName: e.target.value }))}
                placeholder="e.g. DASH Delivery"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500 placeholder-gray-600"
              />
            </div>
          </div>
        </div>

        {/* Bank */}
        <div className="space-y-3 pt-3 border-t border-gray-800">
          <div className="text-gray-300 text-xs font-semibold uppercase tracking-wider">EFT / Bank Transfer</div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'paymentBankName', label: 'Bank Name', placeholder: 'e.g. FNB Namibia' },
              { key: 'paymentAccountNumber', label: 'Account Number', placeholder: 'e.g. 6234567890' },
              { key: 'paymentBranchCode', label: 'Branch Code', placeholder: 'e.g. 282672' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-gray-400 text-xs block mb-1">{f.label}</label>
                <input
                  value={(config as unknown as Record<string, string>)[f.key] ?? ''}
                  placeholder={f.placeholder}
                  onChange={e => setConfig(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500 placeholder-gray-600"
                />
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors text-sm"
        >
          {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Payment Details'}
        </button>
      </div>

      {/* ── Credit Packages ── */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-white font-semibold">Credit Packages</h2>
            <p className="text-gray-400 text-xs mt-1">
              Packages riders can purchase. 1 credit = 1 delivery acceptance.
              Based on N$12/credit average — rider nets ~N$23 per delivery after credit cost.
            </p>
          </div>
          <button
            onClick={reseedPackages}
            disabled={seedingPkgs}
            className="text-xs px-3 py-1.5 bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/30 rounded-lg font-medium disabled:opacity-50 transition-colors whitespace-nowrap ml-4"
          >
            {seedingPkgs ? 'Updating…' : '↺ Reset to Standard Pricing'}
          </button>
        </div>

        {pkgMsg && (
          <div className={`text-xs px-3 py-2 rounded-lg ${pkgMsg.startsWith('✓') ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            {pkgMsg}
          </div>
        )}

        {packages.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800/50 text-gray-400 text-xs">
                  <th className="px-4 py-2.5 text-left font-medium">Package</th>
                  <th className="px-4 py-2.5 text-left font-medium">Credits</th>
                  <th className="px-4 py-2.5 text-left font-medium">Price (N$)</th>
                  <th className="px-4 py-2.5 text-left font-medium">Per Credit</th>
                  <th className="px-4 py-2.5 text-left font-medium">Rider Earns</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((pkg, i) => {
                  const perCredit = parseFloat(PER_CREDIT(pkg.priceNAD, pkg.creditsAmount));
                  const riderNet = 35 - perCredit; // N$35 avg earnings - credit cost
                  return (
                    <tr key={pkg.id} className={`border-t border-gray-800/50 ${i % 2 === 0 ? '' : 'bg-gray-800/20'}`}>
                      <td className="px-4 py-3">
                        <div className="text-white font-medium">{pkg.name}</div>
                        <div className="text-gray-500 text-xs mt-0.5">{pkg.description}</div>
                      </td>
                      <td className="px-4 py-3 text-white font-semibold">{pkg.creditsAmount}</td>
                      <td className="px-4 py-3 text-white">N${pkg.priceNAD.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className="text-yellow-400 font-medium">N${perCredit.toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={riderNet >= 20 ? 'text-green-400' : 'text-orange-400'}>
                          ~N${riderNet.toFixed(0)}/delivery
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${pkg.isActive ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-gray-700 text-gray-500 border-gray-600'}`}>
                          {pkg.isActive ? 'Active' : 'Hidden'}
                        </span>
                        {pkg.sortOrder === 3 && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-medium">
                            BEST VALUE
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 text-sm">
            No packages configured. Click "Reset to Standard Pricing" to set up the professional credit packages.
          </div>
        )}

        <div className="bg-gray-800/50 rounded-lg p-4 text-xs text-gray-400 space-y-1">
          <div className="text-gray-300 font-medium mb-2">Pricing logic (per delivery, 5km avg Sedan order)</div>
          <div>Customer pays: <span className="text-white">N$50</span></div>
          <div>Platform commission (15%): <span className="text-green-400">N$7.50</span> + credit revenue</div>
          <div>Driver earns (85%): <span className="text-white">N$42.50</span> − credit cost</div>
          <div className="pt-1 border-t border-gray-700 text-gray-500">
            At N$12/credit → Driver nets N$30.50/delivery · Platform earns N$19.50/delivery
          </div>
        </div>
      </div>
    </div>
  );
}
