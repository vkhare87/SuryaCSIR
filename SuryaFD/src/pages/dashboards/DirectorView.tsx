import { Users, Briefcase, BookOpen, Wrench, Microscope } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from './KpiCard';

export function DirectorView() {
  const { staff, projects, phDStudents, equipment, scientificOutputs, divisions } = useData();

  const activeProjects = projects.filter(p => p.ProjectStatus === 'Active').length;

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
