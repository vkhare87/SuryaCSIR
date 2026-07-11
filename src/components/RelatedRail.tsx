import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Sheet } from './ui/Sheet';
import { EntityLink } from './EntityLink';
import { ENTITY_META, type EntityKind } from '../lib/entities';

export interface RailSection {
  title: string;
  kind: EntityKind;
  ids: string[];
}

/** A "Connections" button that opens a side-sheet of related entities,
 *  grouped by kind. Each item is an EntityLink (peek + deep link). */
export function RelatedRail({ sections, title = 'Connections' }: { sections: RailSection[]; title?: string }) {
  const [open, setOpen] = useState(false);
  const total = sections.reduce((n, s) => n + s.ids.length, 0);
  if (total === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-sm text-text hover:border-terracotta hover:shadow-[var(--shadow-e1)] transition-all"
      >
        <Share2 size={14} className="text-terracotta" /> {title} ({total})
      </button>
      <Sheet isOpen={open} onClose={() => setOpen(false)} title={title}>
        <div className="space-y-6">
          {sections.filter(s => s.ids.length > 0).map(sec => {
            const Icon = ENTITY_META[sec.kind].icon;
            return (
              <div key={sec.title}>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">
                  <Icon size={13} style={{ color: ENTITY_META[sec.kind].color }} />
                  {sec.title} · {sec.ids.length}
                </div>
                <ul className="space-y-1">
                  {sec.ids.map(id => (
                    <li key={id} className="rounded-lg px-3 py-2 hover:bg-surface-hover transition-colors">
                      <EntityLink kind={sec.kind} id={id} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
