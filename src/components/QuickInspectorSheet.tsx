import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Sparkles, Users, Briefcase, Network, FlaskConical } from 'lucide-react';
import { Sheet } from './ui/Sheet';
import { Badge } from './ui/Cards';
import { EntityLink } from './EntityLink';
import { useData } from '../contexts/DataContext';
import { useCopilot } from '../contexts/CopilotContext';
import { useFeatureControls } from '../contexts/FeatureControlContext';
import { ENTITY_META } from '../lib/entities';
import { divisionOfStaff, projectsForStaff, teamForProject } from '../lib/relations';
import { isActiveProject, isCompletedProject, projectStatusLabel } from '../lib/projects/stage';
import { equipmentStatusClass } from '../utils/equipmentStatus';

export type InspectTarget =
  | { kind: 'staff'; id: string }
  | { kind: 'project'; id: string }
  | { kind: 'division'; id: string }
  | { kind: 'instrument'; id: string };

interface QuickInspectorSheetProps {
  target: InspectTarget | null;
  onClose: () => void;
}

/**
 * Non-destructive slide-over inspector for table rows & cards.
 * Lets users triage details, jump to connected entities, or open Ask SURYA
 * without losing table filters or scroll position.
 */
export function QuickInspectorSheet({ target, onClose }: QuickInspectorSheetProps) {
  const { staff, projects, projectStaff, divisions, equipment, phDStudents } = useData();
  const copilot = useCopilot();
  const { canAccess } = useFeatureControls();
  const navigate = useNavigate();

  const resolved = useMemo(() => {
    if (!target) return null;

    if (target.kind === 'staff') {
      const s = staff.find(m => m.ID === target.id);
      if (!s) return null;
      const div = divisionOfStaff(s, divisions);
      const linkedProjects = projectsForStaff(s, projects, projectStaff);
      const scholars = phDStudents.filter(p => p.SupervisorName === s.Name);
      return {
        kicker: 'Scientific Staff',
        icon: Users,
        title: s.Name || s.ID,
        subtitle: s.Designation || s.ID,
        badge: s.Group ? { label: s.Group, variant: 'info' as const } : undefined,
        route: ENTITY_META.staff.route(s.ID),
        askEntity: { type: 'staff' as const, id: s.ID },
        facts: [
          ['Staff ID', s.ID],
          ['Division', div ? `${div.divCode} — ${div.divName}` : s.Division],
          ['Email', s.Email],
          ['Core Area', s.CoreArea],
          ['Expertise', s.Expertise],
          ['PhD Scholars', scholars.length > 0 ? String(scholars.length) : undefined],
        ] as [string, string | undefined][],
        related: [
          ...(div ? [{ title: 'Division', kind: 'division' as const, ids: [div.divCode] }] : []),
          ...(linkedProjects.length > 0 ? [{ title: 'Projects', kind: 'project' as const, ids: linkedProjects.slice(0, 6).map(p => p.ProjectID) }] : []),
        ],
      };
    }

    if (target.kind === 'project') {
      const p = projects.find(x => x.ProjectID === target.id);
      if (!p) return null;
      const team = teamForProject(p, staff, projectStaff);
      return {
        kicker: 'Research Project',
        icon: Briefcase,
        title: p.ProjectName || p.ProjectNo,
        subtitle: p.ProjectNo || p.ProjectID,
        badge: {
          label: projectStatusLabel(p),
          variant: isActiveProject(p) ? 'success' as const : isCompletedProject(p) ? 'info' as const : 'neutral' as const,
        },
        route: ENTITY_META.project.route(p.ProjectID),
        askEntity: { type: 'project' as const, id: p.ProjectID },
        facts: [
          ['Principal Investigator', p.PrincipalInvestigator],
          ['Division', p.DivisionCode],
          ['Sponsor', p.SponsorerName],
          ['Fund Type', p.FundType],
          ['Sanctioned Cost', p.SanctionedCost],
          ['Duration', [p.StartDate, p.CompletioDate].filter(Boolean).join(' → ') || undefined],
        ] as [string, string | undefined][],
        related: [
          ...(p.DivisionCode ? [{ title: 'Division', kind: 'division' as const, ids: [p.DivisionCode] }] : []),
          ...(team.length > 0 ? [{ title: 'Project Team', kind: 'staff' as const, ids: team.slice(0, 8).map(m => m.ID) }] : []),
        ],
      };
    }

    if (target.kind === 'instrument') {
      const e = equipment.find(x => x.UInsID === target.id);
      if (!e) return null;
      const statusCls = equipmentStatusClass(e.WorkingStatus);
      const variant = statusCls === 'Working'
        ? 'success' as const
        : statusCls === 'Under Maintenance'
          ? 'warning' as const
          : statusCls === 'Not Working'
            ? 'danger' as const
            : 'neutral' as const;
      return {
        kicker: 'Instrument & Facility',
        icon: FlaskConical,
        title: e.Name || e.UInsID,
        subtitle: e.instrument_code || e.UInsID,
        badge: { label: e.WorkingStatus || 'Unknown', variant },
        route: `/facilities/${encodeURIComponent(e.UInsID)}`,
        askEntity: { type: 'instrument' as const, id: e.UInsID },
        facts: [
          ['Division', e.Division],
          ['Location', e.Location],
          ['Manufacturer', e.manufacturer],
          ['Indenter / Manager', e.IndenterName],
          ['Operator', e.OperatorName],
          ['AMC End', e.amc_end_date],
          ['End Use', e.EndUse],
        ] as [string, string | undefined][],
        related: [
          ...(e.Division ? [{ title: 'Division', kind: 'division' as const, ids: [e.Division] }] : []),
        ],
      };
    }

    const d = divisions.find(x => x.divCode === target.id);
    if (!d) return null;
    const members = staff.filter(s => s.Division === d.divCode);
    const divProjects = projects.filter(p => p.DivisionCode === d.divCode);
    return {
      kicker: 'Institute Division',
      icon: Network,
      title: d.divName || d.divCode,
      subtitle: d.divCode,
      badge: d.divStatus ? { label: d.divStatus, variant: 'info' as const } : undefined,
      route: `/divisions?div=${encodeURIComponent(d.divCode)}`,
      askEntity: { type: 'division' as const, id: d.divCode },
      facts: [
        ['Head of Division', d.divHoD],
        ['Current Strength', String(d.divCurrentStrength)],
        ['Sanctioned Strength', String(d.divSanctionedstrength)],
        ['Linked Projects', String(divProjects.length)],
      ] as [string, string | undefined][],
      related: [
        ...(members.length > 0 ? [{ title: 'Staff', kind: 'staff' as const, ids: members.slice(0, 6).map(m => m.ID) }] : []),
        ...(divProjects.length > 0 ? [{ title: 'Projects', kind: 'project' as const, ids: divProjects.slice(0, 6).map(p => p.ProjectID) }] : []),
      ],
    };
  }, [target, staff, projects, projectStaff, divisions, equipment, phDStudents]);

  const HeaderIcon = resolved?.icon ?? Briefcase;

  return (
    <Sheet
      isOpen={target !== null && resolved !== null}
      onClose={onClose}
      title={
        resolved ? (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-sans font-semibold uppercase tracking-[0.16em] text-terracotta">
              <HeaderIcon size={12} />
              {resolved.kicker}
            </div>
            <div className="font-serif text-lg text-text truncate mt-0.5">{resolved.title}</div>
          </div>
        ) : undefined
      }
    >
      {resolved && (
        <div className="flex flex-col h-full gap-5">
          {/* Subtitle + status */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-mono text-xs text-text-muted">{resolved.subtitle}</span>
            {resolved.badge && <Badge variant={resolved.badge.variant}>{resolved.badge.label}</Badge>}
          </div>

          {/* Key facts ledger */}
          <dl className="divide-y divide-border rounded-xl border border-border bg-surface overflow-hidden">
            {resolved.facts.filter(([, v]) => v && v.trim() !== '').map(([label, value]) => (
              <div key={label} className="px-4 py-2.5 flex items-start justify-between gap-4 text-sm">
                <dt className="text-xs text-text-muted shrink-0">{label}</dt>
                <dd className="text-xs font-medium text-text text-right break-words">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Connected records */}
          {resolved.related.length > 0 && (
            <div className="space-y-4">
              {resolved.related.map(sec => (
                <div key={sec.title}>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted mb-2">
                    {sec.title} · {sec.ids.length}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sec.ids.map(id => (
                      <span
                        key={id}
                        onClick={onClose}
                        className="inline-flex items-center px-2.5 py-1 rounded-lg bg-surface border border-border text-xs hover:border-terracotta/50 transition-colors"
                      >
                        <EntityLink kind={sec.kind} id={id} />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action footer */}
          <div className="mt-auto pt-4 border-t border-border flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(resolved.route);
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-terracotta text-ivory text-sm font-medium hover:bg-terracotta-hover transition-colors"
            >
              Open Full Dossier <ExternalLink size={14} />
            </button>
            {canAccess('/ask') && copilot && (
              <button
                type="button"
                onClick={() => {
                  const entity = resolved.askEntity;
                  onClose();
                  copilot.openCopilot({ entity });
                }}
                aria-label="Ask SURYA about this record"
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-surface border border-border text-sm font-medium text-text hover:border-terracotta/60 hover:text-terracotta transition-colors"
              >
                <Sparkles size={14} className="text-terracotta" /> Ask
              </button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
