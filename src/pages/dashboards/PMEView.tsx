import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, ChevronRight, ClipboardCheck, FileDown, FileText, Inbox } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useProposals } from '../../contexts/ProposalsContext';
import { useRules } from '../../contexts/RulesContext';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from '../../components/ui/KpiCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { pmeDeskItems } from '../../lib/projects/pmeDesk';
import { complianceCounts, cpdHalfYearly, loadPortfolio, milestonesAwaitingPme, myChangeSteps, myClosureItems } from '../../lib/projects/projectFileApi';
import { ruleOn } from '../../lib/rules/csirRules';
import { friendlyError } from '../../lib/errors';
import type { ClosureItem, ComplianceCounts, MyChangeStep, PortfolioRow } from '../../types/projectFile';
import { isActiveProject } from '../../lib/projects/stage';

/** The two most recent half-year ends (31 Mar, 30 Sep) on or before today. */
function recentHalfYearEnds(today = new Date()): string[] {
  const y = today.getFullYear();
  const ends = [`${y}-09-30`, `${y}-03-31`, `${y - 1}-09-30`, `${y - 1}-03-31`];
  const iso = today.toISOString().slice(0, 10);
  return ends.filter(e => e <= iso).slice(0, 2);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "04-15" → "15 Apr" */
const monthDay = (md: string) => `${Number(md.slice(3))} ${MONTHS[Number(md.slice(0, 2)) - 1] ?? ''}`;

function CpdReportCard() {
  const { rules } = useRules();
  const { push } = useToast();
  const ends = useMemo(() => recentHalfYearEnds(), []);
  const [periodEnd, setPeriodEnd] = useState(ends[0] ?? '');
  const [busy, setBusy] = useState(false);
  const due = useMemo(() => {
    const v = ruleOn(rules, 'monitoring.cpd_halfyearly_due')?.value;
    return Array.isArray(v) ? v.map(String) : [];
  }, [rules]);

  const build = async () => {
    setBusy(true);
    try {
      const rows = await cpdHalfYearly(periodEnd);
      const [{ pdf }, { CpdReportPdf }] = await Promise.all([import('@react-pdf/renderer'), import('../../lib/projects/packPdf')]);
      const url = URL.createObjectURL(await pdf(<CpdReportPdf periodEnd={periodEnd} rows={rows} />).toBlob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `cpd_halfyearly_${periodEnd}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { push(friendlyError(e), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-4 flex flex-wrap items-end gap-3 justify-between">
      <div>
        <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">Half-yearly report to CPD</h2>
        <p className="text-xs text-text-muted">Every HQ project: reviews held and missed, money, milestones.{due.length ? ` Due ${due.map(monthDay).join(' and ')}.` : ''}</p>
      </div>
      <div className="flex items-end gap-2">
        <label className="text-xs text-text-muted">Half-year ending
          <select value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
            className="block mt-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text">
            {ends.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <Button disabled={busy || !periodEnd} onClick={() => void build()}><FileDown size={14} className="mr-1.5 inline" />{busy ? 'Building…' : 'Build PDF'}</Button>
      </div>
    </Card>
  );
}

export function PMEView() {
  const { projects } = useData();
  const { proposals } = useProposals();

  const [milestones, setMilestones] = useState(0);
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([]);
  const [changeSteps, setChangeSteps] = useState<MyChangeStep[]>([]);
  const [closure, setClosure] = useState<ClosureItem[]>([]);
  const [compliance, setCompliance] = useState<ComplianceCounts | null>(null);
  useEffect(() => {
    let cancelled = false;
    milestonesAwaitingPme().then((n) => { if (!cancelled) setMilestones(n); }, () => {});
    loadPortfolio().then((r) => { if (!cancelled) setPortfolio(r); }, () => {});
    myChangeSteps().then((r) => { if (!cancelled) setChangeSteps(r); }, () => {});
    myClosureItems().then((r) => { if (!cancelled) setClosure(r); }, () => {});
    complianceCounts().then((r) => { if (!cancelled) setCompliance(r); }, () => {});
    return () => { cancelled = true; };
  }, []);
  const queue = useMemo(
    () => pmeDeskItems(proposals, projects, milestones, portfolio, changeSteps, closure, compliance),
    [proposals, projects, milestones, portfolio, changeSteps, closure, compliance],
  );
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

      <CpdReportCard />

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
