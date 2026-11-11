import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../ui/Button';
import type { NoteTarget, ProposalNote } from '../../types/proposal';

export const NOTE_TARGETS: { value: NoteTarget; label: string }[] = [
  { value: 'abstract', label: 'Abstract' },
  { value: 'problemStatement', label: 'Problem statement' },
  { value: 'objectives', label: 'Objectives' },
  { value: 'expectedOutcomes', label: 'Expected outcomes' },
];

const targetLabel = (t: NoteTarget) => NOTE_TARGETS.find(x => x.value === t)?.label ?? t;

interface NotesPanelProps {
  notes: ProposalNote[];
  onAdd: (body: string) => Promise<void>;
  /** Append the note to a proposal field. `move` also marks the note as used. */
  onUse: (note: ProposalNote, target: NoteTarget, move: boolean) => Promise<void>;
  onDelete: (note: ProposalNote) => Promise<void>;
  /** Phones can jot notes but not push them into the proposal. */
  canUse?: boolean;
  error?: string;
}

export function NotesPanel({ notes, onAdd, onUse, onDelete, canUse = true, error }: NotesPanelProps) {
  const [body, setBody] = useState('');
  const [adding, setAdding] = useState(false);
  const [unusedOnly, setUnusedOnly] = useState(false);

  const shown = useMemo(() => (unusedOnly ? notes.filter(n => !n.usedIn) : notes), [notes, unusedOnly]);
  const unusedCount = useMemo(() => notes.filter(n => !n.usedIn).length, [notes]);

  async function add() {
    const text = body.trim();
    if (!text) return;
    setAdding(true);
    try {
      await onAdd(text);
      setBody('');
    } finally {
      setAdding(false);
    }
  }

  return (
    <section aria-label="Notes" className="space-y-3">
      <div>
        <h2 className="text-base font-[500] font-serif text-text">Notes</h2>
        <p className="text-xs text-text-muted">Only you can see these. They are never sent with the proposal.</p>
      </div>

      <div className="space-y-2">
        <textarea
          aria-label="New note"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void add(); }}
          placeholder="Jot a thought, a reference, a number to check…"
          className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-terracotta/40"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-text-muted">Ctrl + Enter to add</span>
          <Button size="sm" variant="secondary" onClick={() => void add()} isLoading={adding} disabled={!body.trim()}>
            Add note
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="text-xs text-danger">{error}</p>}

      {notes.length > 0 && (
        <div className="flex items-center gap-1 text-xs" role="group" aria-label="Filter notes">
          {([[false, `All (${notes.length})`], [true, `Not yet used (${unusedCount})`]] as const).map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={unusedOnly === value}
              onClick={() => setUnusedOnly(value)}
              className={clsx(
                'px-2 py-1 rounded-md transition-colors',
                unusedOnly === value ? 'bg-surface-hover text-text font-medium' : 'text-text-muted hover:text-text',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <ul className="space-y-2">
        {shown.map(note => (
          <li
            key={note.id}
            className={clsx('border border-border rounded-lg p-3 space-y-2', note.usedIn ? 'bg-background' : 'bg-surface')}
          >
            <p className={clsx('text-sm whitespace-pre-wrap break-words', note.usedIn ? 'text-text-muted' : 'text-text')}>
              {note.body}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-text-muted">
                {new Date(note.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                {note.usedIn && <span className="font-sans"> · used in {targetLabel(note.usedIn)}</span>}
              </span>
              <div className="flex items-center gap-1">
                {canUse && (
                  <select
                    aria-label="Put this note into the proposal"
                    value=""
                    onChange={(e) => {
                      const [mode, target] = e.target.value.split(':') as ['move' | 'copy', NoteTarget];
                      if (target) void onUse(note, target, mode === 'move');
                    }}
                    className="text-xs bg-surface-hover border border-border rounded-md px-1.5 py-1 text-text max-w-[9.5rem]"
                  >
                    <option value="">Move into…</option>
                    <optgroup label="Move into (marks the note used)">
                      {NOTE_TARGETS.map(t => <option key={t.value} value={`move:${t.value}`}>{t.label}</option>)}
                    </optgroup>
                    <optgroup label="Copy into (note stays unused)">
                      {NOTE_TARGETS.map(t => <option key={t.value} value={`copy:${t.value}`}>{t.label}</option>)}
                    </optgroup>
                  </select>
                )}
                <button
                  type="button"
                  aria-label="Delete note"
                  onClick={() => void onDelete(note)}
                  className="p-1 rounded text-text-muted hover:text-danger hover:bg-surface-hover"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {notes.length === 0 && (
        <p className="text-xs text-text-muted italic">
          Nothing yet. Notes you add here can be moved into the proposal when they are ready.
        </p>
      )}
    </section>
  );
}
