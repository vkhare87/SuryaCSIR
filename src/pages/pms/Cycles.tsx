import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePMS } from '../../contexts/PMSContext';
import { canAdmin } from '../../lib/pms/permissions';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import type { CycleStatus } from '../../types/pms';

interface CycleForm {
  name: string;
  startDate: string;
  endDate: string;
  status: CycleStatus;
}

const empty: CycleForm = { name: '', startDate: '', endDate: '', status: 'OPEN' };

export default function Cycles() {
  const { user } = useAuth();
  const { cycles, isLoading, createCycle, updateCycle } = usePMS();
  const navigate = useNavigate();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CycleForm>(empty);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!user || !canAdmin(user)) { navigate('/pms'); return null; }
  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const openCreate = () => {
    setForm(empty);
    setFormError(null);
    setShowCreate(true);
  };

  const openEdit = (id: string) => {
    const c = cycles.find(x => x.id === id);
    if (!c) return;
    setForm({ name: c.name, startDate: c.startDate, endDate: c.endDate, status: c.status });
    setFormError(null);
    setEditingId(id);
  };

  const closeModals = () => { setShowCreate(false); setEditingId(null); };

  const handleSave = async () => {
    if (!form.name || !form.startDate || !form.endDate) {
      setFormError('All fields required');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await updateCycle(editingId, form);
        setEditingId(null);
      } else {
        await createCycle(form);
        setShowCreate(false);
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const FormFields = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-muted mb-1">Name</label>
        <input
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">Start Date</label>
          <input
            type="date"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
            value={form.startDate}
            onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">End Date</label>
          <input
            type="date"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
            value={form.endDate}
            onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-text-muted mb-1">Status</label>
        <select
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
          value={form.status}
          onChange={e => setForm(f => ({ ...f, status: e.target.value as CycleStatus }))}
        >
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>
      {formError && <p className="text-sm text-rose-600">{formError}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={closeModals}>Cancel</Button>
        <Button isLoading={saving} onClick={handleSave}>
          {editingId ? 'Update' : 'Create'}
        </Button>
      </div>
    </div>
  );

  const statusStyle = (s: CycleStatus) => {
    if (s === 'OPEN') return 'bg-green-100 text-green-700';
    if (s === 'CLOSED') return 'bg-gray-100 text-gray-700';
    return 'bg-yellow-100 text-yellow-700';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-medium text-text">Appraisal Cycles</h1>
        <Button onClick={openCreate}>New Cycle</Button>
      </div>

      {cycles.length === 0 ? (
        <p className="text-text-muted text-sm py-8 text-center">No cycles yet.</p>
      ) : (
        <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
          {cycles.map(c => (
            <div
              key={c.id}
              className="flex items-center justify-between px-5 py-4 bg-surface hover:bg-surface-hover transition-colors"
            >
              <div>
                <p className="font-medium text-text text-sm">{c.name}</p>
                <p className="text-xs text-text-muted">{c.startDate} – {c.endDate}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle(c.status)}`}>
                  {c.status}
                </span>
                <Button variant="ghost" size="sm" onClick={() => openEdit(c.id)}>Edit</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Appraisal Cycle">
        <FormFields />
      </Modal>
      <Modal isOpen={!!editingId} onClose={() => setEditingId(null)} title="Edit Cycle">
        <FormFields />
      </Modal>
    </div>
  );
}
