import type { PenPictureGroup } from '../../lib/pms/annexureSpecs';
import type { PenPicture } from '../../types/pms';

interface Props {
  groups: PenPictureGroup[];
  value: PenPicture;
  onChange: (v: PenPicture) => void;
  disabled?: boolean;
}

export function PenPictureForm({ groups, value, onChange, disabled }: Props) {
  const setRating = (key: string, rating: string) =>
    onChange({ ...value, ratings: { ...value.ratings, [key]: rating } });

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        Appendix-C — Pen Picture (behavioural aspects). Rate every row, then record the
        evaluation report below.
      </p>

      {groups.map(group => (
        <div key={group.title} className="bg-surface border border-border rounded-2xl overflow-hidden">
          <h3 className="px-4 py-2.5 text-sm font-semibold text-text border-b border-border">
            {group.title}
          </h3>
          <div className="divide-y divide-border">
            {group.rows.map(row => (
              <div key={row.key} className="px-4 py-3 sm:flex sm:items-center sm:justify-between gap-4">
                <span className="text-sm text-text">{row.label}</span>
                <div className="flex flex-wrap gap-3 mt-2 sm:mt-0 shrink-0">
                  {group.scale.map(option => (
                    <label key={option} className="flex items-center gap-1.5 text-xs text-text-muted">
                      <input
                        type="radio"
                        name={row.key}
                        value={option}
                        checked={value.ratings[row.key] === option}
                        onChange={() => setRating(row.key, option)}
                        disabled={disabled}
                        className="accent-terracotta"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div>
        <label className="block text-sm font-medium text-text mb-1">
          Evaluation report <span className="text-text-muted font-normal">(about 100 words)</span>
        </label>
        <textarea
          rows={5}
          value={value.narrative}
          onChange={e => onChange({ ...value, narrative: e.target.value })}
          disabled={disabled}
          placeholder="Record the committee's evaluation, including details of any adverse comment…"
          className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-terracotta resize-none disabled:opacity-50"
        />
      </div>
    </div>
  );
}
