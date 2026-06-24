import { useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { CreditPackage } from '../types';

const empty = { name: '', creditsAmount: 0, priceNAD: 0, description: '', sortOrder: 1, isActive: true };

export default function PackagesPage() {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return onSnapshot(collection(db, 'credit_packages'), snap => {
      setPackages(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CreditPackage).sort((a, b) => a.sortOrder - b.sortOrder));
    });
  }, []);

  const save = async () => {
    if (!form.name || !form.creditsAmount || !form.priceNAD) return;
    setSaving(true);
    if (editing) {
      await updateDoc(doc(db, 'credit_packages', editing), { ...form });
    } else {
      await addDoc(collection(db, 'credit_packages'), { ...form, createdAt: serverTimestamp() });
    }
    setForm(empty);
    setEditing(null);
    setSaving(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    await updateDoc(doc(db, 'credit_packages', id), { isActive: !current });
  };

  const del = async (id: string) => {
    if (!confirm('Delete this package?')) return;
    await deleteDoc(doc(db, 'credit_packages', id));
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Credit Packages</h1>
        <p className="text-gray-400 text-sm mt-1">Manage the packages riders see when topping up</p>
      </div>

      {/* Form */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
        <h2 className="text-white font-semibold">{editing ? 'Edit Package' : 'Add New Package'}</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Starter' },
            { key: 'description', label: 'Description', type: 'text', placeholder: 'Short description' },
            { key: 'creditsAmount', label: 'Credits', type: 'number', placeholder: '10' },
            { key: 'priceNAD', label: 'Price (N$)', type: 'number', placeholder: '50' },
            { key: 'sortOrder', label: 'Sort Order', type: 'number', placeholder: '1' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-gray-400 text-xs block mb-1">{f.label}</label>
              <input type={f.type} value={(form as Record<string, unknown>)[f.key] as string | number} placeholder={f.placeholder}
                onChange={e => setForm(p => ({ ...p, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={save} disabled={saving}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : editing ? 'Update Package' : 'Add Package'}
          </button>
          {editing && <button onClick={() => { setEditing(null); setForm(empty); }} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm">Cancel</button>}
        </div>
      </div>

      {/* Packages table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">Credits</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Per Credit</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {packages.map(p => (
              <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{p.name}</div>
                  <div className="text-gray-500 text-xs">{p.description}</div>
                </td>
                <td className="px-4 py-3 text-green-400 font-semibold">{p.creditsAmount}</td>
                <td className="px-4 py-3 text-white">N${p.priceNAD}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">N${(p.priceNAD / p.creditsAmount).toFixed(2)}/cr</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(p.id, p.isActive)}
                    className={`text-xs px-2 py-0.5 rounded-full border ${p.isActive ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-gray-700 text-gray-400 border-gray-600'}`}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3 flex gap-3">
                  <button onClick={() => { setEditing(p.id); setForm({ name: p.name, creditsAmount: p.creditsAmount, priceNAD: p.priceNAD, description: p.description, sortOrder: p.sortOrder, isActive: p.isActive }); }}
                    className="text-xs text-blue-400 hover:text-blue-300 underline">Edit</button>
                  <button onClick={() => del(p.id)} className="text-xs text-red-400 hover:text-red-300 underline">Delete</button>
                </td>
              </tr>
            ))}
            {packages.length === 0 && <tr><td colSpan={6} className="text-center text-gray-500 py-8">No packages yet — add one above</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
