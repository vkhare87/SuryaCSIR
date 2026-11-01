import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { usePMS } from '../contexts/PMSContext';
import { useProposals } from '../contexts/ProposalsContext';
import { useProjectReports } from '../contexts/ProjectReportsContext';
import { Card, Badge } from './ui/Cards';
import { deriveMyActions, dueUrgency, type DueUrgency } from '../lib/dashboard/myActions';
import { useFeatureControls } from '../contexts/FeatureControlContext';
import type { AccessPath } from '../constants/access';

const KIND_BADGE: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'neutral' }> = {
  'pms-draft':      { label: 'PMS',       variant: 'warning' },
  'pms-evaluation': { label: 'PMS',       variant: 'info' },
  'proposal':       { label: 'Proposal',  variant: 'info' },
  'action-item':    { label: 'Committee', variant: 'neutral' },
  'ticket':         { label: 'Helpdesk',  variant: 'warning' },
  'progress-report': { label: 'Progress', variant: 'info' },
  'retirement':     { label: 'Workforce', variant: 'warning' },
  'contract-end':   { label: 'Contract',  variant: 'warning' },
  'contribution':   { label: 'Request',   variant: 'info' },
};

const DUE_TEXT: Record<DueUrgency, { prefix: string; className: string }> = {
  overdue: { prefix: 'Overdue', className: 'text-danger font-semibold' },
  soon:    { prefix: 'Due',     className: 'text-text font-semibold' },
  later:   { prefix: 'Due',     className: 'text-text-muted' },
  none:    { prefix: '',        className: '' },
};

// Discovery chips shown when the inbox is empty — first visit orientation.
const AREA_LABELS: Partial<Record<AccessPath, string>> = {
  '/staff': 'Human Capital',
  '/projects': 'Projects',
  '/proposals': 'Proposals',
  '/reports': 'Progress Reports',
  '/phd': 'PhD Tracker',
  '/facilities': 'Instruments',
  '/pms': 'Performance Mgmt',
  '/committees': 'Committees',
  '/helpdesk': 'Helpdesk',
  '/calendar': 'Calendar',
  '/data': 'Data Management',
};

export function MyActions() {
  const { user } = useAuth();
  const { staff, actionItems, tickets, contractStaff, contributionRequests, dataStewards } = useData();
  const { reports, evaluations } = usePMS();
  const { proposals } = useProposals();
  const { reports: progressReports } = useProjectReports();
  const { canAccess } = useFeatureControls();

  const staffName = useMemo(
    () => staff.find(s => s.Email === user?.email)?.Name ?? '',
    [staff, user?.email],
  );

  const actions = useMemo(() => {
    if (!user) return [];
    return deriveMyActions({
      userId: user.id,
      staffName,
      role: user.activeRole,
      reports,
      evaluations,
      proposals,
      progressReports,
      actionItems,
      tickets,
      staff,
      contractStaff,
      roles: user.roles,
      contributions: contributionRequests,
      stewards: dataStewards,
    });
  }, [user, staffName, reports, evaluations, proposals, progressReports, actionItems, tickets, staff, contractStaff,
      contributionRequests, dataStewards]);

  const overdueCount = useMemo(() => actions.filter(a => dueUrgency(a.due) === 'overdue').length, [actions]);

  const areas = useMemo(() => {
    if (!user) return [];
    return (Object.entries(AREA_LABELS) as [AccessPath, string][])
      .filter(([path]) => canAccess(path));
  }, [user, canAccess]);

  if (!user) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList size={16} className="text-brand-blue" />
        <h2 className="text-sm font-semibold">My Actions</h2>
        {actions.length > 0 && <Badge variant="warning">{actions.length}</Badge>}
        {overdueCount > 0 && <Badge variant="danger">{overdueCount} overdue</Badge>}
      </div>

      {actions.length === 0 ? (
        <div className="text-sm text-text-muted">
          <p>No pending actions. Areas available to you:</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {areas.map(([path, label]) => (
              <Link
                key={path}
                to={path}
                className="px-3 py-1 rounded-full border border-border text-xs hover:bg-surface transition-colors"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {actions.slice(0, 8).map(a => {
            const due = DUE_TEXT[dueUrgency(a.due)];
            const dueLabel = a.due && `${due.prefix} ${a.due}`;
            return (
            <li key={a.id}>
              <Link to={a.link} className="flex items-center gap-3 py-2.5 group">
                <Badge variant={KIND_BADGE[a.kind]?.variant ?? 'neutral'}>
                  {KIND_BADGE[a.kind]?.label ?? a.kind}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-brand-blue transition-colors" title={a.label}>{a.label}</p>
                  <p className="text-xs text-text-muted truncate" title={a.detail}>{a.detail}</p>
                  {dueLabel && <p className={clsx('sm:hidden text-xs', due.className)}>{dueLabel}</p>}
                </div>
                {dueLabel && <span className={clsx('hidden sm:inline text-xs shrink-0', due.className)}>{dueLabel}</span>}
                <ChevronRight size={14} className="text-text-muted shrink-0" />
              </Link>
            </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
