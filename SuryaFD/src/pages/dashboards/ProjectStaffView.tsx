import { Briefcase, Users } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from './KpiCard';

export function ProjectStaffView() {
  const { projectStaff, projects } = useData();
  const { user } = useAuth();

  // Match project staff records by email domain name heuristic or exact name match
  // Project staff records don't have email — match by user email prefix / name
  const emailName = user?.email?.split('@')[0]?.toLowerCase() ?? '';
  const ownLinks = projectStaff.filter(
    ps => ps.StaffName.toLowerCase().replace(/\s+/g, '.') === emailName ||
          ps.StaffName.toLowerCase().replace(/\s+/g, '') === emailName.replace(/\./g, '')
  );

  const ownProjectNos = new Set(ownLinks.map(ps => ps.ProjectNo));
  const ownProjects = projects.filter(p => ownProjectNos.has(p.ProjectNo));

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
          Project Staff Dashboard
        </h1>
        <p className="text-[#87867f] mt-1 text-sm font-medium">
          Your project assignments and involvement
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-sm">
        <KpiCard
          label="Assignments"
          value={ownLinks.length}
          icon={<Users size={18} />}
          sublabel="Project roles"
        />
        <KpiCard
          label="Projects"
          value={ownProjects.length}
          icon={<Briefcase size={18} />}
          sublabel="Linked projects"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-[#f0eee6]">
            <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">My Assignments</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f5f4ed]">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Project No</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Designation</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0eee6]">
                {ownLinks.map(ps => (
                  <tr key={ps.id} className="hover:bg-[#f5f4ed] transition-colors">
                    <td className="px-6 py-3 font-mono text-xs text-[#87867f]">{ps.ProjectNo}</td>
                    <td className="px-6 py-3 text-[#4d4c48] font-medium">{ps.Designation}</td>
                    <td className="px-6 py-3 text-[#87867f] text-xs">{ps.DateOfJoining}</td>
                  </tr>
                ))}
                {ownLinks.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-[#87867f] text-xs italic">
                      No assignment records found. Contact System Admin to link your records.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-[#f0eee6]">
            <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Linked Projects</h2>
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
                    <td className="px-6 py-3 text-[#4d4c48] font-medium max-w-[200px] truncate">{p.ProjectName}</td>
                    <td className="px-6 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        p.ProjectStatus === 'Active' ? 'bg-[#f0f8f0] text-[#3a7a3a]' : 'bg-[#f5f4ed] text-[#87867f]'
                      }`}>
                        {p.ProjectStatus}
                      </span>
                    </td>
                  </tr>
                ))}
                {ownProjects.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-6 py-6 text-center text-[#87867f] text-xs italic">No linked projects found.</td>
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
