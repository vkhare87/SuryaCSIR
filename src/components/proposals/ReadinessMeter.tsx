import { CheckCircle2 } from 'lucide-react';
import type { ReadinessItem, SectionKey } from '../../lib/proposals/readiness';

interface ReadinessMeterProps {
  missing: ReadinessItem[];
  /** Total number of things submission checks, for the "n of m" line. */
  total: number;
  onGo: (section: SectionKey) => void;
}

/** What submission still needs. Never blocks saving — each line is a link to the place to fix it. */
export function ReadinessMeter({ missing, total, onGo }: ReadinessMeterProps) {
  if (missing.length === 0) {
    return (
      <div role="status" className="flex items-center gap-2 border border-border rounded-lg bg-surface px-4 py-3 text-sm text-archive-green">
        <CheckCircle2 size={16} />
        <span className="font-medium">Ready to submit.</span>
      </div>
    );
  }
  const done = total - missing.length;
  return (
    <div className="border border-border rounded-lg bg-surface px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-text">
          <span className="font-mono tabular-nums">{done} of {total}</span> ready for submission
        </span>
        <span className="text-xs text-text-muted">Your work is saved as you type. Nothing below stops you writing.</span>
      </div>
      <div
        role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}
        aria-label="Readiness for submission"
        className="h-1 rounded-full bg-surface-hover overflow-hidden"
      >
        <div className="h-full bg-archive-green" style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {missing.map(item => (
          <li key={item.column}>
            <button
              type="button"
              onClick={() => onGo(item.section)}
              className="text-xs px-2 py-1 rounded-md border border-border text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            >
              {item.action}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
