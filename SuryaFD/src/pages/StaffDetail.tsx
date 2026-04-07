import { useParams, useNavigate, Link } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { Card, Badge, StatCard } from '../components/ui/Cards';
import { Button } from '../components/ui/Button';
import {
  ArrowLeft, Mail, Phone, MapPin, Award, BookOpen, Briefcase,
  ChevronRight, GitBranch, GraduationCap,
  FileText, Lightbulb, CalendarDays, TrendingUp
} from 'lucide-react';
import {
  getRetirementDate, formatDate,
  getAgeFromDOB, getServiceYears, getYearsInGrade,
  staffNameMatchesAuthor, staffNameMatchesSupervisor, diffInDays
} from '../utils/dateUtils';
import { useMemo } from 'react';

export default function StaffDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { staff, divisions, projects, phDStudents, scientificOutputs, ipIntelligence } = useData();

  const member = staff.find(s => s.ID === id);

  if (!member) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <p className="text-text-muted mb-4">Staff member not found.</p>
        <Button onClick={() => navigate('/staff')} variant="secondary">Go Back</Button>
      </div>
    );
  }

  const division = divisions.find(d => d.divCode === member.Division);

  // --- Relationships ---

  // Projects: PI name match or division match
  const linkedProjects = useMemo(() => projects.filter(p =>
    p.PrincipalInvestigator?.toLowerCase().includes(
      member.Name.replace(/^(Dr\.|Sh\.|Smt\.)\s+/i, '').trim().toLowerCase()
    ) || p.DivisionCode === member.Division
  ), [projects, member]);

  // Reporting chain
  const reportsTo = useMemo(
    () => member.ReportingID ? staff.find(s => s.ID === member.ReportingID) : null,
    [staff, member]
  );
  const directReports = useMemo(
    () => staff.filter(s => s.ReportingID === member.ID && s.ID !== member.ID),
    [staff, member]
  );

  // PhD mentorship
  const supervisingAsMain = useMemo(
    () => phDStudents.filter(s => staffNameMatchesSupervisor(member.Name, s.SupervisorName)),
    [phDStudents, member]
  );
  const supervisingAsCo = useMemo(
    () => phDStudents.filter(s =>
      s.CoSupervisorName && s.CoSupervisorName !== 'None' &&
      staffNameMatchesSupervisor(member.Name, s.CoSupervisorName)
    ),
    [phDStudents, member]
  );

  // Publications
  const publications = useMemo(
    () => scientificOutputs.filter(p =>
      p.authors.some(a => staffNameMatchesAuthor(member.Name, a))
    ),
    [scientificOutputs, member]
  );

  // IP / Patents
  const ipAssets = useMemo(
    () => ipIntelligence.filter(ip =>
      ip.inventors.some(inv => staffNameMatchesAuthor(member.Name, inv))
    ),
    [ipIntelligence, member]
  );

  // Career metrics
  const age = getAgeFromDOB(member.DOB);
  const serviceYears = getServiceYears(member.DOJ);
  const yearsInGrade = getYearsInGrade(member.DoAPP);
  const retirementDate = getRetirementDate(member.DOB);
  const daysToRetirement = retirementDate ? diffInDays(retirementDate, new Date()) : null;
  const isRetiringSoon = daysToRetirement !== null && daysToRetirement > 0 && daysToRetirement <= 365;

  const phdStatusVariant = (status: string): 'success' | 'info' | 'warning' | 'neutral' => {
    if (status === 'Thesis Submitted') return 'success';
    if (status === 'Ongoing') return 'info';
    if (status === 'Coursework') return 'warning';
    return 'neutral';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/staff')}
          className="p-2 hover:bg-surface-hover rounded-full transition-colors text-text-muted hover:text-text"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-text">Staff Profile</h1>
          <p className="text-text-muted text-sm">Detailed Human Capital Record</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT COLUMN ── */}
        <div className="lg:col-span-1 space-y-4">

          {/* ID Card */}
          <Card className="border-t-4 border-brand-blue flex flex-col pt-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-yellow/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            <div className="flex flex-col items-center text-center space-y-4 z-10">
              <div className="w-24 h-24 rounded-full bg-surface-hover border-4 border-background shadow-md flex items-center justify-center text-3xl font-bold text-brand-blue ring-2 ring-border">
                {member.Name.charAt(0)}
              </div>
              <div>
                <h2 className="text-xl font-bold text-text">{member.Name}</h2>
                <p className="text-brand-blue font-medium mt-1">{member.Designation}</p>
                <div className="mt-3 flex justify-center gap-2 flex-wrap">
                  <Badge variant={member.Group === 'Scientific' ? 'success' : 'neutral'}>Group: {member.Group}</Badge>
                  <Badge variant="info">Level: {member.Level}</Badge>
                  {member.Cat && <Badge variant="neutral">{member.Cat}</Badge>}
                </div>
              </div>
              <div className="w-full h-px bg-border my-2" />
              <div className="w-full text-left space-y-3 text-sm">
                <div className="flex items-start gap-3 text-text-muted">
                  <Mail size={16} className="mt-0.5 shrink-0" />
                  <span className="truncate" title={member.Email}>{member.Email || 'No email provided'}</span>
                </div>
                <div className="flex items-start gap-3 text-text-muted">
                  <Phone size={16} className="mt-0.5 shrink-0" />
                  <span>Ext: {member.Ext || 'N/A'}</span>
                </div>
                <div className="flex items-start gap-3 text-text-muted">
                  <MapPin size={16} className="mt-0.5 shrink-0" />
                  <Link to="/divisions" className="hover:text-brand-blue transition-colors hover:underline">
                    {division ? division.divName : member.Division}
                  </Link>
                </div>
                <div className="flex items-start gap-3 text-text-muted">
                  <Award size={16} className="mt-0.5 shrink-0" />
                  <span>{member.HighestQualification}</span>
                </div>
                {member.VidwanID && (
                  <div className="flex items-start gap-3 text-text-muted">
                    <FileText size={16} className="mt-0.5 shrink-0" />
                    <a
                      href={`https://vidwan.inflibnet.ac.in/profile/${member.VidwanID}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-blue hover:underline"
                    >
                      Vidwan: {member.VidwanID}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Career Intelligence Card */}
          <Card className="space-y-4">
            <div className="flex items-center gap-2 text-[10px] font-black text-brand-blue uppercase tracking-[0.2em]">
              <TrendingUp size={14} />
              Career Intelligence
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-background rounded-xl p-3 border border-border">
                <div className="text-[10px] font-black text-text-muted uppercase tracking-wider mb-1">Age</div>
                <div className="text-xl font-black text-text">{age ?? '--'}</div>
                <div className="text-[10px] text-text-muted">years</div>
              </div>
              <div className="bg-background rounded-xl p-3 border border-border">
                <div className="text-[10px] font-black text-text-muted uppercase tracking-wider mb-1">Service</div>
                <div className="text-xl font-black text-text">{serviceYears ?? '--'}</div>
                <div className="text-[10px] text-text-muted">years</div>
              </div>
              <div className="bg-background rounded-xl p-3 border border-border">
                <div className="text-[10px] font-black text-text-muted uppercase tracking-wider mb-1">In Grade</div>
                <div className="text-xl font-black text-text">{yearsInGrade ?? '--'}</div>
                <div className="text-[10px] text-text-muted">years</div>
              </div>
              <div className={`rounded-xl p-3 border ${isRetiringSoon ? 'bg-rose-50 border-rose-200 dark:bg-rose-900/20 dark:border-rose-800' : 'bg-background border-border'}`}>
                <div className={`text-[10px] font-black uppercase tracking-wider mb-1 ${isRetiringSoon ? 'text-rose-500' : 'text-text-muted'}`}>Retires</div>
                <div className={`text-sm font-black ${isRetiringSoon ? 'text-rose-600' : 'text-text'}`}>
                  {retirementDate ? formatDate(retirementDate) : '--'}
                </div>
                {isRetiringSoon && (
                  <div className="text-[10px] text-rose-500 font-bold mt-0.5">{daysToRetirement}d left</div>
                )}
              </div>
            </div>
            <div className="pt-2 border-t border-border text-xs space-y-1.5 text-text-muted">
              <div className="flex justify-between">
                <span>Joined</span>
                <span className="font-mono font-medium text-text">{member.DOJ || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>Current Post From</span>
                <span className="font-mono font-medium text-text">{member.DoAPP || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>Appointment</span>
                <span className="font-medium text-text">{member.AppointmentType || 'N/A'}</span>
              </div>
            </div>
          </Card>

        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Active Projects" value={linkedProjects.filter(p => p.ProjectStatus === 'Active').length} className="bg-surface-hover border-transparent" />
            <StatCard title="Publications" value={publications.length} className="bg-surface-hover border-transparent shadow-none" />
            <StatCard title="PhD Students" value={supervisingAsMain.length + supervisingAsCo.length} className="bg-surface-hover border-transparent shadow-none" />
            <StatCard title="IP Assets" value={ipAssets.length} className="bg-surface-hover border-transparent shadow-none" />
          </div>

          {/* Research & Expertise */}
          <Card>
            <h3 className="text-lg font-semibold mb-4 text-text flex items-center gap-2">
              <BookOpen size={18} className="text-brand-blue" />
              Research & Expertise
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8 text-sm">
              <div>
                <p className="text-text-muted mb-1 font-medium">Core Area</p>
                <p className="text-text">{member.CoreArea || 'Not specified'}</p>
              </div>
              <div>
                <p className="text-text-muted mb-1 font-medium">Specific Expertise</p>
                <p className="text-text">{member.Expertise || 'Not specified'}</p>
              </div>
            </div>
          </Card>

          {/* Org Hierarchy */}
          <Card className="p-0 overflow-hidden">
            <div className="p-5 border-b border-border bg-surface flex items-center gap-2">
              <GitBranch size={18} className="text-indigo-500" />
              <h3 className="text-base font-semibold text-text">Organisational Hierarchy</h3>
            </div>
            <div className="p-5 space-y-5">
              {/* Reports to */}
              <div>
                <div className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-3">Reports To</div>
                {reportsTo ? (
                  <Link
                    to={`/staff/${reportsTo.ID}`}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-brand-blue/40 hover:bg-surface-hover transition-all group"
                  >
                    <div className="w-10 h-10 rounded-full bg-brand-blue/10 flex items-center justify-center font-bold text-brand-blue shrink-0">
                      {reportsTo.Name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-text group-hover:text-brand-blue transition-colors truncate">{reportsTo.Name}</div>
                      <div className="text-xs text-text-muted truncate">{reportsTo.Designation}</div>
                    </div>
                    <ChevronRight size={16} className="text-text-muted group-hover:text-brand-blue transition-all group-hover:translate-x-1 shrink-0" />
                  </Link>
                ) : (
                  <p className="text-sm text-text-muted italic">Top of reporting chain (no superior linked)</p>
                )}
              </div>

              {/* Direct Reports */}
              {directReports.length > 0 && (
                <div>
                  <div className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-3">
                    Direct Reports ({directReports.length})
                  </div>
                  <div className="space-y-2">
                    {directReports.map(s => (
                      <Link
                        key={s.ID}
                        to={`/staff/${s.ID}`}
                        className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-brand-blue/40 hover:bg-surface-hover transition-all group"
                      >
                        <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center font-bold text-sm text-brand-blue shrink-0 border border-border">
                          {s.Name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-text group-hover:text-brand-blue transition-colors truncate">{s.Name}</div>
                          <div className="text-xs text-text-muted truncate">{s.Designation}</div>
                        </div>
                        <Badge variant={s.Group === 'Scientific' ? 'success' : 'neutral'} className="shrink-0">{s.Group}</Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Linked Projects */}
          <Card className="p-0 overflow-hidden">
            <div className="p-5 border-b border-border bg-surface flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase size={18} className="text-brand-blue" />
                <h3 className="text-base font-semibold text-text">Linked Projects ({linkedProjects.length})</h3>
              </div>
            </div>
            {linkedProjects.length > 0 ? (
              <div className="divide-y divide-border">
                {linkedProjects.map(proj => (
                  <Link
                    key={proj.ProjectID}
                    to={`/projects/${proj.ProjectID}`}
                    className="flex justify-between items-center p-4 hover:bg-surface-hover transition-colors group"
                  >
                    <div>
                      <p className="font-semibold text-sm text-text group-hover:text-brand-blue transition-colors">{proj.ProjectNo}</p>
                      <p className="text-text-muted text-xs mt-1 truncate max-w-md">{proj.ProjectName}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant={proj.ProjectStatus === 'Active' ? 'success' : 'neutral'}>{proj.ProjectStatus}</Badge>
                      <ChevronRight size={14} className="text-text-muted group-hover:text-brand-blue transition-all group-hover:translate-x-1" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-text-muted text-sm">No active projects linked to this profile.</div>
            )}
          </Card>

          {/* PhD Mentorship */}
          {(supervisingAsMain.length > 0 || supervisingAsCo.length > 0) && (
            <Card className="p-0 overflow-hidden">
              <div className="p-5 border-b border-border bg-surface flex items-center gap-2">
                <GraduationCap size={18} className="text-emerald-500" />
                <h3 className="text-base font-semibold text-text">
                  PhD Mentorship ({supervisingAsMain.length + supervisingAsCo.length} scholars)
                </h3>
              </div>
              <div className="divide-y divide-border">
                {[
                  ...supervisingAsMain.map(s => ({ ...s, role: 'Supervisor' as const })),
                  ...supervisingAsCo.map(s => ({ ...s, role: 'Co-Supervisor' as const })),
                ].map(student => (
                  <div key={student.EnrollmentNo} className="p-4 hover:bg-surface-hover transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-text">{student.StudentName}</span>
                          <Badge variant={phdStatusVariant(student.CurrentStatus)}>{student.CurrentStatus}</Badge>
                          <Badge variant="neutral" className="text-[9px]">{student.role}</Badge>
                        </div>
                        <p className="text-xs text-text-muted italic mt-1 truncate max-w-lg">"{student.ThesisTitle}"</p>
                        <div className="flex gap-3 mt-1.5 text-[10px] text-text-muted">
                          <span>{student.Specialization}</span>
                          {student.FellowshipDetails && <span>• {student.FellowshipDetails}</span>}
                          <span className="font-mono">• {student.EnrollmentNo}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Publications */}
          {publications.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <div className="p-5 border-b border-border bg-surface flex items-center gap-2">
                <BookOpen size={18} className="text-sky-500" />
                <h3 className="text-base font-semibold text-text">Publications ({publications.length})</h3>
              </div>
              <div className="divide-y divide-border">
                {publications.map(pub => (
                  <div key={pub.id} className="p-4 hover:bg-surface-hover transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text leading-snug">{pub.title}</p>
                        <p className="text-xs text-text-muted italic mt-1">{pub.journal} ({pub.year})</p>
                        <p className="text-xs text-text-muted mt-0.5">{pub.authors.join(', ')}</p>
                      </div>
                      <div className="flex flex-col gap-1.5 items-end shrink-0">
                        <Badge variant="info">IF: {pub.impactFactor}</Badge>
                        <Badge variant="neutral">Cit: {pub.citationCount}</Badge>
                      </div>
                    </div>
                    {pub.doi && (
                      <a
                        href={`https://doi.org/${pub.doi}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-brand-blue hover:underline mt-2 block"
                      >
                        DOI: {pub.doi}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* IP Portfolio */}
          {ipAssets.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <div className="p-5 border-b border-border bg-surface flex items-center gap-2">
                <Lightbulb size={18} className="text-amber-500" />
                <h3 className="text-base font-semibold text-text">IP Portfolio ({ipAssets.length})</h3>
              </div>
              <div className="divide-y divide-border">
                {ipAssets.map(ip => {
                  const sv: 'success' | 'info' | 'warning' | 'neutral' =
                    ip.status === 'Granted' ? 'success' : ip.status === 'Published' ? 'info' : 'warning';
                  return (
                    <div key={ip.id} className="p-4 hover:bg-surface-hover transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-text leading-snug">{ip.title}</p>
                          <p className="text-xs text-text-muted mt-1">{ip.inventors.join(', ')}</p>
                        </div>
                        <div className="flex flex-col gap-1.5 items-end shrink-0">
                          <Badge variant="neutral">{ip.type}</Badge>
                          <Badge variant={sv}>{ip.status}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-text-muted">
                        <CalendarDays size={10} />
                        Filed: {ip.filingDate}
                        {ip.grantDate && <span>• Granted: {ip.grantDate}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
