import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { Card, Badge } from './ui/Cards';
import { instituteFreshness } from '../lib/divisions/freshness';
import { buildDataHealthDigest, sortAndCap, type DigestSeverity } from '../lib/digest/dataHealth';
import { buildExecutiveDigest } from '../lib/digest/executive';

const SEVERITY_BADGE: Record<DigestSeverity, { label: string; variant: 'danger' | 'warning' | 'info' }> = {
  urgent: { label: 'Urgent', variant: 'danger' },
  warning: { label: 'Stale', variant: 'warning' },
  info: { label: 'Gaps', variant: 'info' },
};

/** Data-freshness digest for steward roles. Renders nothing when there's
 * nothing to flag, so it stays out of the way on healthy dashboards. */
export function DataHealthDigest() {
  const { user, divisionCode } = useAuth();
  const { divisions, staff, projects, scientificOutputs, ipIntelligence, mous, techTransfers, phDStudents, phdMilestones, vacancyAdvertisements } = useData();

  const items = useMemo(() => {
    if (!user) return [];
    const freshness = instituteFreshness(divisions, {
      staff, projects, scientificOutputs, ipIntelligence, mous, techTransfers, phDStudents,
    });
    return sortAndCap([
      ...buildExecutiveDigest(user.activeRole, divisionCode, { projects, phdMilestones, vacancyAdvertisements }),
      ...buildDataHealthDigest(user.activeRole, divisionCode, freshness),
    ]);
  }, [user, divisionCode, divisions, staff, projects, scientificOutputs, ipIntelligence, mous, techTransfers, phDStudents, phdMilestones, vacancyAdvertisements]);

  if (items.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={16} className="text-brand-blue" />
        <h2 className="text-sm font-semibold">Needs Attention</h2>
        <Badge variant="warning">{items.length}</Badge>
      </div>
      <ul className="divide-y divide-border">
        {items.map(item => (
          <li key={item.id}>
            <Link to={item.href} className="flex items-center gap-3 py-2.5 group">
              <Badge variant={SEVERITY_BADGE[item.severity].variant}>
                {SEVERITY_BADGE[item.severity].label}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate group-hover:text-brand-blue transition-colors">{item.title}</p>
                <p className="text-xs text-text-muted truncate">{item.detail}</p>
              </div>
              <ChevronRight size={14} className="text-text-muted shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
