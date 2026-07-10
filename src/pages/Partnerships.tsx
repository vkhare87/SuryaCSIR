import { useMemo, useState } from 'react';
import { Handshake, ArrowRightLeft, Plus, AlertTriangle } from 'lucide-react';
import { Card, Badge } from '../components/ui/Cards';
import { Button } from '../components/ui/Button';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { expiringWithin } from '../lib/partnerships/expiry';
import { mouEvidence } from '../lib/partnerships/evidence';
import { addMoU, addTechTransfer } from '../lib/partnerships/write';
import type { MoU, TechTransfer } from '../types';

const WRITE_ROLES = ['HRAdmin', 'SystemAdmin', 'MasterAdmin'];

const MOU_STATUS_VARIANT: Record<MoU['status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  Active: 'success', 'Under Renewal': 'warning', Expired: 'danger', Terminated: 'neutral',
};

const TT_STATUS_VARIANT: Record<TechTransfer['status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  Active: 'success', Signed: 'success', 'Under Negotiation': 'warning',
  Completed: 'neutral', Terminated: 'danger',
};

export default function Partnerships() {
  const { mous, techTransfers, projects, refreshData } = useData();
  const { role } = useAuth();
  const canWrite = role ? WRITE_ROLES.includes(role) : false;
  const [tab, setTab] = useState<'mous' | 'transfers'>('mous');
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [mouForm, setMouForm] = useState({
    partnerName: '', partnerType: 'Academic' as MoU['partnerType'], purpose: '',
    signedDate: '', validUntil: '', divisionCode: '',
  });
  const [ttForm, setTtForm] = useState({
    technologyTitle: '', licensee: '', licenseeType: 'Industry' as TechTransfer['licenseeType'],
    agreementType: 'License' as TechTransfer['agreementType'], agreementDate: '',
    valueLakhs: '', divisionCode: '',
  });

  const expiring = useMemo(() => expiringWithin(mous, 90), [mous]);
  const evidenceById = useMemo(
    () => new Map(mous.map(m => [m.id, mouEvidence(m, projects, techTransfers)])),
    [mous, projects, techTransfers],
  );
  const totalValue = useMemo(
    () => techTransfers.filter(t => t.status !== 'Terminated')
      .reduce((s, t) => s + (t.valueLakhs ?? 0), 0),
    [techTransfers],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    const res = tab === 'mous'
      ? await addMoU({ ...mouForm, status: 'Active' })
      : await addTechTransfer({
          ...ttForm,
          valueLakhs: ttForm.valueLakhs ? parseFloat(ttForm.valueLakhs) : undefined,
          status: 'Signed',
        });
    setSaving(false);
    if (!res.ok) { setFormError(res.error); return; }
    setShowForm(false);
    setMouForm({ partnerName: '', partnerType: 'Academic', purpose: '', signedDate: '', validUntil: '', divisionCode: '' });
    setTtForm({ technologyTitle: '', licensee: '', licenseeType: 'Industry', agreementType: 'License', agreementDate: '', valueLakhs: '', divisionCode: '' });
    await refreshData();
  }

  const inputCls = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted';

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-text">
            <Handshake className="h-6 w-6 text-text-muted" /> Partnerships
          </h1>
          <p className="text-sm text-text-muted">
            MOUs with external organisations and technology-transfer agreements.
          </p>
        </div>
        {canWrite && (
          <Button size="sm" variant="secondary" onClick={() => { setShowForm(v => !v); setFormError(''); }}>
            <Plus size={14} className="mr-1" /> {showForm ? 'Cancel' : tab === 'mous' ? 'Add MOU' : 'Add Transfer'}
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => { setTab('mous'); setShowForm(false); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'mous' ? 'bg-[#c96442] text-white' : 'text-text-muted hover:text-text'}`}
        >
          MOUs ({mous.length})
        </button>
        <button
          onClick={() => { setTab('transfers'); setShowForm(false); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'transfers' ? 'bg-[#c96442] text-white' : 'text-text-muted hover:text-text'}`}
        >
          <span className="inline-flex items-center gap-1">
            <ArrowRightLeft className="h-3.5 w-3.5" /> Tech Transfers ({techTransfers.length})
          </span>
        </button>
      </div>

      {tab === 'mous' && expiring.length > 0 && (
        <Card className="p-4 border-l-4 border-l-[#c96442]">
          <div className="flex items-center gap-2 text-sm font-medium text-text mb-1">
            <AlertTriangle className="h-4 w-4 text-[#c96442]" /> Expiring within 90 days
          </div>
          <ul className="text-sm text-text-muted space-y-0.5">
            {expiring.map(m => (
              <li key={m.id}>{m.partnerName} — valid until {m.validUntil}</li>
            ))}
          </ul>
        </Card>
      )}

      {showForm && canWrite && (
        <Card className="p-5">
          <form onSubmit={submit} className="grid grid-cols-2 gap-3">
            {tab === 'mous' ? (
              <>
                <input required placeholder="Partner organisation" className={inputCls}
                  value={mouForm.partnerName} onChange={e => setMouForm(f => ({ ...f, partnerName: e.target.value }))} />
                <select className={inputCls} value={mouForm.partnerType}
                  onChange={e => setMouForm(f => ({ ...f, partnerType: e.target.value as MoU['partnerType'] }))}>
                  {['Academic', 'Industry', 'Government', 'International', 'Other'].map(t => <option key={t}>{t}</option>)}
                </select>
                <input placeholder="Purpose / scope" className={`${inputCls} col-span-2`}
                  value={mouForm.purpose} onChange={e => setMouForm(f => ({ ...f, purpose: e.target.value }))} />
                <label className="text-xs text-text-muted">Signed date
                  <input type="date" className={inputCls} value={mouForm.signedDate}
                    onChange={e => setMouForm(f => ({ ...f, signedDate: e.target.value }))} />
                </label>
                <label className="text-xs text-text-muted">Valid until
                  <input type="date" className={inputCls} value={mouForm.validUntil}
                    onChange={e => setMouForm(f => ({ ...f, validUntil: e.target.value }))} />
                </label>
                <input placeholder="Division code (optional)" className={inputCls}
                  value={mouForm.divisionCode} onChange={e => setMouForm(f => ({ ...f, divisionCode: e.target.value }))} />
              </>
            ) : (
              <>
                <input required placeholder="Technology title" className={inputCls}
                  value={ttForm.technologyTitle} onChange={e => setTtForm(f => ({ ...f, technologyTitle: e.target.value }))} />
                <input required placeholder="Licensee / partner firm" className={inputCls}
                  value={ttForm.licensee} onChange={e => setTtForm(f => ({ ...f, licensee: e.target.value }))} />
                <select className={inputCls} value={ttForm.licenseeType}
                  onChange={e => setTtForm(f => ({ ...f, licenseeType: e.target.value as TechTransfer['licenseeType'] }))}>
                  {['Industry', 'Startup', 'PSU', 'Government', 'Other'].map(t => <option key={t}>{t}</option>)}
                </select>
                <select className={inputCls} value={ttForm.agreementType}
                  onChange={e => setTtForm(f => ({ ...f, agreementType: e.target.value as TechTransfer['agreementType'] }))}>
                  {['License', 'Know-how Transfer', 'Joint Development', 'Consultancy', 'Sponsored'].map(t => <option key={t}>{t}</option>)}
                </select>
                <label className="text-xs text-text-muted">Agreement date
                  <input type="date" className={inputCls} value={ttForm.agreementDate}
                    onChange={e => setTtForm(f => ({ ...f, agreementDate: e.target.value }))} />
                </label>
                <input type="number" min="0" step="0.01" placeholder="Value (₹ lakhs)" className={inputCls}
                  value={ttForm.valueLakhs} onChange={e => setTtForm(f => ({ ...f, valueLakhs: e.target.value }))} />
                <input placeholder="Division code (optional)" className={inputCls}
                  value={ttForm.divisionCode} onChange={e => setTtForm(f => ({ ...f, divisionCode: e.target.value }))} />
              </>
            )}
            {formError && <p className="col-span-2 text-sm text-danger">{formError}</p>}
            <div className="col-span-2">
              <Button size="sm" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </form>
        </Card>
      )}

      {tab === 'mous' ? (
        <Card className="p-5">
          {mous.length === 0 ? (
            <p className="text-sm text-text-muted">No MOUs recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="py-1 pr-2">Partner</th>
                  <th className="py-1 pr-2">Type</th>
                  <th className="py-1 pr-2">Purpose</th>
                  <th className="py-1 pr-2">Signed</th>
                  <th className="py-1 pr-2">Valid Until</th>
                  <th className="py-1 pr-2">Status</th>
                  <th className="py-1" title="Linked/sponsored projects and tech transfers inside the validity window — inferred, verify before a renewal call">
                    Realised outputs
                  </th>
                </tr>
              </thead>
              <tbody>
                {mous.map(m => {
                  const ev = evidenceById.get(m.id);
                  return (
                    <tr key={m.id} className="border-t border-border text-text">
                      <td className="py-1.5 pr-2 font-medium">{m.partnerName}</td>
                      <td className="py-1.5 pr-2">{m.partnerType}</td>
                      <td className="py-1.5 pr-2 text-text-muted">{m.purpose}</td>
                      <td className="py-1.5 pr-2">{m.signedDate}</td>
                      <td className="py-1.5 pr-2">{m.validUntil}</td>
                      <td className="py-1.5 pr-2"><Badge variant={MOU_STATUS_VARIANT[m.status]}>{m.status}</Badge></td>
                      <td className="py-1.5 text-text-muted">
                        {ev && ev.total > 0
                          ? [
                              ev.linkedProject || ev.sponsoredProjects.length
                                ? `${(ev.linkedProject ? 1 : 0) + ev.sponsoredProjects.length} project(s)`
                                : null,
                              ev.techTransfers.length ? `${ev.techTransfers.length} transfer(s)` : null,
                            ].filter(Boolean).join(', ')
                          : 'none recorded'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-text-muted">
            Cumulative agreement value (non-terminated): <span className="font-medium text-text">₹{totalValue.toLocaleString('en-IN')} lakhs</span>
          </div>
          <Card className="p-5">
            {techTransfers.length === 0 ? (
              <p className="text-sm text-text-muted">No technology transfers recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                    <th className="py-1 pr-2">Technology</th>
                    <th className="py-1 pr-2">Licensee</th>
                    <th className="py-1 pr-2">Agreement</th>
                    <th className="py-1 pr-2">Date</th>
                    <th className="py-1 pr-2">Value (₹L)</th>
                    <th className="py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {techTransfers.map(t => (
                    <tr key={t.id} className="border-t border-border text-text">
                      <td className="py-1.5 pr-2 font-medium">{t.technologyTitle}</td>
                      <td className="py-1.5 pr-2">{t.licensee} <span className="text-xs text-text-muted">({t.licenseeType})</span></td>
                      <td className="py-1.5 pr-2">{t.agreementType}</td>
                      <td className="py-1.5 pr-2">{t.agreementDate}</td>
                      <td className="py-1.5 pr-2">{t.valueLakhs != null ? t.valueLakhs.toLocaleString('en-IN') : '—'}</td>
                      <td className="py-1.5"><Badge variant={TT_STATUS_VARIANT[t.status]}>{t.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
