import { useMemo } from 'react';
import { Briefcase, TrendingUp, IndianRupee, AlertTriangle } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from '../../components/ui/KpiCard';
import { parseCost } from '../../utils/parseCost';
import { isActiveProject, projectStatusLabel } from '../../lib/projects/stage';

// Utilization outlier thresholds — low burn suggests underspend risk,
// near-100%+ suggests overrun risk. Both worth a finance officer's attention.
const LOW_UTILIZATION_PCT = 30;
const HIGH_UTILIZATION_PCT = 95;

export function FinanceAdminView() {
  const { projects } = useData();

  const activeProjects = projects.filter(isActiveProject).length;

  const totalSanctioned = projects.reduce((sum, p) => sum + (parseFloat(p.SanctionedCost) || 0), 0);
  const sanctionedDisplay = projects.some(p => isNaN(parseFloat(p.SanctionedCost)))
    ? 'N/A'
    : `₹${totalSanctioned.toLocaleString()}`;

  const utilizationOutliers = useMemo(() => {
    return projects
      .filter(isActiveProject)
      .map(p => {
        const sanctioned = parseCost(p.SanctionedCost);
        const utilized = parseCost(p.UtilizedAmount);
        const pct = sanctioned > 0 ? (utilized / sanctioned) * 100 : null;
        return { project: p, pct };
      })
      .filter((r): r is { project: typeof projects[number]; pct: number } =>
        r.pct !== null && (r.pct <= LOW_UTILIZATION_PCT || r.pct >= HIGH_UTILIZATION_PCT))
      .sort((a, b) => a.pct - b.pct);
  }, [projects]);

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-[500] text-near-black uppercase tracking-tight font-serif">
          Finance Administration
        </h1>
        <p className="text-stone-gray mt-1 text-sm font-medium">
          All projects — funding and expenditure overview
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          to="/projects"
          label="Total Projects"
          value={projects.length}
          icon={<Briefcase size={18} />}
          sublabel="All statuses"
        />
        <KpiCard
          to="/projects"
          label="Active Projects"
          value={activeProjects}
          icon={<TrendingUp size={18} />}
          sublabel="Currently running"
        />
        <KpiCard
          label="Total Sanctioned Cost"
          value={sanctionedDisplay}
          icon={<IndianRupee size={18} />}
          sublabel="Sum across all projects"
        />
      </div>

      {/* Utilization Outliers */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border-cream flex items-center gap-2">
          <AlertTriangle size={16} className="text-terracotta" />
          <h2 className="text-base font-semibold text-charcoal-warm uppercase tracking-wide">
            Utilization Outliers — active projects
          </h2>
          <span className="text-[10px] text-stone-gray font-normal normal-case ml-1">
            ≤{LOW_UTILIZATION_PCT}% (underspend) or ≥{HIGH_UTILIZATION_PCT}% (overrun risk)
          </span>
        </div>
        {utilizationOutliers.length === 0 ? (
          <p className="text-xs text-stone-gray italic py-8 text-center">No projects outside the healthy utilization band.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-parchment">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-stone-gray">Project</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-stone-gray">Division</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-stone-gray">Sanctioned</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-stone-gray">Utilized</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-stone-gray">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-cream">
                {utilizationOutliers.map(({ project: p, pct }) => (
                  <tr key={p.ProjectID} className="hover:bg-parchment transition-colors">
                    <td className="px-6 py-3 text-charcoal-warm font-medium max-w-[220px] truncate">{p.ProjectName}</td>
                    <td className="px-6 py-3 text-stone-gray font-mono text-xs">{p.DivisionCode}</td>
                    <td className="px-6 py-3 text-right text-charcoal-warm font-mono text-xs">₹{parseCost(p.SanctionedCost).toLocaleString()}</td>
                    <td className="px-6 py-3 text-right text-stone-gray font-mono text-xs">₹{parseCost(p.UtilizedAmount).toLocaleString()}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        pct <= LOW_UTILIZATION_PCT ? 'bg-badge-warning-bg text-badge-warning-fg' : 'bg-badge-danger-bg text-badge-danger-fg'
                      }`}>
                        {pct.toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Projects Table */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border-cream">
          <h2 className="text-base font-semibold text-charcoal-warm uppercase tracking-wide">All Projects</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parchment">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-stone-gray">Project Name</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-stone-gray">Fund Type</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-stone-gray">Sponsorer</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-stone-gray">Status</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-stone-gray">Sanctioned Cost</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-stone-gray">Utilized</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-stone-gray">Start Date</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-stone-gray">Completion Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-cream">
              {projects.map(p => (
                <tr key={p.ProjectID} className="hover:bg-parchment transition-colors">
                  <td className="px-6 py-3 text-charcoal-warm font-medium max-w-[200px] truncate">{p.ProjectName}</td>
                  <td className="px-6 py-3 text-stone-gray">{p.FundType}</td>
                  <td className="px-6 py-3 text-stone-gray">{p.SponsorerName}</td>
                  <td className="px-6 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      isActiveProject(p)
                        ? 'bg-archive-green/10 text-archive-green'
                        : 'bg-parchment text-stone-gray'
                    }`}>
                      {projectStatusLabel(p)}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-charcoal-warm font-mono text-xs">
                    {p.SanctionedCost ? `₹${parseFloat(p.SanctionedCost).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-6 py-3 text-right text-stone-gray font-mono text-xs">
                    {p.UtilizedAmount ? `₹${parseFloat(p.UtilizedAmount).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-6 py-3 text-stone-gray text-xs">{p.StartDate}</td>
                  <td className="px-6 py-3 text-stone-gray text-xs">{p.CompletioDate}</td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-stone-gray text-xs italic">
                    No project records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
