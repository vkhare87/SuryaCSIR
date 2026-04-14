import { Users, Briefcase, BookOpen, Wrench, Microscope } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from './KpiCard';

export function DivisionHeadView() {
  const { staff, projects, phDStudents, equipment, scientificOutputs } = useData();
  const { divisionCode } = useAuth();

  const activeProjects = projects.filter(p => p.ProjectStatus === 'Active').length;

  // PhD students whose supervisor is in this division's staff
  const divisionStaffNames = staff.map(s => s.Name);
  const divisionPhDs = phDStudents.filter(p => divisionStaffNames.includes(p.SupervisorName));

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
          Division Head Dashboard
        </h1>
        <p className="text-[#87867f] mt-1 text-sm font-medium">
          Division: <span className="text-[#c96442] font-semibold">{divisionCode ?? 'All Divisions'}</span>
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Division Staff"
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
          label="PhD Supervisees"
          value={divisionPhDs.length}
          icon={<BookOpen size={18} />}
          sublabel="Scholars in division"
        />
        <KpiCard
          label="Outputs"
          value={scientificOutputs.length}
          icon={<Microscope size={18} />}
          sublabel="Division publications & IP"
        />
        <KpiCard
          label="Equipment"
          value={equipment.length}
          icon={<Wrench size={18} />}
          sublabel="Division instruments"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Staff Table */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-[#f0eee6]">
            <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Staff</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f5f4ed]">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Name</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Designation</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Group</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0eee6]">
                {staff.map(s => (
                  <tr key={s.ID} className="hover:bg-[#f5f4ed] transition-colors">
                    <td className="px-6 py-3 text-[#4d4c48] font-medium">{s.Name}</td>
                    <td className="px-6 py-3 text-[#87867f]">{s.Designation}</td>
                    <td className="px-6 py-3 text-[#87867f]">{s.Group}</td>
                  </tr>
                ))}
                {staff.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-6 text-center text-[#87867f] text-xs italic">No staff records.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Projects Table */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-[#f0eee6]">
            <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Projects</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f5f4ed]">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Project</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Status</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">PI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0eee6]">
                {projects.map(p => (
                  <tr key={p.ProjectID} className="hover:bg-[#f5f4ed] transition-colors">
                    <td className="px-6 py-3 text-[#4d4c48] font-medium max-w-[180px] truncate">{p.ProjectName}</td>
                    <td className="px-6 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        p.ProjectStatus === 'Active'
                          ? 'bg-[#f0f8f0] text-[#3a7a3a]'
                          : 'bg-[#f5f4ed] text-[#87867f]'
                      }`}>
                        {p.ProjectStatus}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-[#87867f] max-w-[150px] truncate">{p.PrincipalInvestigator}</td>
                  </tr>
                ))}
                {projects.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-6 text-center text-[#87867f] text-xs italic">No project records.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
