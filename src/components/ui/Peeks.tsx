import type { ReactNode } from 'react';
import type { ProjectInfo, StaffMember } from '../../types';

function Line({ label, children }: { label: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="flex gap-2 text-xs">
      <dt className="w-16 shrink-0 text-text-muted">{label}</dt>
      <dd className="min-w-0 text-text break-words">{children}</dd>
    </div>
  );
}

/** HoverCard content for a project: what it is, who leads it, how long it runs. */
export function ProjectPeek({ project: p }: { project: ProjectInfo }) {
  return (
    <div className="space-y-2 text-left font-sans normal-case">
      <p className="font-mono text-[11px] text-text-muted">{p.ProjectNo}</p>
      <p className="text-sm font-medium text-text leading-snug">{p.ProjectName}</p>
      <dl className="space-y-1 border-t border-border pt-2">
        <Line label="Status">{p.ProjectStatus}</Line>
        <Line label="PI">{p.PrincipalInvestigator}</Line>
        <Line label="Sponsor">{p.SponsorerName}</Line>
        <Line label="Runs">{p.StartDate && <span className="font-mono">{p.StartDate} → {p.CompletioDate || '—'}</span>}</Line>
      </dl>
    </div>
  );
}

/** HoverCard content for a staff member: who they are and how to reach them. */
export function StaffPeek({ staff: s }: { staff: StaffMember }) {
  return (
    <div className="space-y-2 text-left font-sans normal-case">
      <p className="text-sm font-medium text-text leading-snug">{s.Name}</p>
      <p className="text-xs text-text-muted">{s.Designation}</p>
      <dl className="space-y-1 border-t border-border pt-2">
        <Line label="Division">{s.Division}</Line>
        <Line label="Area">{s.CoreArea}</Line>
        <Line label="Email">{s.Email}</Line>
        <Line label="Ext">{s.Ext && <span className="font-mono">{s.Ext}</span>}</Line>
      </dl>
    </div>
  );
}
