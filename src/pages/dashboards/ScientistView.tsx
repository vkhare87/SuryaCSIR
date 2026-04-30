import { Briefcase, BookOpen, Microscope } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from './KpiCard';

export function ScientistView() {
  const { staff, projects, projectStaff, phDStudents, scientificOutputs } = useData();
  const { user } = useAuth();

  // Find own staff record via email match
  const ownStaff = staff.find(s => s.Email === user?.email);

  if (!ownStaff) {
    return (
      <div className="space-y-8 pb-12">
        <div>
          <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
            Scientist Dashboard
          </h1>
        </div>
        <div className="bg-[#faf9f5] border border-[#f0eee6] rounded-[12px] p-8 text-center">
          <p className="text-sm font-medium text-[#4d4c48]">
            Staff record not linked to this account — contact System Admin.
          </p>
          <p className="text-xs text-[#87867f] mt-2">
            Signed in as: <span className="font-mono">{user?.email ?? 'Unknown'}</span>
          </p>
        </div>
      </div>
    );
  }

  // Own project links via project_staff junction
  const ownProjectLinks = projectStaff.filter(ps => ps.StaffName === ownStaff.Name);
  const ownProjectNos = new Set(ownProjectLinks.map(ps => ps.ProjectNo));
  const ownProjects = projects.filter(p => ownProjectNos.has(p.ProjectNo));

  // PhD students supervised by this scientist
  const supervisedPhDs = phDStudents.filter(p => p.SupervisorName === ownStaff.Name);

  // Scientific outputs authored by this scientist
  const ownOutputs = scientificOutputs.filter(o => o.authors.includes(ownStaff.Name));

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
          My Research Portfolio
        </h1>
        <p className="text-[#87867f] mt-1 text-sm font-medium">
          {ownStaff.Name} — {ownStaff.Designation}, Division {ownStaff.Division}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="My Projects"
          value={ownProjects.length}
          icon={<Briefcase size={18} />}
          sublabel="Active involvement"
        />
        <KpiCard
          label="PhD Supervisees"
          value={supervisedPhDs.length}
          icon={<BookOpen size={18} />}
          sublabel="Scholars under guidance"
        />
        <KpiCard
          label="Publications"
          value={ownOutputs.length}
          icon={<Microscope size={18} />}
          sublabel="Scientific outputs"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Projects Table */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-[#f0eee6]">
            <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">My Projects</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f5f4ed]">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Project Name</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0eee6]">
                {ownProjects.map(p => (
                  <tr key={p.ProjectID} className="hover:bg-[#f5f4ed] transition-colors">
                    <td className="px-6 py-3 text-[#4d4c48] font-medium">{p.ProjectName}</td>
                    <td className="px-6 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        p.ProjectStatus === 'Active'
                          ? 'bg-[#f0f8f0] text-[#3a7a3a]'
                          : 'bg-[#f5f4ed] text-[#87867f]'
                      }`}>
                        {p.ProjectStatus}
                      </span>
                    </td>
                  </tr>
                ))}
                {ownProjects.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-6 py-6 text-center text-[#87867f] text-xs italic">No project involvement found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* PhD Supervisees Table */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-[#f0eee6]">
            <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">PhD Supervisees</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f5f4ed]">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Student Name</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0eee6]">
                {supervisedPhDs.map(p => (
                  <tr key={p.EnrollmentNo} className="hover:bg-[#f5f4ed] transition-colors">
                    <td className="px-6 py-3 text-[#4d4c48] font-medium">{p.StudentName}</td>
                    <td className="px-6 py-3 text-[#87867f]">{p.CurrentStatus}</td>
                  </tr>
                ))}
                {supervisedPhDs.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-6 py-6 text-center text-[#87867f] text-xs italic">No PhD supervisees found.</td>
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
