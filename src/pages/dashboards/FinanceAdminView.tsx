import { useMemo } from 'react';
import { Briefcase, TrendingUp, IndianRupee, AlertTriangle } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { Card } from '../../components/ui/Cards';
import { Stagger } from '../../components/ui/Stagger';
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
    <Stagger className="space-y-8 pb-12">
      {/* Header */}
      <div className="card-contrast border rounded-xl p-5">
        <h1 className="page-title">
          Finance Administration
        </h1>
        <p className="text-text-muted mt-1 text-sm font-medium">
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
        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
          <AlertTriangle size={16} className="text-terracotta" />
          <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">
            Utilization Outliers — active projects
          </h2>
          <span className="text-[10px] text-text-muted font-normal normal-case ml-1">
            ≤{LOW_UTILIZATION_PCT}% (underspend) or ≥{HIGH_UTILIZATION_PCT}% (overrun risk)
          </span>
        </div>
        {utilizationOutliers.length === 0 ? (
          <p className="text-xs text-text-muted italic py-8 text-center">No projects outside the healthy utilization band.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger w-full text-sm">
              <thead>
                <tr className="bg-background">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Project</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Division</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-text-muted">Sanctioned</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-text-muted">Utilized</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-text-muted">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-cream">
                {utilizationOutliers.map(({ project: p, pct }) => (
                  <tr key={p.ProjectID} className="hover:bg-background transition-colors">
                    <td className="px-6 py-3 text-text-muted font-medium max-w-[220px] truncate">{p.ProjectName}</td>
                    <td className="px-6 py-3 text-text-muted font-mono text-xs">{p.DivisionCode}</td>
                    <td className="px-6 py-3 text-right text-text-muted font-mono text-xs">₹{parseCost(p.SanctionedCost).toLocaleString()}</td>
                    <td className="px-6 py-3 text-right text-text-muted font-mono text-xs">₹{parseCost(p.UtilizedAmount).toLocaleString()}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        pct <= LOW_UTILIZATION_PCT ? 'bg-[#fdf5e8] text-[#a06020]' : 'bg-[#fde2e2] text-[#991b1b]'
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
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">All Projects</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="ledger w-full text-sm">
            <thead>
              <tr className="bg-background">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Project Name</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Fund Type</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Sponsorer</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Status</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-text-muted">Sanctioned Cost</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-text-muted">Utilized</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Start Date</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Completion Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-cream">
              {projects.map(p => (
                <tr key={p.ProjectID} className="hover:bg-background transition-colors">
                  <td className="px-6 py-3 text-text-muted font-medium max-w-[200px] truncate">{p.ProjectName}</td>
                  <td className="px-6 py-3 text-text-muted">{p.FundType}</td>
                  <td className="px-6 py-3 text-text-muted">{p.SponsorerName}</td>
                  <td className="px-6 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      isActiveProject(p)
                        ? 'bg-[#f0f8f0] text-[#3a7a3a]'
                        : 'bg-background text-text-muted'
                    }`}>
                      {projectStatusLabel(p)}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-text-muted font-mono text-xs">
                    {p.SanctionedCost ? `₹${parseFloat(p.SanctionedCost).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-6 py-3 text-right text-text-muted font-mono text-xs">
                    {p.UtilizedAmount ? `₹${parseFloat(p.UtilizedAmount).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-6 py-3 text-text-muted text-xs">{p.StartDate}</td>
                  <td className="px-6 py-3 text-text-muted text-xs">{p.CompletioDate}</td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-text-muted text-xs italic">
                    No project records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Stagger>
  );
}
