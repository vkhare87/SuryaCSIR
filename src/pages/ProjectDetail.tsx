import { useParams, useNavigate, Link } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { Card, Badge, StatCard } from '../components/ui/Cards';
import { Button } from '../components/ui/Button';
import {
  Building2, Calendar, FileText, IndianRupee,
  CopyCheck, UserPlus, Users, GraduationCap, ChevronRight,
  Clock, AlertTriangle, Edit,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Dossier, type DossierTab } from '../components/layout/Dossier';
import { LensCard } from '../components/projects/LensCard';
import { MiniNeighborhoodGraph, type NeighborhoodNeighbor } from '../components/viz/MiniNeighborhoodGraph';
import { teamForProject } from '../lib/relations';
import { FundsPanel } from '../components/projects/FundsPanel';
import { MilestonesPanel } from '../components/projects/MilestonesPanel';
import { OutputsPanel } from '../components/projects/OutputsPanel';
import { TimelinePanel } from '../components/projects/TimelinePanel';
import { MonitoringPanel } from '../components/projects/MonitoringPanel';
import { ChangesPanel } from '../components/projects/ChangesPanel';
import { ClosurePanel } from '../components/projects/ClosurePanel';
import { LegacyPanel } from '../components/projects/LegacyPanel';
import { needsLegacyCompletion } from '../lib/projects/legacy';
import { loadProjectFile } from '../lib/projects/projectFileApi';
import { PacksPanel } from '../components/projects/PacksPanel';
import { StageGatePanel } from '../components/projects/StageGatePanel';
import { friendlyError } from '../lib/errors';
import type { ProjectFile } from '../types/projectFile';
import { parseDate, diffInDays, isWithinMonths } from '../utils/dateUtils';
import { useCanEdit } from '../lib/permissions/canEdit';
import { ProjectFormModal } from '../components/ProjectFormModal';
import { RequestUpdateButton } from '../components/RequestUpdateButton';
import { useBack } from '../utils/useBack';
import { isActiveProject, isCompletedProject, projectStatusLabel } from '../lib/projects/stage';

