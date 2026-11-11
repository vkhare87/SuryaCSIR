import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, ChevronRight, ClipboardCheck, FileText, Inbox } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useProposals } from '../../contexts/ProposalsContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from '../../components/ui/KpiCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { pmeDeskItems } from '../../lib/projects/pmeDesk';
import { milestonesAwaitingPme } from '../../lib/projects/projectFileApi';
import { isActiveProject } from '../../lib/projects/stage';

export function PMEView() {
  const { projects } = useData();
  const { proposals } = useProposals();

  const [milestones, setMilestones] = useState(0);
  useEffect(() => {
    let cancelled = false;
    milestonesAwaitingPme().then((n) => { if (!cancelled) setMilestones(n); }, () => {});
    return () => { cancelled = true; };
  }, []);
  const queue = useMemo(() => pmeDeskItems(proposals, projects, milestones), [proposals, projects, milestones]);
  const activeProjects = useMemo(() => projects.filter(isActiveProject).length, [projects]);
  const inReview = useMemo(
    () => proposals.filter(p => ['SUBMITTED', 'UNDER_REVIEW', 'RECOMMENDED', 'APPROVED', 'OM_ISSUED'].includes(p.status)).length,
    [proposals],
  );

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif">PME Desk</h1>
        <p className="text-text-muted mt-1 text-sm font-medium">
          Every project file, from submission to archive
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard to="/projects" label="Active Projects" value={activeProjects} icon={<Briefcase size={18} />} sublabel={`of ${projects.length} on record`} />
        <KpiCard to="/proposals" label="Proposals in Process" value={inReview} icon={<FileText size={18} />} sublabel="Submitted, not yet a project" />
        <KpiCard label="Waiting on PME" value={queue.reduce((n, i) => n + i.count, 0)} icon={<ClipboardCheck size={18} />} sublabel="Items in the queue below" />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">Work queue</h2>
        </div>
        {queue.length === 0 ? (
          <EmptyState icon={Inbox} title="Nothing is waiting" description="Submitted proposals and projects that need attention appear here." />
        ) : (
          <ul className="divide-y divide-border">
            {queue.map(item => (
              <li key={item.key}>
                <Link to={item.to} className="flex items-center gap-4 px-6 py-4 hover:bg-surface-hover transition-colors">
                  <span className="w-10 text-right text-2xl font-[500] font-serif text-text tabular-nums">{item.count}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-text">{item.label}</span>
                    <span className="block text-xs text-text-muted">{item.detail}</span>
                  </span>
                  <ChevronRight size={16} className="text-text-muted shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
