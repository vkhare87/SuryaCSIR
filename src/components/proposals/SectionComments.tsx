import { useState } from 'react';
import { Check, MessageSquare, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../ui/Button';
import type { ProposalSection, ReviewComment } from '../../types/proposal';

interface SectionCommentsProps {
  section: ProposalSection;
  comments: ReviewComment[];
  /** The PI ticks comments done; a reviewer adds and withdraws their own. */
  mode: 'author' | 'reviewer' | 'read';
  currentUserId?: string;
  onResolve?: (c: ReviewComment, resolved: boolean) => Promise<void>;
  onAdd?: (section: ProposalSection, body: string) => Promise<void>;
  onDelete?: (c: ReviewComment) => Promise<void>;
}

export function SectionComments({ section, comments, mode, currentUserId, onResolve, onAdd, onDelete }: SectionCommentsProps) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = comments.filter(c => c.section === section);
  if (mine.length === 0 && mode !== 'reviewer') return null;

  async function add() {
    if (!onAdd || !body.trim()) return;
    setBusy(true);
    try { await onAdd(section, body.trim()); setBody(''); } finally { setBusy(false); }
  }

  return (
    <div className="border border-border rounded-lg bg-background p-3 space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
        <MessageSquare size={13} /> Reviewer comments
      </p>
      <ul className="space-y-1.5">
        {mine.map(c => (
          <li key={c.id} className="flex items-start gap-2 text-sm">
            {mode === 'author' && onResolve ? (
              <button
                type="button"
                role="checkbox"
                aria-checked={!!c.resolvedAt}
                aria-label={c.resolvedAt ? 'Mark not done' : 'Mark done'}
                onClick={() => void onResolve(c, !c.resolvedAt)}
                className={clsx('mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center',
                  c.resolvedAt ? 'bg-archive-green border-archive-green text-ivory' : 'border-border bg-surface')}
              >
                {c.resolvedAt && <Check size={11} />}
              </button>
            ) : (
              <span className={clsx('mt-1.5 w-1.5 h-1.5 shrink-0 rounded-full', c.resolvedAt ? 'bg-archive-green' : 'bg-turmeric')} />
            )}
            <span className={clsx('flex-1 whitespace-pre-wrap', c.resolvedAt ? 'text-text-muted line-through' : 'text-text')}>{c.body}</span>
            {mode === 'reviewer' && onDelete && c.authorId === currentUserId && !c.resolvedAt && (
              <button type="button" aria-label="Withdraw comment" onClick={() => void onDelete(c)}
                className="p-0.5 text-text-muted hover:text-danger"><Trash2 size={13} /></button>
            )}
          </li>
        ))}
      </ul>
      {mode === 'reviewer' && onAdd && (
        <div className="flex gap-2">
          <input
            aria-label={`Comment on ${section}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
            placeholder="What should change here?"
            className="flex-1 px-2 py-1.5 bg-surface border border-border rounded-md text-sm text-text"
          />
          <Button size="sm" variant="secondary" onClick={() => void add()} isLoading={busy} disabled={!body.trim()}>Add</Button>
        </div>
      )}
    </div>
  );
}
