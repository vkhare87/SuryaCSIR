import { Link } from 'react-router-dom';
import { Briefcase, BookOpen, Microscope, FlaskConical } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from '../../components/ui/KpiCard';

export function ScientistView() {
  const { staff, projects, projectStaff, phDStudents, scientificOutputs, equipment } = useData();
  const { user } = useAuth();

  // Find own staff record via email match
  const ownStaff = staff.find(s => s.Email === user?.email);
  const ownName = ownStaff?.Name ?? '';

  // Instruments managed or operated — computed before early return to satisfy hook ordering
  const _clean = (n: string) => n.toLowerCase().replace(/^(dr\.|sh\.|shri|smt\.)\s+/i, '').trim();
  const _nameMatch = (a: string, b: string) => { const ca = _clean(a); const cb = _clean(b); return ca === cb || ca.includes(cb) || cb.includes(ca); };
  const ownInstruments = ownName
    ? equipment.filter(e => _nameMatch(ownName, e.IndenterName) || _nameMatch(ownName, e.OperatorName))
    : [];

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
        <KpiCard
          label="My Instruments"
          value={ownInstruments.length}
          icon={<FlaskConical size={18} />}
          sublabel="Managed or operated"
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

        {/* Instruments Table */}
        <Card className="p-0 overflow-hidden lg:col-span-2">
          <div className="px-6 py-4 border-b border-[#f0eee6] flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">My Instruments</h2>
            <Link to="/facilities" className="text-xs text-[#c96442] hover:underline">View all</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f5f4ed]">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Instrument</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Location</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">AMC End</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0eee6]">
                {ownInstruments.slice(0, 5).map(e => {
                  return (
                    <tr key={e.UInsID} className="hover:bg-[#f5f4ed] transition-colors">
                      <td className="px-6 py-3">
                        <Link to={`/facilities/${e.UInsID}`} className="font-medium text-[#4d4c48] hover:text-[#c96442] transition-colors">{e.Name}</Link>
                        {e.instrument_code && <div className="text-[10px] font-mono text-[#87867f]">{e.instrument_code}</div>}
                      </td>
                      <td className="px-6 py-3 text-[#87867f]">{e.Location || '—'}</td>
                      <td className="px-6 py-3 text-[#87867f] text-xs">{e.amc_end_date || '—'}</td>
                      <td className="px-6 py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          e.WorkingStatus === 'Working' ? 'bg-[#f0f8f0] text-[#3a7a3a]' : 'bg-[#f5f4ed] text-[#87867f]'
                        }`}>{e.WorkingStatus}</span>
                      </td>
                    </tr>
                  );
                })}
                {ownInstruments.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-center text-[#87867f] text-xs italic">No instruments assigned to this profile.</td>
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
