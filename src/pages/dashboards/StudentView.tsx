import { useMemo } from 'react';
import { BookOpen, Briefcase, GraduationCap, CheckCircle2, Circle, Clock, Mail, Phone, UserRound } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from '../../components/ui/KpiCard';
import type { PhDMilestoneName } from '../../types';

// Canonical PhD milestone order (matches the phd_milestones CHECK constraint).
const MILESTONE_ORDER: PhDMilestoneName[] = [
  'Joining', 'Coursework', 'Comprehensive Exam', 'Registration',
  'Synopsis Submission', 'Thesis Submission', 'Viva Voce', 'Degree Awarded',
];

export function StudentView() {
  const { phDStudents, projects, staff, phdMilestones } = useData();
  const { user } = useAuth();
  const nowMs = useMemo(() => new Date().getTime(), []);

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

  // Own milestones, ordered by the canonical PhD sequence.
  const ownMilestones = ownPhD
    ? phdMilestones
        .filter(m => m.enrollmentNo === ownPhD.EnrollmentNo)
        .sort((a, b) => MILESTONE_ORDER.indexOf(a.milestone) - MILESTONE_ORDER.indexOf(b.milestone))
    : [];

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

        {supervisorRecord && (
          <Card className="p-6 space-y-4">
            <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide flex items-center gap-2">
              <UserRound size={16} className="text-[#c96442]" /> Supervisor Contact
            </h2>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#141413]">{supervisorRecord.Name}</p>
              <p className="text-xs text-[#87867f]">{supervisorRecord.Designation} · Division {supervisorRecord.Division}</p>
            </div>
            <dl className="space-y-2 text-sm">
              {supervisorRecord.Email && (
                <div className="flex items-center gap-2">
                  <Mail size={13} className="text-[#87867f] shrink-0" />
                  <dd className="text-[#4d4c48]">{supervisorRecord.Email}</dd>
                </div>
              )}
              {supervisorRecord.Ext && (
                <div className="flex items-center gap-2">
                  <Phone size={13} className="text-[#87867f] shrink-0" />
                  <dd className="text-[#4d4c48]">Ext. {supervisorRecord.Ext}</dd>
                </div>
              )}
            </dl>
          </Card>
        )}

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

      {/* Milestone timeline */}
      <Card className="p-6 space-y-4">
        <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Milestone Progress</h2>
        {ownMilestones.length === 0 ? (
          <p className="text-xs text-[#87867f] italic">No milestones recorded yet. Your supervisor updates these as you progress.</p>
        ) : (
          <ol className="relative border-l border-[#f0eee6] ml-3 space-y-6">
            {ownMilestones.map(m => {
              const done = Boolean(m.completedDate);
              const overdue = !done && m.dueDate ? Date.parse(m.dueDate) < nowMs : false;
              const Icon = done ? CheckCircle2 : overdue ? Clock : Circle;
              const tone = done ? 'text-[#16a34a]' : overdue ? 'text-[#c96442]' : 'text-[#b0aea5]';
              return (
                <li key={m.id} className="ml-6">
                  <span className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full bg-[#faf9f5] ${tone}`}>
                    <Icon size={16} />
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className="text-sm font-semibold text-[#141413]">{m.milestone}</span>
                    {done ? (
                      <span className="text-[11px] text-[#16a34a] font-medium">Completed {m.completedDate}</span>
                    ) : m.dueDate ? (
                      <span className={`text-[11px] font-medium ${overdue ? 'text-[#c96442]' : 'text-[#87867f]'}`}>
                        {overdue ? 'Overdue' : 'Due'} {m.dueDate}
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#87867f]">Pending</span>
                    )}
                  </div>
                  {m.remarks && <p className="text-[11px] text-[#87867f] mt-0.5">{m.remarks}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}
