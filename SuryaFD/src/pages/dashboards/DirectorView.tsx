import { Users, Briefcase, BookOpen, Wrench, Microscope } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useData } from '../../contexts/DataContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from './KpiCard';
import { getDivisionMetrics } from '../../utils/analytics';

export function DirectorView() {
  const { staff, projects, phDStudents, equipment, scientificOutputs, divisions } = useData();

  const activeProjects = projects.filter(p => p.ProjectStatus === 'Active').length;
  const divisionMetrics = getDivisionMetrics({
    divisions,
    staff,
    projects,
    phDStudents,
    scientificOutputs,
    equipment,
  });

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
          Director's Dashboard
        </h1>
        <p className="text-[#87867f] mt-1 text-sm font-medium">
          CSIR-AMPRI — Institute-Wide Performance Overview
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Total Staff"
          value={staff.length}
          icon={<Users size={18} />}
          sublabel="Permanent personnel"
        />
        <KpiCard
          label="Active Projects"
          value={activeProjects}
          icon={<Briefcase size={18} />}
          sublabel={`of ${projects.length} total`}
        />
        <KpiCard
          label="PhD Students"
          value={phDStudents.length}
          icon={<BookOpen size={18} />}
          sublabel="Enrolled scholars"
        />
        <KpiCard
          label="Equipment"
          value={equipment.length}
          icon={<Wrench size={18} />}
          sublabel="Instruments & facilities"
        />
        <KpiCard
          label="Scientific Outputs"
          value={scientificOutputs.length}
          icon={<Microscope size={18} />}
          sublabel="Publications & IP"
        />
      </div>

      {/* Division Scorecards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {divisionMetrics.map(metric => (
          <Card key={metric.divCode} className="space-y-4">
            <div>
              <div className="text-xs font-bold text-[#c96442] font-mono">{metric.divCode}</div>
              <h2 className="text-base font-[500] text-text font-serif truncate" title={metric.divName}>
                {metric.divName}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-2xl font-bold text-text">{metric.staffCount}</div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted">Staff</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-text">{metric.activeProjectCount}</div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted">Active Projects</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-text">{metric.scientificOutputCount}</div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted">Outputs</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-text">{metric.phdStudentCount}</div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted">PhDs</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Division Comparison Chart */}
      <Card className="space-y-5">
        <div>
          <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">
            Division Comparison
          </h2>
          <p className="text-xs text-text-muted mt-1">Projects and scientific outputs by division</p>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={divisionMetrics} margin={{ top: 10, right: 16, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#e8e6dc" vertical={false} />
              <XAxis dataKey="divCode" stroke="#87867f" tickLine={false} axisLine={false} />
              <YAxis stroke="#87867f" tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: '#faf9f5',
                  border: '1px solid #e8e6dc',
                  borderRadius: 8,
                  color: '#141413',
                }}
              />
              <Bar dataKey="projectCount" name="Projects" fill="#c96442" radius={[6, 6, 0, 0]} />
              <Bar dataKey="scientificOutputCount" name="Outputs" fill="#5e5d59" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Division Breakdown Table */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f0eee6]">
          <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">
            Division Breakdown
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f5f4ed]">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Division</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Name</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Current Strength</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Sanctioned</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Head of Division</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0eee6]">
              {divisions.map(div => (
                <tr key={div.divCode} className="hover:bg-[#f5f4ed] transition-colors">
                  <td className="px-6 py-4 font-semibold text-[#c96442] font-mono text-xs">{div.divCode}</td>
                  <td className="px-6 py-4 text-[#4d4c48] font-medium">{div.divName}</td>
                  <td className="px-6 py-4 text-right text-[#141413] font-semibold">{div.divCurrentStrength}</td>
                  <td className="px-6 py-4 text-right text-[#87867f]">{div.divSanctionedstrength}</td>
                  <td className="px-6 py-4 text-right text-[#4d4c48]">{div.divHoD}</td>
                </tr>
              ))}
              {divisions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[#87867f] text-xs italic">
                    No division data available.
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
