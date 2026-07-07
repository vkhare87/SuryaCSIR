import { useMemo, useState } from 'react';
import { Modal } from './ui/Modal';
import { Badge } from './ui/Cards';
import { Button } from './ui/Button';
import { useData } from '../contexts/DataContext';
import { PHD_MILESTONE_ORDER, scholarProgress } from '../lib/phd/progress';
import { upsertMilestone } from '../lib/phd/write';
import type { PhDStudent, PhDMilestoneName } from '../types';

interface PhDMilestonePanelProps {
  student: PhDStudent | null;
  canEdit: boolean;
  onClose: () => void;
}

/** Per-scholar milestone timeline: Joining → Degree Awarded. Admin edits dates inline. */
export function PhDMilestonePanel({ student, canEdit, onClose }: PhDMilestonePanelProps) {
  const { phdMilestones, refreshData } = useData();
  const [saving, setSaving] = useState<PhDMilestoneName | null>(null);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { dueDate: string; completedDate: string }>>({});

  const rows = useMemo(
    () => student ? phdMilestones.filter(m => m.enrollmentNo === student.EnrollmentNo) : [],
    [phdMilestones, student],
  );
  const progress = useMemo(() => scholarProgress(rows), [rows]);
  const byName = useMemo(() => new Map(rows.map(m => [m.milestone, m])), [rows]);

  if (!student) return null;

  function draftFor(name: PhDMilestoneName) {
    const existing = byName.get(name);
    return drafts[name] ?? {
      dueDate: existing?.dueDate ?? '',
      completedDate: existing?.completedDate ?? '',
    };
  }

  async function save(name: PhDMilestoneName) {
    if (!student) return;
    const d = draftFor(name);
    setSaving(name);
    setError('');
    const res = await upsertMilestone({
      enrollmentNo: student.EnrollmentNo, milestone: name,
      dueDate: d.dueDate || undefined, completedDate: d.completedDate || undefined,
    });
    setSaving(null);
    if (!res.ok) { setError(res.error); return; }
    await refreshData();
  }

  const inputCls = 'rounded-md border border-border bg-surface px-2 py-1 text-xs text-text';

  return (
    <Modal isOpen onClose={onClose} title={`Milestones — ${student.StudentName}`}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 rounded bg-surface-hover">
            <div className="h-2 rounded bg-brand-blue" style={{ width: `${progress.percent}%` }} />
          </div>
          <span className="text-sm text-text-muted">{progress.percent}%</span>
          {progress.overdue.length > 0 && <Badge variant="warning">{progress.overdue.length} overdue</Badge>}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <ul className="divide-y divide-border">
          {PHD_MILESTONE_ORDER.map(name => {
            const existing = byName.get(name);
            const done = Boolean(existing?.completedDate);
            const overdue = progress.overdue.includes(name);
            const d = draftFor(name);
            return (
              <li key={name} className="flex flex-wrap items-center gap-2 py-2">
                <span className={`h-2.5 w-2.5 rounded-full ${done ? 'bg-brand-blue' : overdue ? 'bg-[#c96442]' : 'bg-surface-hover border border-border'}`} />
                <span className="flex-1 min-w-32 text-sm text-text">{name}</span>
                {canEdit ? (
                  <>
                    <label className="text-xs text-text-muted">Due
                      <input type="date" className={`${inputCls} ml-1`} value={d.dueDate}
                        onChange={e => setDrafts(prev => ({ ...prev, [name]: { ...d, dueDate: e.target.value } }))} />
                    </label>
                    <label className="text-xs text-text-muted">Done
                      <input type="date" className={`${inputCls} ml-1`} value={d.completedDate}
                        onChange={e => setDrafts(prev => ({ ...prev, [name]: { ...d, completedDate: e.target.value } }))} />
                    </label>
                    <Button size="sm" variant="secondary" onClick={() => void save(name)} disabled={saving === name}>
                      {saving === name ? '…' : 'Save'}
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-text-muted">
                    {done ? `Completed ${existing?.completedDate}` : existing?.dueDate ? `Due ${existing.dueDate}` : '—'}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
