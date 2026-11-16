import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';

const CLOSED_KEY = 'surya_sections_closed';

function readClosed(): string[] {
  try { return JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]') as string[]; } catch { return []; }
}

interface SectionProps {
  /** Stable id; the folded state is remembered under it in this browser. */
  id: string;
  title: ReactNode;
  /** Right side of the title row: a count, a link. */
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A titled block that folds. Native <details>, so it works by keyboard and
 *  without script; the height transition is in index.css. */
export function Section({ id, title, right, className, children }: SectionProps) {
  const [open, setOpen] = useState(() => !readClosed().includes(id));

  const onToggle = (now: boolean) => {
    if (now === open) return;
    setOpen(now);
    try {
      const closed = readClosed().filter(x => x !== id);
      localStorage.setItem(CLOSED_KEY, JSON.stringify(now ? closed : [...closed, id]));
    } catch { /* storage blocked — the block still folds */ }
  };

  return (
    <details
      open={open}
      onToggle={e => onToggle(e.currentTarget.open)}
      className={cn('section group rounded-xl p-5 bg-surface border border-border', className)}
    >
      <summary className="flex items-center justify-between gap-2 text-xs font-medium text-text-muted cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden rounded">
        <span className="flex items-center gap-1.5 min-w-0">
          <ChevronRight size={14} className="shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
          {/* A heading, so screen-reader heading navigation finds the block. */}
          <h2 className="truncate text-xs font-medium">{title}</h2>
        </span>
        {right}
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}