const normalizePersonName = (name?: string | null) =>
  (name ?? '').toLowerCase().replace(/^(dr\.|sh\.|smt\.)\s+/i, '').trim();

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const goBack = useBack('/projects');
  const { projects, projectStaff, phDStudents, staff, divisions, refreshSlice } = useData();
  const { user } = useAuth();
  const canEdit = useCanEdit('projects');
  const [editOpen, setEditOpen] = useState(false);
  const [file, setFile] = useState<ProjectFile | null>(null);
  const [fileError, setFileError] = useState('');
  const fileReqRef = useRef(0);
  const activeIdRef = useRef(id);

  const project = projects.find(p => p.ProjectID === id);
  const userId = user?.id ?? null;

  const reloadFile = useCallback(async () => {
    if (id !== activeIdRef.current) return;
    const reqId = ++fileReqRef.current;
    if (!id) {
      setFile(null);
      setFileError('');
      return;
    }
    try {
      const next = await loadProjectFile(id);
      if (reqId !== fileReqRef.current || id !== activeIdRef.current) return;
      setFile(next);
      setFileError('');
    } catch (e) {
      if (reqId !== fileReqRef.current || id !== activeIdRef.current) return;
      setFileError(friendlyError(e));
    }
  }, [id, userId]);
  useEffect(() => {
    activeIdRef.current = id;
    setFile(null);
    setFileError('');
    void reloadFile();
    return () => { fileReqRef.current += 1; };
  }, [reloadFile, id]);

  // --- All hooks must be called unconditionally before any early return ---

  const piRecord = useMemo(() => {
    if (!project) return undefined;
    const piName = normalizePersonName(project.PrincipalInvestigator);
    return staff.find(s => normalizePersonName(s.Name) === piName);
  }, [staff, project]);

  // A display hint for which controls to show. The database decides
  // (project_caller_is_pi / project_caller_is_party / project_caller_is_office).
  const myStaffId = useMemo(
    () => staff.find(s =>
      s.user_id === user?.id || (!!user?.email && s.Email?.toLowerCase() === user.email.toLowerCase())
    )?.ID ?? null,
    [staff, user]
  );
  const localIsPi = !!project && !!myStaffId && (project.piStaffId === myStaffId || piRecord?.ID === myStaffId);
  const isPi = file?.callerIsPi ?? localIsPi;
  const isParty = file?.callerIsParty ?? isPi;
  const partyStatusKnown = typeof file?.callerIsParty === 'boolean';
  const isOffice = partyStatusKnown && !!user && !isParty && (user.roles.includes('PME') || user.roles.includes('MasterAdmin'));
  const onFileChanged = useCallback(async () => { await Promise.all([reloadFile(), refreshSlice('projects')]); }, [reloadFile, refreshSlice]);

  const projectNo = project?.ProjectNo;
  const hasSiblingWorkPackages = useMemo(
    () => !!projectNo && projects.filter(p => p.ProjectNo === projectNo).length > 1,
    [projects, projectNo]
  );

  const teamStaff = useMemo(() => {
    if (!project) return [];
    const projPi = normalizePersonName(project.PrincipalInvestigator);
    return projectStaff.filter(s => {
      if (s.projectId) return s.projectId === project.ProjectID;
      if (s.ProjectNo !== project.ProjectNo) return false;
      if (hasSiblingWorkPackages && projPi && s.PIName) {
        return normalizePersonName(s.PIName) === projPi;
      }
      return true;
    });
  }, [projectStaff, project, hasSiblingWorkPackages]);

  const scholars = useMemo(() => {
    if (!project) return [];
    const projPi = normalizePersonName(project.PrincipalInvestigator);
    return phDStudents.filter(s => {
      if (s.projectId) return s.projectId === project.ProjectID;
      if (s.ProjectNo !== project.ProjectNo) return false;
      if (hasSiblingWorkPackages && projPi && s.SupervisorName) {
        return normalizePersonName(s.SupervisorName) === projPi;
      }
      return true;
    });
  }, [phDStudents, project, hasSiblingWorkPackages]);

  const teureAlerts = useMemo(() =>
    teamStaff.filter(s => {
      const end = parseDate(s.DateOfProjectDuration);
      return end && isWithinMonths(end, 3);
    }),
    [teamStaff]
  );

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <p className="text-text-muted mb-4">Project record not found.</p>
        <Button onClick={() => navigate('/projects')} variant="secondary">Go Back</Button>
      </div>
    );
  }

  let statusVariant: 'success' | 'warning' | 'danger' | 'neutral' | 'info' = 'neutral';
  if (isActiveProject(project)) statusVariant = 'success';
  if (isCompletedProject(project)) statusVariant = 'info';

  const sCost = parseFloat(project.SanctionedCost?.replace(/[^0-9.-]+/g, '') ?? '') || 0;
  const currCost = parseFloat(project.UtilizedAmount?.replace(/[^0-9.-]+/g, '') ?? '') || 0;
  let percentUtilized = sCost > 0 ? Math.round((currCost / sCost) * 100) : 0;
  if (percentUtilized > 100) percentUtilized = 100;

  const division = divisions.find(d => d.divCode === project.DivisionCode);

  const endDate = parseDate(project.CompletioDate);
  const daysLeft = endDate ? diffInDays(endDate, new Date()) : null;

  const phdVariant = (status: string): 'success' | 'info' | 'warning' | 'neutral' => {
    if (status === 'Thesis Submitted') return 'success';
    if (status === 'Ongoing') return 'info';
    if (status === 'Coursework') return 'warning';
    return 'neutral';
  };

  const overview = (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT COLUMN ── */}
        <div className="lg:col-span-1 space-y-6">
          <LensCard project={project} canEdit={isParty || isOffice} onSaved={() => refreshSlice('projects')} />
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
                      className={`h-2 rounded-full transition-all ${percentUtilized > 85 ? 'bg-danger' : 'bg-terracotta'}`}
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
              <Calendar size={18} className="text-terracotta" />
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
                <Building2 size={16} className="text-text-muted" />
                Division
              </h3>
              <Link
                to="/divisions"
                className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-terracotta/40 hover:bg-surface-hover transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-terracotta/10 flex items-center justify-center font-semibold text-terracotta text-xs">
                  {division.divCode}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-text group-hover:text-terracotta transition-colors truncate">{division.divName}</div>
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
                <FileText size={16} className="text-terracotta" />
                <span className="text-text-muted">Approval Authority:</span> {project.ApprovalAuthority}
              </div>
            </div>
            <div className="mt-5">
              <h3 className="font-[500] text-text mb-3 flex items-center gap-2 font-serif">
                <UserPlus size={18} className="text-terracotta" />
                Principal Investigator
              </h3>
              {piRecord ? (
                <Link
                  to={`/staff/${piRecord.ID}`}
                  className="flex items-center gap-4 p-4 bg-surface-hover rounded-xl border border-border hover:border-terracotta/40 transition-all group"
                >
                  <div className="w-12 h-12 rounded-full bg-terracotta/10 flex items-center justify-center text-lg font-bold text-terracotta ring-2 ring-border">
                    {piRecord.Name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-text group-hover:text-terracotta transition-colors">{piRecord.Name}</p>
                    <p className="text-sm text-terracotta mt-0.5">{piRecord.Designation}</p>
                    <p className="text-xs text-text-muted mt-0.5">{piRecord.Email}</p>
                  </div>
                  <ChevronRight size={16} className="text-text-muted group-hover:translate-x-1 transition-all" />
                </Link>
              ) : (
                <div className="flex items-start gap-4 p-4 bg-surface-hover rounded-xl border border-border">
                  <div className="w-12 h-12 rounded-full bg-terracotta/10 flex items-center justify-center text-lg font-bold text-terracotta ring-2 ring-border">
                    {project.PrincipalInvestigator.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-text">{project.PrincipalInvestigator}</p>
                    <p className="text-sm text-terracotta mt-0.5">Principal Investigator (PI)</p>
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
              <Users size={18} className="text-terracotta" />
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
                        <div className="w-9 h-9 rounded-full bg-terracotta/10 flex items-center justify-center font-bold text-sm text-terracotta shrink-0">
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

          <MiniNeighborhoodGraph
            centerLabel={project.ProjectNo || project.ProjectName}
            centerKind="project"
            neighbors={[
              ...(project.DivisionCode ? [{ id: project.DivisionCode, label: project.DivisionCode, kind: 'division' as const, relation: 'Division' }] : []),
              ...teamForProject(project, staff, projectStaff).map<NeighborhoodNeighbor>(m => ({
                id: m.ID,
                label: m.Name,
                kind: 'staff',
                relation: m.Designation || 'Team member',
              })),
            ]}
          />

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
  );

  const today = new Date().toISOString().slice(0, 10);
  const fileAlert = fileError ? <p role="alert" className="text-sm text-danger">{fileError}</p> : null;
  const tabs: DossierTab[] = [
    { key: 'overview', label: 'Overview', content: overview },
    {
      key: 'monitoring',
      label: `Monitoring${file && file.slots.some(s => s.status === 'PENDING' && s.dueDate < today) ? ' •' : ''}`,
      content: <>
        {fileAlert}
        {file && (
          <MonitoringPanel project={project} file={file} isOffice={isOffice} isParty={isParty}
            canCall={!isParty && partyStatusKnown && !!user && (user.roles.includes('Director') || user.roles.includes('PME') || user.roles.includes('MasterAdmin'))}
            onChanged={onFileChanged} />
        )}
        {project.track === 'HQ' && <StageGatePanel project={project} canRecord={isOffice || isParty} onChanged={onFileChanged} />}
      </>,
    },
    {
      key: 'funds', label: 'Funds',
      content: <>
        {fileAlert}
        {isOffice && needsLegacyCompletion(project) && <LegacyPanel project={project} onChanged={onFileChanged} />}
        {file && <FundsPanel project={project} file={file} isOffice={isOffice} onChanged={onFileChanged} />}
        {file && project.track === 'HQ' && (isOffice || isParty) && <PacksPanel project={project} file={file} />}
      </>,
    },
    {
      key: 'milestones',
      label: `Milestones${file && file.milestones.length > 0 ? ` (${file.milestones.length})` : ''}`,
      content: <>
        {fileAlert}
        {file && (
          <MilestonesPanel project={project} startDate={/^\d{4}-\d{2}-\d{2}$/.test(project.StartDate) ? project.StartDate : null}
            milestones={file.milestones} isOffice={isOffice} isParty={isParty} onChanged={onFileChanged} />
        )}
      </>,
    },
    {
      key: 'changes',
      label: `Changes${file && file.changes.some(c => c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW' || c.status === 'RETURNED') ? ' •' : ''}`,
      content: <>
        {fileAlert}
        {file && project.track === 'HQ' && (isOffice || isParty) && <PacksPanel project={project} file={file} changesOnly />}
        {file && (
          <ChangesPanel project={project} file={file} isPi={isPi} isOffice={isOffice}
            userId={user?.id ?? null} roles={user?.roles ?? []} onChanged={onFileChanged} />
        )}
      </>,
    },
    {
      key: 'closure', label: 'Closure',
      content: <>
        {fileAlert}
        {file && <ClosurePanel project={project} file={file} isPi={isPi} isOffice={isOffice} roles={user?.roles ?? []} onChanged={onFileChanged} />}
      </>,
    },
    {
      key: 'outputs', label: 'Outputs',
      content: <>
        {fileAlert}
        <OutputsPanel project={project} canLink={isOffice || isParty || !!user?.roles.includes('PME')} />
      </>,
    },
    {
      key: 'timeline', label: 'Timeline',
      content: <>
        {fileAlert}
        {file && <TimelinePanel events={file.events} documents={file.documents} />}
      </>,
    },
  ];

  return (
    <>
      <Dossier
        kicker="Project"
        title={project.ProjectNo}
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusVariant}>{projectStatusLabel(project)}</Badge>
            {daysLeft !== null && daysLeft > 0 && daysLeft <= 30 && (
              <Badge variant="danger" className="flex items-center gap-1">
                <AlertTriangle size={10} /> {daysLeft}d left
              </Badge>
            )}
            <span className="truncate">{project.ProjectName}</span>
          </span>
        }
        onBack={goBack}
        askAbout={{ type: 'project', id: project.ProjectID }}
        actions={<>
          <RequestUpdateButton
            domain="projects"
            recordRef={project.ProjectID}
            divisionCode={project.DivisionCode || null}
            record={project}
            defaultTitle={`Update project ${project.ProjectNo}`}
          />
          {canEdit && (
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-lg text-sm font-medium text-text hover:bg-surface-hover transition-colors"
            >
              <Edit size={14} /> Edit Project
            </button>
          )}
        </>}
        tabs={tabs}
      />
      {canEdit && (
        <ProjectFormModal isOpen={editOpen} onClose={() => setEditOpen(false)} project={project} />
      )}
    </>
  );
}
