import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { usePMS } from '../contexts/PMSContext';
import { useProposals } from '../contexts/ProposalsContext';
import { Card, Badge } from './ui/Cards';
import { deriveMyActions } from '../lib/dashboard/myActions';
import { ACCESS_MAP, type AccessPath } from '../constants/access';

const KIND_BADGE: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'neutral' }> = {
  'pms-draft':      { label: 'PMS',       variant: 'warning' },
  'pms-evaluation': { label: 'PMS',       variant: 'info' },
  'proposal':       { label: 'Proposal',  variant: 'info' },
  'action-item':    { label: 'Committee', variant: 'neutral' },
  'ticket':         { label: 'Helpdesk',  variant: 'warning' },
};

// Discovery chips shown when the inbox is empty — first visit orientation.
const AREA_LABELS: Partial<Record<AccessPath, string>> = {
  '/staff': 'Human Capital',
  '/projects': 'Projects',
  '/proposals': 'Proposals',
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
  const { staff, actionItems, tickets } = useData();
  const { reports, evaluations } = usePMS();
  const { proposals } = useProposals();

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
      actionItems,
      tickets,
    });
  }, [user, staffName, reports, evaluations, proposals, actionItems, tickets]);

  const areas = useMemo(() => {
    if (!user) return [];
    return (Object.entries(AREA_LABELS) as [AccessPath, string][])
      .filter(([path]) => ACCESS_MAP[path].includes(user.activeRole));
  }, [user]);

  if (!user) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList size={16} className="text-brand-blue" />
        <h2 className="text-sm font-semibold">My Actions</h2>
        {actions.length > 0 && <Badge variant="warning">{actions.length}</Badge>}
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
          {actions.slice(0, 8).map(a => (
            <li key={a.id}>
              <Link to={a.link} className="flex items-center gap-3 py-2.5 group">
                <Badge variant={KIND_BADGE[a.kind]?.variant ?? 'neutral'}>
                  {KIND_BADGE[a.kind]?.label ?? a.kind}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-brand-blue transition-colors">{a.label}</p>
                  <p className="text-xs text-text-muted truncate">{a.detail}</p>
                </div>
                {a.due && <span className="text-xs text-text-muted shrink-0">due {a.due}</span>}
                <ChevronRight size={14} className="text-text-muted shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
