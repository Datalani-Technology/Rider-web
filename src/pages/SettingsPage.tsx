import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { AppConfig } from '../types';

const defaultConfig: AppConfig = {
  maintenanceMode: false,
  commissionRate: 0.15,
  creditLimit: 0,
  paymentEwallet: '',
  paymentEwalletName: 'Datalani Technology CC',
  paymentBankName: '',
  paymentAccountNumber: '',
  paymentBranchCode: '',
};

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // NOTE: the mobile app reads config from appConfig/settings — this MUST match, or
  // commission, credit limit and maintenance mode won't take effect in the app.
  useEffect(() => {
    getDoc(doc(db, 'appConfig', 'settings')).then(snap => {
      if (snap.exists()) setConfig(prev => ({ ...prev, ...snap.data() }));
    });
  }, []);

  const save = async () => {
    setSaving(true);
    await setDoc(doc(db, 'appConfig', 'settings'), { ...config, updatedAt: serverTimestamp() }, { merge: true });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const commissionPercent = Math.round((config.commissionRate ?? 0.15) * 100);

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 text-sm mt-1">App configuration and payment details</p>
      </div>

      {/* Maintenance mode */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h2 className="text-white font-semibold mb-4">App Status</h2>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-white text-sm">Maintenance Mode</div>
            <div className="text-gray-400 text-xs mt-0.5">When on, customers see a maintenance banner and cannot place orders</div>
          </div>
          <button
            onClick={() => setConfig(p => ({ ...p, maintenanceMode: !p.maintenanceMode }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.maintenanceMode ? 'bg-red-500' : 'bg-gray-600'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.maintenanceMode ? 'translate-x-6' : 'translate-x-1'}`} />
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

      {/* Payment details */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
        <h2 className="text-white font-semibold">Payment Details</h2>
        <p className="text-gray-400 text-xs">These are shown to riders on the Top-Up screen when purchasing credits.</p>

        <div className="space-y-3">
          <div>
            <label className="text-gray-400 text-xs block mb-1">MTC eWallet Number</label>
            <input value={config.paymentEwallet ?? ''} onChange={e => setConfig(p => ({ ...p, paymentEwallet: e.target.value }))}
              placeholder="e.g. 081 123 4567"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">eWallet Account Name</label>
            <input value={config.paymentEwalletName ?? ''} onChange={e => setConfig(p => ({ ...p, paymentEwalletName: e.target.value }))}
              placeholder="e.g. Datalani Technology CC"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
            />
          </div>
          <div className="border-t border-gray-800 pt-3">
            <div className="text-gray-400 text-xs mb-2">EFT / Bank Transfer</div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'paymentBankName', label: 'Bank Name', placeholder: 'e.g. FNB Namibia' },
                { key: 'paymentAccountNumber', label: 'Account Number', placeholder: 'e.g. 6234567890' },
                { key: 'paymentBranchCode', label: 'Branch Code', placeholder: 'e.g. 282672' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-gray-400 text-xs block mb-1">{f.label}</label>
                  <input value={(config as unknown as Record<string, unknown>)[f.key] as string ?? ''} placeholder={f.placeholder}
                    onChange={e => setConfig(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="px-6 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors text-sm">
        {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}
