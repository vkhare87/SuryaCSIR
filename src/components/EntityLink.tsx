import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { HoverCard } from './ui/HoverCard';
import { ENTITY_META, type EntityKind } from '../lib/entities';
import { divisionOfStaff } from '../lib/relations';
import type { ReactNode } from 'react';

interface EntityLinkProps {
  kind: EntityKind;
  id: string;
  /** override the visible label (defaults to the resolved entity name) */
  label?: ReactNode;
  className?: string;
}

/** Any staff/project/division reference rendered as a peek-on-hover deep link. */
export function EntityLink({ kind, id, label, className }: EntityLinkProps) {
  const navigate = useNavigate();
  const { staff, projects, divisions } = useData();
  const meta = ENTITY_META[kind];

  let name = id;
  let peek: ReactNode = null;

  if (kind === 'staff') {
    const s = staff.find(m => m.ID === id);
    if (s) {
      name = s.Name || s.ID;
      const div = divisionOfStaff(s, divisions);
      peek = <PeekBody title={s.Name} sub={s.Designation} rows={[['Division', div?.divName ?? s.Division], ['Group', s.Group], ['Email', s.Email]]} />;
    }
  } else if (kind === 'project') {
    const p = projects.find(x => x.ProjectID === id);
    if (p) {
      name = p.ProjectName || p.ProjectNo;
      peek = <PeekBody title={p.ProjectName} sub={p.ProjectNo} rows={[['PI', p.PrincipalInvestigator], ['Status', p.ProjectStatus], ['Budget', p.SanctionedCost]]} />;
    }
  } else {
    const d = divisions.find(x => x.divCode === id);
    if (d) {
      name = d.divName || d.divCode;
      peek = <PeekBody title={d.divName} sub={d.divCode} rows={[['Head', d.divHoD], ['Strength', String(d.divCurrentStrength)], ['Status', d.divStatus]]} />;
    }
  }

  const go = (e: React.MouseEvent) => { e.stopPropagation(); navigate(meta.route(id)); };
  const trigger = (
    <button onClick={go} className={className ?? 'text-terracotta hover:underline underline-offset-2 font-medium text-left'}>
      {label ?? name}
    </button>
  );

  if (!peek) return trigger;
  return (
    <HoverCard content={
      <div>
        {peek}
        <button onClick={go} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-terracotta hover:gap-2 transition-all">
          Open <ArrowRight size={12} />
        </button>
      </div>
    }>
      {trigger}
    </HoverCard>
  );
}

function PeekBody({ title, sub, rows }: { title: string; sub?: string; rows: [string, string | undefined][] }) {
  return (
    <div>
      <div className="font-serif text-base text-text leading-tight">{title}</div>
      {sub && <div className="text-xs text-text-muted mt-0.5">{sub}</div>}
      <dl className="mt-3 space-y-1.5">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 text-xs">
            <dt className="text-text-muted shrink-0">{k}</dt>
            <dd className="text-text text-right truncate">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
