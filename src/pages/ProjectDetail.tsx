import { useParams, useNavigate, Link } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { Card, Badge, StatCard } from '../components/ui/Cards';
import { Button } from '../components/ui/Button';
import {
  ArrowLeft, Building2, Calendar, FileText, IndianRupee,
  CopyCheck, UserPlus, Users, GraduationCap, ChevronRight,
  Clock, AlertTriangle
} from 'lucide-react';
import { useMemo } from 'react';
import { parseDate, diffInDays, isWithinMonths } from '../utils/dateUtils';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { projects, projectStaff, phDStudents, staff, divisions } = useData();

  const project = projects.find(p => p.ProjectID === id);

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <p className="text-text-muted mb-4">Project record not found.</p>
        <Button onClick={() => navigate('/projects')} variant="secondary">Go Back</Button>
      </div>
    );
  }

  let statusVariant: 'success' | 'warning' | 'danger' | 'neutral' | 'info' = 'neutral';
  if (project.ProjectStatus === 'Active') statusVariant = 'success';
  if (project.ProjectStatus === 'Completed') statusVariant = 'info';

  const sCost = parseFloat(project.SanctionedCost?.replace(/[^0-9.-]+/g, '') ?? '') || 0;
  const currCost = parseFloat(project.UtilizedAmount?.replace(/[^0-9.-]+/g, '') ?? '') || 0;
  let percentUtilized = sCost > 0 ? Math.round((currCost / sCost) * 100) : 0;
  if (percentUtilized > 100) percentUtilized = 100;

  // --- Relationships ---
  const teamStaff = useMemo(
    () => projectStaff.filter(s => s.ProjectNo === project.ProjectNo),
    [projectStaff, project]
  );

  const scholars = useMemo(
    () => phDStudents.filter(s => s.ProjectNo === project.ProjectNo),
    [phDStudents, project]
  );

  const division = divisions.find(d => d.divCode === project.DivisionCode);

  // PI staff record if it can be resolved
  const piRecord = useMemo(() => {
    const piName = project.PrincipalInvestigator?.toLowerCase().replace(/^(dr\.|sh\.|smt\.)\s+/i, '').trim();
    return staff.find(s =>
      s.Name.toLowerCase().replace(/^(dr\.|sh\.|smt\.)\s+/i, '').trim() === piName
    );
  }, [staff, project]);

  // Tenure alerts among team staff
  const teureAlerts = useMemo(() =>
    teamStaff.filter(s => {
      const end = parseDate(s.DateOfProjectDuration);
      return end && isWithinMonths(end, 3);
    }),
    [teamStaff]
  );

  const endDate = parseDate(project.CompletioDate);
  const daysLeft = endDate ? diffInDays(endDate, new Date()) : null;

  const phdVariant = (status: string): 'success' | 'info' | 'warning' | 'neutral' => {
    if (status === 'Thesis Submitted') return 'success';
    if (status === 'Ongoing') return 'info';
    if (status === 'Coursework') return 'warning';
    return 'neutral';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/projects')}
          className="p-2 hover:bg-surface-hover rounded-full transition-colors text-text-muted hover:text-text"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-[500] text-text font-serif">{project.ProjectNo}</h1>
            <Badge variant={statusVariant}>{project.ProjectStatus}</Badge>
            {daysLeft !== null && daysLeft > 0 && daysLeft <= 30 && (
              <Badge variant="danger" className="flex items-center gap-1">
                <AlertTriangle size={10} /> {daysLeft}d left
              </Badge>
            )}
          </div>
          <p className="text-text-muted text-sm mt-1">Research & Sponsored Project Profile</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT COLUMN ── */}
        <div className="lg:col-span-1 space-y-6">
          {/* Financials */}
          <Card className="border-t-4 border-emerald-500 flex flex-col pt-6 relative overflow-hidden">
            <div className="z-10">
              <h3 className="text-lg font-[500] text-text flex items-center gap-2 mb-4 font-serif">
                <IndianRupee size={18} className="text-emerald-500" />
                Financial Overview
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-text-muted mb-1">Sanctioned Cost</p>
                  <p className="text-2xl font-bold text-text">{project.SanctionedCost || 'TBD'}</p>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-text-muted">Utilized Amount</span>
                    <span className="font-medium text-text">{percentUtilized}%</span>
                  </div>
                  <div className="w-full bg-border rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${percentUtilized > 85 ? 'bg-rose-500' : 'bg-[#c96442]'}`}
                      style={{ width: `${percentUtilized}%` }}
                    />
                  </div>
                  <p className="text-sm font-medium text-text mt-1">{project.UtilizedAmount || '₹0.00'}</p>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-border space-y-3 text-sm">
                <div className="flex items-start gap-3 text-text-muted">
                  <Building2 size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <span className="block font-medium text-text">Sponsoring Agency</span>
                    <span>{project.SponsorerName}</span>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-text-muted">
                  <CopyCheck size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <span className="block font-medium text-text">Fund Type</span>
                    <span>{project.FundType} ({project.ProjectCategory})</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Timeline */}
          <Card>
            <h3 className="text-lg font-[500] text-text flex items-center gap-2 mb-4 font-serif">
              <Calendar size={18} className="text-[#c96442]" />
              Timeline
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-text-muted">Start Date</span>
                <span className="font-medium text-text font-mono">{project.StartDate || 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-text-muted">Expected Completion</span>
                <span className={`font-medium font-mono ${daysLeft !== null && daysLeft <= 30 && daysLeft > 0 ? 'text-rose-500' : 'text-text'}`}>
                  {project.CompletioDate || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Extension</span>
                <span className="font-medium text-text">{project.Extension || 'None'}</span>
              </div>
            </div>
          </Card>

          {/* Division */}
          {division && (
            <Card>
              <h3 className="text-base font-[500] text-text flex items-center gap-2 mb-3 font-serif">
                <Building2 size={16} className="text-[#5e5d59]" />
                Division
              </h3>
              <Link
                to="/divisions"
                className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-[#c96442]/40 hover:bg-surface-hover transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-[#c96442]/10 flex items-center justify-center font-semibold text-[#c96442] text-xs">
                  {division.divCode}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-text group-hover:text-[#c96442] transition-colors truncate">{division.divName}</div>
                  <div className="text-xs text-text-muted">{division.divCurrentStrength}/{division.divSanctionedstrength} staff</div>
                </div>
                <ChevronRight size={14} className="text-text-muted group-hover:translate-x-1 transition-all" />
              </Link>
            </Card>
          )}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Project Title & PI */}
          <Card>
            <h2 className="text-xl font-[500] text-text mb-3 leading-snug font-serif">{project.ProjectName}</h2>
            <div className="flex items-center gap-4 py-3 border-y border-border">
              <div className="flex items-center gap-2 text-sm text-text">
                <FileText size={16} className="text-[#c96442]" />
                <span className="text-text-muted">Approval Authority:</span> {project.ApprovalAuthority}
              </div>
            </div>
            <div className="mt-5">
              <h3 className="font-[500] text-text mb-3 flex items-center gap-2 font-serif">
                <UserPlus size={18} className="text-[#c96442]" />
                Principal Investigator
              </h3>
              {piRecord ? (
                <Link
                  to={`/staff/${piRecord.ID}`}
                  className="flex items-center gap-4 p-4 bg-surface-hover rounded-xl border border-border hover:border-[#c96442]/40 transition-all group"
                >
                  <div className="w-12 h-12 rounded-full bg-[#c96442]/10 flex items-center justify-center text-lg font-bold text-[#c96442] ring-2 ring-border">
                    {piRecord.Name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-text group-hover:text-[#c96442] transition-colors">{piRecord.Name}</p>
                    <p className="text-sm text-[#c96442] mt-0.5">{piRecord.Designation}</p>
                    <p className="text-xs text-text-muted mt-0.5">{piRecord.Email}</p>
                  </div>
                  <ChevronRight size={16} className="text-text-muted group-hover:translate-x-1 transition-all" />
                </Link>
              ) : (
                <div className="flex items-start gap-4 p-4 bg-surface-hover rounded-xl border border-border">
                  <div className="w-12 h-12 rounded-full bg-[#c96442]/10 flex items-center justify-center text-lg font-bold text-[#c96442] ring-2 ring-border">
                    {project.PrincipalInvestigator.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-text">{project.PrincipalInvestigator}</p>
                    <p className="text-sm text-[#c96442] mt-0.5">Principal Investigator (PI)</p>
                    <p className="text-xs text-text-muted mt-1">Division: {project.DivisionCode}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard title="Project Staff" value={teamStaff.length} className="bg-surface-hover border-transparent" />
            <StatCard title="PhD Scholars" value={scholars.length} className="bg-surface-hover border-transparent shadow-none" />
            {teureAlerts.length > 0 && (
              <StatCard
                title="Tenure Alerts"
                value={teureAlerts.length}
                valueColor="text-rose-500"
                className="bg-rose-50 border-rose-100 dark:bg-rose-900/10 dark:border-rose-900/30 shadow-none"
              />
            )}
          </div>

          {/* Project Staff Roster */}
          <Card className="p-0 overflow-hidden">
            <div className="p-5 border-b border-border bg-surface flex items-center gap-2">
              <Users size={18} className="text-[#c96442]" />
              <h3 className="text-base font-[500] text-text font-serif">Project Staff Roster ({teamStaff.length})</h3>
            </div>
            {teamStaff.length > 0 ? (
              <div className="divide-y divide-border">
                {teamStaff.map(s => {
                  const endDate = parseDate(s.DateOfProjectDuration);
                  const days = endDate ? diffInDays(endDate, new Date()) : null;
                  const expiringSoon = days !== null && days > 0 && days <= 90;
                  return (
                    <div key={s.id} className={`p-4 hover:bg-surface-hover transition-colors flex items-center justify-between gap-4 ${expiringSoon ? 'bg-rose-50/50 dark:bg-rose-900/10' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#c96442]/10 flex items-center justify-center font-bold text-sm text-[#c96442] shrink-0">
                          {s.StaffName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-text">{s.StaffName}</div>
                          <div className="text-xs text-text-muted">{s.Designation}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-text-muted uppercase tracking-wider">Contract ends</div>
                        <div className={`text-xs font-bold font-mono mt-0.5 ${expiringSoon ? 'text-rose-500' : 'text-text'}`}>
                          {s.DateOfProjectDuration}
                        </div>
                        {expiringSoon && (
                          <div className="flex items-center justify-end gap-1 mt-0.5 text-[10px] text-rose-500 font-bold">
                            <Clock size={10} /> {days}d left
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-text-muted text-sm">No project staff records found for this grant.</div>
            )}
          </Card>

          {/* PhD Scholars */}
          {scholars.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <div className="p-5 border-b border-border bg-surface flex items-center gap-2">
                <GraduationCap size={18} className="text-emerald-500" />
                <h3 className="text-base font-semibold text-text">PhD Scholars ({scholars.length})</h3>
              </div>
              <div className="divide-y divide-border">
                {scholars.map(student => (
                  <div key={student.EnrollmentNo} className="p-4 hover:bg-surface-hover transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-text">{student.StudentName}</span>
                          <Badge variant={phdVariant(student.CurrentStatus)}>{student.CurrentStatus}</Badge>
                        </div>
                        <p className="text-xs text-text-muted italic mt-1 truncate max-w-lg">"{student.ThesisTitle}"</p>
                        <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] text-text-muted">
                          <span>Supervisor: {student.SupervisorName}</span>
                          <span>• {student.FellowshipDetails}</span>
                          <span className="font-mono">• {student.EnrollmentNo}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
