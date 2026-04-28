import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePMS } from '../../contexts/PMSContext';
import { canAdmin } from '../../lib/pms/permissions';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import type { CollegiumMemberRole } from '../../types/pms';

interface CollegiumForm {
  name: string;
  description: string;
  cycleId: string;
}

interface MemberForm {
  userId: string;
  role: CollegiumMemberRole;
}

export default function Collegiums() {
  const { user } = useAuth();
  const { cycles, collegiums, isLoading, createCollegium, addCollegiumMember, removeCollegiumMember } = usePMS();
  const navigate = useNavigate();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedCollegiumId, setSelectedCollegiumId] = useState<string | null>(null);
  const [collegiumForm, setCollegiumForm] = useState<CollegiumForm>({ name: '', description: '', cycleId: '' });
  const [memberForm, setMemberForm] = useState<MemberForm>({ userId: '', role: 'MEMBER' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!user || !canAdmin(user)) { navigate('/pms'); return null; }
  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const selectedCollegium = collegiums.find(c => c.id === selectedCollegiumId);

  const handleCreateCollegium = async () => {
    if (!collegiumForm.name || !collegiumForm.cycleId) {
      setFormError('Name and cycle required');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createCollegium({
        name: collegiumForm.name,
        description: collegiumForm.description || null,
        cycleId: collegiumForm.cycleId,
      });
      setShowCreate(false);
      setCollegiumForm({ name: '', description: '', cycleId: '' });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!memberForm.userId || !selectedCollegiumId) {
      setFormError('User ID required');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await addCollegiumMember(selectedCollegiumId, memberForm.userId, memberForm.role);
      setMemberForm({ userId: '', role: 'MEMBER' });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to add member');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await removeCollegiumMember(memberId);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-medium text-text">Collegiums</h1>
        <Button onClick={() => { setCollegiumForm({ name: '', description: '', cycleId: cycles[0]?.id ?? '' }); setFormError(null); setShowCreate(true); }}>
          New Collegium
        </Button>
      </div>

      {collegiums.length === 0 ? (
        <p className="text-text-muted text-sm py-8 text-center">No collegiums yet.</p>
      ) : (
        <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
          {collegiums.map(col => {
            const cycle = cycles.find(c => c.id === col.cycleId);
            return (
              <div
                key={col.id}
                className="flex items-center justify-between px-5 py-4 bg-surface hover:bg-surface-hover transition-colors cursor-pointer"
                onClick={() => setSelectedCollegiumId(col.id)}
              >
                <div>
                  <p className="font-medium text-text text-sm">{col.name}</p>
                  <p className="text-xs text-text-muted">
                    {cycle?.name ?? col.cycleId} · {col.members?.length ?? 0} member{(col.members?.length ?? 0) !== 1 ? 's' : ''}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setSelectedCollegiumId(col.id); }}>
                  Manage
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Collegium Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Collegium">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Name</label>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
              value={collegiumForm.name}
              onChange={e => setCollegiumForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Description</label>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
              value={collegiumForm.description}
              onChange={e => setCollegiumForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Cycle</label>
            <select
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
              value={collegiumForm.cycleId}
              onChange={e => setCollegiumForm(f => ({ ...f, cycleId: e.target.value }))}
            >
              <option value="">Select cycle…</option>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {formError && <p className="text-sm text-rose-600">{formError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button isLoading={saving} onClick={handleCreateCollegium}>Create</Button>
          </div>
        </div>
      </Modal>

      {/* Manage Members Modal */}
      <Modal
        isOpen={!!selectedCollegium}
        onClose={() => { setSelectedCollegiumId(null); setFormError(null); }}
        title={selectedCollegium?.name ?? ''}
        className="max-w-2xl"
      >
        <div className="space-y-5">
          {/* Members list */}
          <div>
            <h3 className="text-sm font-semibold text-text mb-3">Members</h3>
            {!selectedCollegium?.members?.length ? (
              <p className="text-sm text-text-muted">No members yet.</p>
            ) : (
              <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                {selectedCollegium.members.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm text-text font-mono">{m.userId}</p>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${m.role === 'CHAIRMAN' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        {m.role}
                      </span>
                    </div>
                    <Button variant="danger" size="sm" onClick={() => handleRemoveMember(m.id)}>Remove</Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add member form */}
          <div>
            <h3 className="text-sm font-semibold text-text mb-3">Add Member</h3>
            <div className="flex gap-2">
              <input
                placeholder="User ID (UUID)"
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background text-text font-mono"
                value={memberForm.userId}
                onChange={e => setMemberForm(f => ({ ...f, userId: e.target.value }))}
              />
              <select
                className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
                value={memberForm.role}
                onChange={e => setMemberForm(f => ({ ...f, role: e.target.value as CollegiumMemberRole }))}
              >
                <option value="MEMBER">Member</option>
                <option value="CHAIRMAN">Chairman</option>
              </select>
              <Button isLoading={saving} onClick={handleAddMember}>Add</Button>
            </div>
            {formError && <p className="text-sm text-rose-600 mt-2">{formError}</p>}
          </div>
        </div>
      </Modal>
    </div>
  );
}
