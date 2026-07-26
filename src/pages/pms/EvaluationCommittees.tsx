import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePMS } from '../../contexts/PMSContext';
import { canAdmin, isEmpoweredCommitteeValid, isPanelValid } from '../../lib/pms/permissions';
import { COMMITTEE_TIERS } from '../../lib/pms/constants';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { UserPicker } from '../../components/ui/UserPicker';
import { useUserDirectory } from '../../hooks/useUserDirectory';
import type { CommitteeMemberRole, CommitteeTier } from '../../types/pms';

interface CommitteeForm {
  name: string;
  description: string;
  cycleId: string;
  tier: CommitteeTier;
}

interface MemberForm {
  userId: string;
  userLabel: string;
  role: CommitteeMemberRole;
}

const ROLE_LABELS: Record<CommitteeMemberRole, string> = {
  REPORTING_OFFICER: 'Reporting Officer',
  REVIEWING_OFFICER: 'Reviewing Officer',
  EC_MEMBER: 'Empowered Committee Member',
};

const TIER_LABELS: Record<CommitteeTier, string> = {
  I:   'Committee I — Scientists B, C, D',
  II:  'Committee II — Scientist E',
  III: 'Committee III — Scientist F',
  IV:  'Committee IV — Scientist G (Annexure-I)',
};

