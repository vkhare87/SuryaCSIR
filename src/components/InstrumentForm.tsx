import { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { supabase } from '../utils/supabaseClient';
import { X } from 'lucide-react';
import type { Equipment } from '../types';

interface Props {
  instrument: Equipment | null;
  onClose: () => void;
}

const EMPTY: Omit<Equipment, 'UInsID'> = {
  instrument_code: '',
  Name: '',
  serial_number: '',
  manufacturer: '',
  year_of_manufacture: undefined,
  EndUse: '',
  lab_id: '',
  Division: '',
  IndenterName: '',
  owner_user_id: '',
  OperatorName: '',
  Location: '',
  amc_end_date: '',
  WorkingStatus: 'Working',
  Movable: 'No',
  RequirementInstallation: '',
  purchase_cost: undefined,
  procurement_date: '',
  Justification: '',
  Remark: '',
};

export function InstrumentForm({ instrument, onClose }: Props) {
  const { labs, staff, divisions, refreshData } = useData();

  const [form, setForm] = useState<Record<string, string | number | undefined>>(() => {
    const base = instrument ?? { UInsID: '', ...EMPTY };
    return Object.fromEntries(
      Object.entries(base).map(([k, v]) => [k, v == null ? '' : v])
    );
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field: string, value: string | number | undefined) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) { setError('Supabase not configured'); return; }
    if (!form['UInsID']) { setError('Instrument ID is required'); return; }
    if (!form['Name']) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        UInsID: form['UInsID'],
        instrument_code:     form['instrument_code'] || null,
        Name:                form['Name'],
        serial_number:       form['serial_number'] || null,
        manufacturer:        form['manufacturer'] || null,
        year_of_manufacture: form['year_of_manufacture'] ? Number(form['year_of_manufacture']) : null,
        EndUse:              form['EndUse'] || null,
        lab_id:              form['lab_id'] || null,
        Division:            form['Division'] || null,
        IndenterName:        form['IndenterName'] || null,
        owner_user_id:       form['owner_user_id'] || null,
        OperatorName:        form['OperatorName'] || null,
        Location:            form['Location'] || null,
        amc_end_date:        form['amc_end_date'] || null,
        WorkingStatus:       form['WorkingStatus'] || null,
        Movable:             form['Movable'] || null,
        RequirementInstallation: form['RequirementInstallation'] || null,
        purchase_cost:       form['purchase_cost'] ? Number(form['purchase_cost']) : null,
        procurement_date:    form['procurement_date'] || null,
        Justification:       form['Justification'] || null,
        Remark:              form['Remark'] || null,
      };
      const { error: sbErr } = await supabase.from('equipment').upsert(payload);
      if (sbErr) throw sbErr;
      await refreshData();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: string, type = 'text', required = false) => (
    <div>
      <label className="block text-xs font-semibold text-text-muted mb-1">{label}{required && ' *'}</label>
      <input
        type={type}
        value={String(form[key] ?? '')}
        onChange={e => set(key, e.target.value)}
        required={required}
        className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none"
      />
    </div>
  );

  const select = (label: string, key: string, options: { value: string; label: string }[]) => (
    <div>
      <label className="block text-xs font-semibold text-text-muted mb-1">{label}</label>
      <select
        value={String(form[key] ?? '')}
        onChange={e => set(key, e.target.value)}
        className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none appearance-none"
      >
        <option value="">— Select —</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="text-lg font-[500] text-text font-serif">
            {instrument ? 'Edit Instrument' : 'Add Instrument'}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-surface-hover rounded-full transition-colors text-text-muted">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Identification */}
          <section>
            <p className="text-[10px] font-black text-[#c96442] uppercase tracking-widest mb-3">Identification</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('Instrument ID (UInsID)', 'UInsID', 'text', true)}
              {field('Instrument Code', 'instrument_code')}
              {field('Name / Equipment', 'Name', 'text', true)}
              {field('Serial Number', 'serial_number')}
              {field('Manufacturer', 'manufacturer')}
              {field('Year of Manufacture', 'year_of_manufacture', 'number')}
            </div>
          </section>

          {/* Location */}
          <section>
            <p className="text-[10px] font-black text-[#c96442] uppercase tracking-widest mb-3">Location</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {select('Division', 'Division', divisions.map(d => ({ value: d.divCode, label: `${d.divCode} — ${d.divName}` })))}
              {select('Lab', 'lab_id', labs.map(l => ({ value: l.id, label: l.lab_name })))}
              {field('Location', 'Location')}
              {select('Movable', 'Movable', [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }])}
            </div>
          </section>

          {/* Usage */}
          <section>
            <p className="text-[10px] font-black text-[#c96442] uppercase tracking-widest mb-3">Usage</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('End Use', 'EndUse')}
              {field('Indenter / Manager Name', 'IndenterName')}
              {field('Operator Name', 'OperatorName')}
              {select('Owner (Staff)', 'owner_user_id', staff.map(s => ({ value: s.ID, label: s.Name })))}
            </div>
          </section>

          {/* Status */}
          <section>
            <p className="text-[10px] font-black text-[#c96442] uppercase tracking-widest mb-3">Status & Maintenance</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {select('Working Status', 'WorkingStatus', [
                { value: 'Working', label: 'Working' },
                { value: 'Under Maintenance', label: 'Under Maintenance' },
                { value: 'Not Working', label: 'Not Working' },
              ])}
              {field('AMC End Date', 'amc_end_date', 'date')}
              {field('Requirement / Installation', 'RequirementInstallation')}
            </div>
          </section>

          {/* Procurement */}
          <section>
            <p className="text-[10px] font-black text-[#c96442] uppercase tracking-widest mb-3">Procurement</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('Purchase Cost (₹)', 'purchase_cost', 'number')}
              {field('Procurement Date', 'procurement_date', 'date')}
              {field('Justification', 'Justification')}
            </div>
          </section>

          {/* Remarks */}
          <section>
            <p className="text-[10px] font-black text-[#c96442] uppercase tracking-widest mb-3">Remarks</p>
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">Remark</label>
              <textarea
                value={String(form['Remark'] ?? '')}
                onChange={e => set('Remark', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none resize-none"
              />
            </div>
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm bg-[#c96442] text-white rounded-lg hover:bg-[#b55a3a] transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : instrument ? 'Save Changes' : 'Add Instrument'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
