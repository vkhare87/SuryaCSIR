import { Briefcase, TrendingUp, IndianRupee } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from './KpiCard';

export function FinanceAdminView() {
  const { projects } = useData();

  const activeProjects = projects.filter(p => p.ProjectStatus === 'Active').length;

  const totalSanctioned = projects.reduce((sum, p) => sum + (parseFloat(p.SanctionedCost) || 0), 0);
  const sanctionedDisplay = projects.some(p => isNaN(parseFloat(p.SanctionedCost)))
    ? 'N/A'
    : `₹${totalSanctioned.toLocaleString()}`;

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
          Finance Administration
        </h1>
        <p className="text-[#87867f] mt-1 text-sm font-medium">
          All projects — funding and expenditure overview
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="Total Projects"
          value={projects.length}
          icon={<Briefcase size={18} />}
          sublabel="All statuses"
        />
        <KpiCard
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

      {/* Projects Table */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f0eee6]">
          <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">All Projects</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f5f4ed]">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Project Name</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Fund Type</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Sponsorer</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Status</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Sanctioned Cost</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Utilized</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Start Date</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Completion Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0eee6]">
              {projects.map(p => (
                <tr key={p.ProjectID} className="hover:bg-[#f5f4ed] transition-colors">
                  <td className="px-6 py-3 text-[#4d4c48] font-medium max-w-[200px] truncate">{p.ProjectName}</td>
                  <td className="px-6 py-3 text-[#87867f]">{p.FundType}</td>
                  <td className="px-6 py-3 text-[#87867f]">{p.SponsorerName}</td>
                  <td className="px-6 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      p.ProjectStatus === 'Active'
                        ? 'bg-[#f0f8f0] text-[#3a7a3a]'
                        : 'bg-[#f5f4ed] text-[#87867f]'
                    }`}>
                      {p.ProjectStatus}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-[#4d4c48] font-mono text-xs">
                    {p.SanctionedCost ? `₹${parseFloat(p.SanctionedCost).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-6 py-3 text-right text-[#87867f] font-mono text-xs">
                    {p.UtilizedAmount ? `₹${parseFloat(p.UtilizedAmount).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-6 py-3 text-[#87867f] text-xs">{p.StartDate}</td>
                  <td className="px-6 py-3 text-[#87867f] text-xs">{p.CompletioDate}</td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-[#87867f] text-xs italic">
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