export default function EvaluationCommittees() {
  const { user } = useAuth();
  const {
    cycles, committees, empoweredMembers, grievanceMembers, isLoading,
    createCommittee, addCommitteeMember, removeCommitteeMember,
    addEmpoweredMember, removeEmpoweredMember,
    addGrievanceMember, removeGrievanceMember,
  } = usePMS();
  const navigate = useNavigate();
  const { users: directory } = useUserDirectory();
  const labelFor = (userId: string) => {
    const u = directory.find(d => d.userId === userId);
    return u ? (u.name ?? u.email ?? userId) : userId;
  };

  const [showCreate, setShowCreate] = useState(false);
  const [selectedCommitteeId, setSelectedCommitteeId] = useState<string | null>(null);
  const [committeeForm, setCommitteeForm] = useState<CommitteeForm>({ name: '', description: '', cycleId: '', tier: 'I' });
  const [memberForm, setMemberForm] = useState<MemberForm>({ userId: '', userLabel: '', role: 'EC_MEMBER' });
  const [configCycleId, setConfigCycleId] = useState('');
  const [empoweredForm, setEmpoweredForm] = useState({ userId: '', userLabel: '', isChairman: false });
  const [grievanceUser, setGrievanceUser] = useState({ userId: '', userLabel: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!user || !canAdmin(user)) { navigate('/pms'); return null; }
  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const selectedCommittee = committees.find(c => c.id === selectedCommitteeId);
  const configCycle = configCycleId || cycles[0]?.id || '';
  const cycleEmpowered = empoweredMembers.filter(m => m.cycleId === configCycle);
  const cycleGrievance = grievanceMembers.filter(m => m.cycleId === configCycle);

  const handleCreateCommittee = async () => {
    if (!committeeForm.name || !committeeForm.cycleId) {
      setFormError('Name and cycle required');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createCommittee({
        name: committeeForm.name,
        description: committeeForm.description || null,
        cycleId: committeeForm.cycleId,
        tier: committeeForm.tier,
      });
      setShowCreate(false);
      setCommitteeForm({ name: '', description: '', cycleId: '', tier: 'I' });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!memberForm.userId || !selectedCommitteeId) {
      setFormError('User ID required');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await addCommitteeMember(selectedCommitteeId, memberForm.userId, memberForm.role);
      setMemberForm({ userId: '', userLabel: '', role: 'EC_MEMBER' });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to add member');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await removeCommitteeMember(memberId);
    } catch (e) {
      console.error(e);
    }
  };

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    setFormError(null);
    try {
      await fn();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-medium text-text">Evaluation Committees</h1>
        <Button onClick={() => { setCommitteeForm({ name: '', description: '', cycleId: cycles[0]?.id ?? '', tier: 'I' }); setFormError(null); setShowCreate(true); }}>
          New Committee
        </Button>
      </div>

      {committees.length === 0 ? (
        <p className="text-text-muted text-sm py-8 text-center">No evaluation committees yet.</p>
      ) : (
        <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
          {committees.map(com => {
            const cycle = cycles.find(c => c.id === com.cycleId);
            const panelOk = isPanelValid(com.members ?? []);
            return (
              <div
                key={com.id}
                className="flex items-center justify-between px-5 py-4 bg-surface hover:bg-surface-hover transition-colors cursor-pointer"
                onClick={() => setSelectedCommitteeId(com.id)}
              >
                <div>
                  <p className="font-medium text-text text-sm">
                    {com.name}
                    {com.tier && <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Tier {com.tier}</span>}
                  </p>
                  <p className="text-xs text-text-muted">
                    {cycle?.name ?? com.cycleId} · {com.members?.length ?? 0} member{(com.members?.length ?? 0) !== 1 ? 's' : ''}
                    {!panelOk && <span className="ml-2 text-amber-600 font-medium">panel incomplete</span>}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setSelectedCommitteeId(com.id); }}>
                  Manage
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-cycle committee configuration */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-serif font-medium text-text">Cycle Committee Configuration</h2>
          <select
            className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
            value={configCycle}
            onChange={e => setConfigCycleId(e.target.value)}
          >
            {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Empowered Committee */}
          <div className="border border-border rounded-2xl bg-surface p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Empowered Committee</h3>
              {isEmpoweredCommitteeValid(cycleEmpowered)
                ? <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700">Valid</span>
                : <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Needs 3, 5, or 7 members + Chairman</span>}
            </div>
            {cycleEmpowered.length === 0 ? (
              <p className="text-sm text-text-muted">No members configured.</p>
            ) : (
              <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                {cycleEmpowered.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
                    <p className="text-sm text-text">
                      {labelFor(m.userId)}
                      {m.isChairman && <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">Chairman (Director/DG)</span>}
                    </p>
                    <Button variant="danger" size="sm" onClick={() => void run(() => removeEmpoweredMember(m.id))}>Remove</Button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <UserPicker
                placeholder="Search staff to add..."
                excludeIds={cycleEmpowered.map(m => m.userId)}
                onSelect={o => setEmpoweredForm(f => ({ ...f, userId: o.userId, userLabel: o.name ?? o.email ?? o.userId }))}
              />
              {empoweredForm.userId && (
                <div className="flex items-center gap-2 bg-surface-hover rounded-lg px-3 py-2">
                  <span className="text-sm text-text truncate flex-1">{empoweredForm.userLabel}</span>
                  <label className="flex items-center gap-1.5 text-xs text-text-muted whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={empoweredForm.isChairman}
                      onChange={e => setEmpoweredForm(f => ({ ...f, isChairman: e.target.checked }))}
                    />
                    Chairman
                  </label>
                  <Button
                    size="sm"
                    isLoading={saving}
                    onClick={() => configCycle && void run(async () => {
                      await addEmpoweredMember(configCycle, empoweredForm.userId, empoweredForm.isChairman);
                      setEmpoweredForm({ userId: '', userLabel: '', isChairman: false });
                    })}
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Grievance Redressal Committee */}
          <div className="border border-border rounded-2xl bg-surface p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Grievance Redressal Committee</h3>
              {cycleGrievance.length === 5
                ? <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700">Valid</span>
                : <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{cycleGrievance.length}/5 members</span>}
            </div>
            {cycleGrievance.length === 0 ? (
              <p className="text-sm text-text-muted">No members configured.</p>
            ) : (
              <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                {cycleGrievance.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
                    <p className="text-sm text-text">{labelFor(m.userId)}</p>
                    <Button variant="danger" size="sm" onClick={() => void run(() => removeGrievanceMember(m.id))}>Remove</Button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <UserPicker
                placeholder="Search staff to add..."
                excludeIds={cycleGrievance.map(m => m.userId)}
                onSelect={o => setGrievanceUser({ userId: o.userId, userLabel: o.name ?? o.email ?? o.userId })}
              />
              {grievanceUser.userId && (
                <div className="flex items-center gap-2 bg-surface-hover rounded-lg px-3 py-2">
                  <span className="text-sm text-text truncate flex-1">{grievanceUser.userLabel}</span>
                  <Button
                    size="sm"
                    isLoading={saving}
                    onClick={() => configCycle && void run(async () => {
                      await addGrievanceMember(configCycle, grievanceUser.userId);
                      setGrievanceUser({ userId: '', userLabel: '' });
                    })}
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
        {formError && <p className="text-sm text-rose-600">{formError}</p>}
      </div>

      {/* Create Committee Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Evaluation Committee">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Name</label>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
              value={committeeForm.name}
              onChange={e => setCommitteeForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Description</label>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
              value={committeeForm.description}
              onChange={e => setCommitteeForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Tier</label>
            <select
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
              value={committeeForm.tier}
              onChange={e => setCommitteeForm(f => ({ ...f, tier: e.target.value as CommitteeTier }))}
            >
              {(Object.keys(COMMITTEE_TIERS) as CommitteeTier[]).map(t => (
                <option key={t} value={t}>{TIER_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Cycle</label>
            <select
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
              value={committeeForm.cycleId}
              onChange={e => setCommitteeForm(f => ({ ...f, cycleId: e.target.value }))}
            >
              <option value="">Select cycle…</option>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {formError && <p className="text-sm text-rose-600">{formError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button isLoading={saving} onClick={handleCreateCommittee}>Create</Button>
          </div>
        </div>
      </Modal>

      {/* Manage Members Modal */}
      <Modal
        isOpen={!!selectedCommittee}
        onClose={() => { setSelectedCommitteeId(null); setFormError(null); }}
        title={selectedCommittee?.name ?? ''}
        className="max-w-2xl"
      >
        <div className="space-y-5">
          {selectedCommittee && !isPanelValid(selectedCommittee.members ?? []) && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Panel requires an odd number of members including one Reporting Officer, one Reviewing Officer, and one Empowered Committee member.
            </p>
          )}
          {/* Members list */}
          <div>
            <h3 className="text-sm font-semibold text-text mb-3">Members</h3>
            {!selectedCommittee?.members?.length ? (
              <p className="text-sm text-text-muted">No members yet.</p>
            ) : (
              <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                {selectedCommittee.members.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm text-text">{labelFor(m.userId)}</p>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${m.role === 'EC_MEMBER' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {ROLE_LABELS[m.role]}
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
            <div className="space-y-2">
              <UserPicker
                placeholder="Search staff to add..."
                excludeIds={(selectedCommittee?.members ?? []).map(m => m.userId)}
                onSelect={o => setMemberForm(f => ({ ...f, userId: o.userId, userLabel: o.name ?? o.email ?? o.userId }))}
              />
              {memberForm.userId && (
                <div className="flex items-center gap-2 bg-surface-hover rounded-lg px-3 py-2">
                  <span className="text-sm text-text truncate flex-1">{memberForm.userLabel}</span>
                  <select
                    className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background text-text"
                    value={memberForm.role}
                    onChange={e => setMemberForm(f => ({ ...f, role: e.target.value as CommitteeMemberRole }))}
                  >
                    <option value="REPORTING_OFFICER">Reporting Officer</option>
                    <option value="REVIEWING_OFFICER">Reviewing Officer</option>
                    <option value="EC_MEMBER">Empowered Committee Member</option>
                  </select>
                  <Button size="sm" isLoading={saving} onClick={handleAddMember}>Add</Button>
                </div>
              )}
            </div>
            {formError && <p className="text-sm text-rose-600 mt-2">{formError}</p>}
          </div>
        </div>
      </Modal>
    </div>
  );
}
