import { Button } from '../ui/Button';
import type { PMSAWPActivity } from '../../types/pms';

export type AWPDraft = Omit<PMSAWPActivity, 'id' | 'reportId' | 'createdAt' | 'updatedAt'>;

interface Props {
  activities: AWPDraft[];
  onChange: (activities: AWPDraft[]) => void;
}

const EMPTY: AWPDraft = { natureOfActivity: '', role: '', timeCommittedPercentage: 0, milestones: [] };

export function AWPForm({ activities, onChange }: Props) {
  const update = (i: number, patch: Partial<AWPDraft>) => {
    onChange(activities.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  };

  const totalTime = activities.reduce((s, a) => s + (a.timeCommittedPercentage || 0), 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Part V — Annual Work Plan for the coming year: planned activities, your role, percentage of
        time committed, and targeted project milestones.
      </p>

      {activities.map((a, i) => (
        <div key={i} className="border border-border rounded-xl p-4 space-y-3 bg-background">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-text-muted mb-1">Nature of Activity</label>
              <input
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text"
                value={a.natureOfActivity}
                onChange={e => update(i, { natureOfActivity: e.target.value })}
                placeholder="e.g. Sponsored project on lightweight composites"
              />
            </div>
            <Button variant="danger" size="sm" onClick={() => onChange(activities.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Role</label>
              <input
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text"
                value={a.role}
                onChange={e => update(i, { role: e.target.value })}
                placeholder="e.g. Principal Investigator"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Time Committed (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text"
                value={a.timeCommittedPercentage || ''}
                onChange={e => {
                  const n = parseFloat(e.target.value);
                  update(i, { timeCommittedPercentage: isNaN(n) ? 0 : Math.min(100, Math.max(0, n)) });
                }}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              Targeted Project Milestones (one per line)
            </label>
            <textarea
              rows={2}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text resize-none"
              value={a.milestones.join('\n')}
              onChange={e => update(i, { milestones: e.target.value.split('\n').filter(Boolean) })}
              placeholder={'Q2: prototype fabrication\nQ4: field trial report'}
            />
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <Button variant="secondary" size="sm" onClick={() => onChange([...activities, { ...EMPTY }])}>
          + Add Activity
        </Button>
        <p className={`text-xs ${totalTime > 100 ? 'text-rose-600' : 'text-text-muted'}`}>
          Total time committed: {totalTime}%{totalTime > 100 && ' — exceeds 100%'}
        </p>
      </div>
    </div>
  );
}
