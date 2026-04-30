import { BookOpen, Briefcase, GraduationCap } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from '../../components/ui/KpiCard';

export function StudentView() {
  const { phDStudents, projects, staff } = useData();
  const { user } = useAuth();

  // Match PhD record by email — students are linked by email in phDStudents or staff table
  // Fallback: show all PhD records if no match (guest-like view)
  const ownStaff = staff.find(s => s.Email === user?.email);
  const ownPhD = phDStudents.find(
    p => p.StudentName === ownStaff?.Name
  );

  const supervisorRecord = ownPhD
    ? staff.find(s => s.Name === ownPhD.SupervisorName)
    : null;

  const linkedProject = ownPhD?.ProjectNo
    ? projects.find(p => p.ProjectNo === ownPhD.ProjectNo)
    : null;

  if (!ownPhD) {
    return (
      <div className="space-y-8 pb-12">
        <div>
          <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
            Student Dashboard
          </h1>
        </div>
        <div className="bg-[#faf9f5] border border-[#f0eee6] rounded-[12px] p-8 text-center">
          <p className="text-sm font-medium text-[#4d4c48]">
            No PhD enrollment record linked to this account.
          </p>
          <p className="text-xs text-[#87867f] mt-2">
            Contact your supervisor or System Admin to link your record.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
          My PhD Dashboard
        </h1>
        <p className="text-[#87867f] mt-1 text-sm font-medium">
          {ownPhD.StudentName} — Enrollment {ownPhD.EnrollmentNo}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="Current Status"
          value={ownPhD.CurrentStatus}
          icon={<GraduationCap size={18} />}
          sublabel="PhD progress"
        />
        <KpiCard
          label="Specialization"
          value={ownPhD.Specialization || '—'}
          icon={<BookOpen size={18} />}
          sublabel="Research area"
        />
        <KpiCard
          label="Fellowship"
          value={ownPhD.FellowshipDetails || '—'}
          icon={<Briefcase size={18} />}
          sublabel="Funding"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Enrollment Details</h2>
          <dl className="space-y-3 text-sm">
            {[
              ['Enrollment No', ownPhD.EnrollmentNo],
              ['Thesis Title', ownPhD.ThesisTitle || '—'],
              ['Supervisor', ownPhD.SupervisorName],
              ['Co-Supervisor', ownPhD.CoSupervisorName || '—'],
              ['Division', supervisorRecord?.Division ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-4">
                <dt className="text-[11px] font-semibold text-[#87867f] uppercase tracking-widest w-32 shrink-0">{label}</dt>
                <dd className="text-[#4d4c48] font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {linkedProject && (
          <Card className="p-6 space-y-4">
            <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Linked Project</h2>
            <dl className="space-y-3 text-sm">
              {[
                ['Project No', linkedProject.ProjectNo],
                ['Project Name', linkedProject.ProjectName],
                ['Status', linkedProject.ProjectStatus],
                ['PI', linkedProject.PrincipalInvestigator],
                ['Division', linkedProject.DivisionCode],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-4">
                  <dt className="text-[11px] font-semibold text-[#87867f] uppercase tracking-widest w-32 shrink-0">{label}</dt>
                  <dd className="text-[#4d4c48] font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      </div>
    </div>
  );
}
