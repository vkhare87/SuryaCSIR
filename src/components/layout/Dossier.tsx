import { useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowLeft, History } from 'lucide-react';
import { useProfile } from '../../contexts/ProfileContext';
import { Card } from '../ui/Cards';
import { useUrlTab } from '../../utils/useUrlTab';
import { friendlyError } from '../../lib/errors';
import { AskAboutLink } from '../AskAboutLink';
import type { AskEntity } from '../../lib/ask/client';
import type { TimelineEntry } from '../../types';

export interface DossierTab {
  key: string;
  label: string;
  content: ReactNode;
}

export interface DossierProps {
  kicker: string;
  title: string;
  subtitle?: ReactNode;
  onBack?: () => void;
  /** Buttons on the right of the header (PDF, edit, connections). */
  actions?: ReactNode;
  /** EI3: shows "Ask about this", opening Ask SURYA scoped to this record. */
  askAbout?: AskEntity;
  /** The few numbers that describe the record at a glance. */
  numbers?: { label: string; value: ReactNode }[];
  /** A side column beside the tabs (identity card, key dates). */
  aside?: ReactNode;
  tabs: DossierTab[];
  /** Adds a Timeline tab from entity_timeline. */
  timeline?: { entityType: string; entityId: string };
}

function Timeline({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { loadTimeline } = useProfile();
  const [rows, setRows] = useState<TimelineEntry[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    loadTimeline(entityType, entityId)
      .then(r => { if (live) setRows(r); })
      .catch(e => { if (live) setError(friendlyError(e)); });
    return () => { live = false; };
  }, [loadTimeline, entityType, entityId]);

  if (error) return <p className="text-sm text-badge-danger-fg">{error}</p>;
  if (!rows) return <p className="text-sm text-text-muted">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-text-muted">Nothing recorded yet.</p>;
  return (
    <Card className="p-0 overflow-hidden">
      <ol className="divide-y divide-border">
        {rows.map((r, i) => (
          <li key={i} className="px-5 py-3 flex gap-4 text-sm">
            <span className="font-mono tabular-nums text-xs text-text-muted w-24 shrink-0 pt-0.5">{r.at.slice(0, 10)}</span>
            <span className="text-text">{r.summary}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/**
 * The page shell for one record — a person now, projects, divisions and
 * instruments later (enterprise P7): header, key numbers, tabs kept in
 * `?tab=`, and the record's timeline.
 */
export function Dossier({ kicker, title, subtitle, onBack, actions, askAbout, numbers, aside, tabs, timeline }: DossierProps) {
  const all = useMemo(() => timeline
    ? [...tabs, { key: 'timeline', label: 'Timeline', content: <Timeline {...timeline} /> }]
    : tabs, [tabs, timeline]);
  const keys = useMemo(() => all.map(t => t.key), [all]);
  const [tab, setTab] = useUrlTab(keys);
  const current = all.find(t => t.key === tab) ?? all[0];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 flex-wrap">
        {onBack && (
          <button onClick={onBack} aria-label="Back"
            className="p-2 hover:bg-surface-hover rounded-full transition-colors text-text-muted hover:text-text">
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-terracotta">{kicker}</p>
          <h1 className="text-2xl font-[500] text-text font-serif truncate">{title}</h1>
          {subtitle && <div className="text-text-muted text-sm mt-0.5">{subtitle}</div>}
        </div>
        {(actions || askAbout) && (
          <div className="flex items-center gap-2 flex-wrap">
            {askAbout && <AskAboutLink entity={askAbout} />}
            {actions}
          </div>
        )}
      </div>

      {numbers && numbers.length > 0 && (
        <dl className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {numbers.map(n => (
            <div key={n.label} className="rounded-xl border border-border bg-surface px-4 py-3">
              <dt className="text-[10px] uppercase tracking-wider text-text-muted">{n.label}</dt>
              <dd className="text-xl font-mono tabular-nums text-text mt-0.5">{n.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className={clsx('grid grid-cols-1 gap-6', aside && 'lg:grid-cols-3')}>
        {aside && <div className="lg:col-span-1 space-y-4">{aside}</div>}
        <div className={clsx('space-y-4', aside && 'lg:col-span-2')}>
          <div role="tablist" className="flex gap-1 border-b border-border overflow-x-auto">
            {all.map(t => (
              <button key={t.key} role="tab" aria-selected={t.key === current.key} onClick={() => setTab(t.key)}
                className={clsx('px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5',
                  t.key === current.key ? 'border-terracotta text-text font-medium' : 'border-transparent text-text-muted hover:text-text')}>
                {t.key === 'timeline' && <History size={13} />}{t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="space-y-6">{current.content}</div>
        </div>
      </div>
    </div>
  );
}
