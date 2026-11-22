import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, GraduationCap, Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useHome } from '../../contexts/HomeContext';
import { Card } from '../../components/ui/Cards';
import { DoFirstStrip } from '../../components/home/common/DoFirstStrip';
import { PHD_MILESTONE_ORDER } from '../../lib/phd/progress';

export function StudentView() {
  const { user } = useAuth();
  const { phDStudents, phdMilestones, scientificOutputs } = useData();
  const { ownStaff, greeting, doNext, registerClaimedKeys } = useHome();

  useEffect(() => {
    registerClaimedKeys(doNext ? [doNext.id] : []);
  }, [doNext, registerClaimedKeys]);

  // Match strictly to the caller's own PhD record (never show other students)
  const ownStudent = useMemo(() => {
    if (!ownStaff && !user?.email) return null;
    const nameKey = ownStaff?.Name?.trim().toLowerCase();
    return phDStudents.find((s) => (
      nameKey ? s.StudentName.trim().toLowerCase() === nameKey : false
    )) ?? null;
  }, [phDStudents, ownStaff, user?.email]);

  const ownMilestones = useMemo(() => {
    if (!ownStudent) return [];
    const byName = new Map(
      phdMilestones
        .filter((m) => m.enrollmentNo === ownStudent.EnrollmentNo)
        .map((m) => [m.milestone, m]),
    );
    return PHD_MILESTONE_ORDER.map((label) => ({
      label,
      entry: byName.get(label) ?? null,
    }));
  }, [phdMilestones, ownStudent]);

  const ownPapers = useMemo(() => {
    const name = ownStudent?.StudentName || ownStaff?.Name;
    if (!name) return [];
    const low = name.toLowerCase();
    return scientificOutputs.filter((o) => o.authors.some((a) => a.toLowerCase().includes(low)));
  }, [scientificOutputs, ownStudent, ownStaff]);

  return (
    <div className="space-y-6 pb-12">
      <section aria-label="Student greeting" className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-[500] font-serif text-text leading-snug">{greeting}</h1>
        {ownStudent && (
          <p className="text-xs text-text-muted font-mono tabular-nums">
            {ownStudent.EnrollmentNo} · Supervisor: {ownStudent.SupervisorName || 'Unassigned'}
          </p>
        )}
      </section>

      <DoFirstStrip />

      {/* Single next item */}
      {doNext && (
        <Card className="p-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Do this next</p>
            <p className="text-base font-medium text-text truncate">{doNext.label}</p>
            <p className="text-xs text-text-muted truncate">{doNext.detail}</p>
          </div>
          <Link
            to={doNext.link}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-terracotta hover:bg-terracotta-hover text-ivory text-sm font-semibold shrink-0"
          >
            Open <ArrowRight size={15} />
          </Link>
        </Card>
      )}

      {/* Thesis road */}
      <Card className="p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <GraduationCap size={14} /> My thesis road
        </h2>
        {!ownStudent || ownMilestones.every((m) => !m.entry) ? (
          <p className="text-xs text-text-muted">
            No thesis milestones have been recorded on your enrolment yet. Your supervisor or PME updates these gates as you progress.
          </p>
        ) : (
          <ul className="space-y-2">
            {ownMilestones.map(({ label, entry }) => {
              const done = Boolean(entry?.completedDate);
              return (
                <li key={label} className="flex items-center justify-between gap-3 text-xs border-b border-border pb-2 last:border-0 last:pb-0">
                  <span className="flex items-center gap-2 text-text">
                    <CheckCircle2 size={14} className={done ? 'text-archive-green' : 'text-border'} />
                    {label}
                  </span>
                  <span className="font-mono tabular-nums text-text-muted">
                    {entry?.completedDate ? `Done ${entry.completedDate}` : entry?.dueDate ? `Due ${entry.dueDate}` : 'Upcoming'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Work record & Need something */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">My work record</h2>
          <p className="text-lg font-mono tabular-nums text-text">
            {ownPapers.length} <span className="text-xs font-sans text-text-muted">indexed publication{ownPapers.length === 1 ? '' : 's'}</span>
          </p>
          <p className="text-xs text-text-muted">
            <Link to="/me" className="underline hover:text-text">Open my profile</Link>
          </p>
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Need something?</h2>
          <div className="flex flex-wrap gap-2">
            <Link to="/helpdesk/new?key=letter" className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-text hover:bg-surface-hover">
              Bonafide letter
            </Link>
            <Link to="/helpdesk/new?key=leave" className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-text hover:bg-surface-hover">
              Ask leave
            </Link>
            <Link
              to="/helpdesk/new?key=complaint"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-text hover:bg-surface-hover"
            >
              <Shield size={12} /> Talk to someone, in private
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
