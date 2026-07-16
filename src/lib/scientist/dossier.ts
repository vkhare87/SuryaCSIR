import { getStaffPortfolio } from '../../utils/analytics';
import { piTrackRecord, type PiTrackRecord } from '../proposals/trackRecord';
import { coAuthorPairs } from '../intelligence/collaboration';
import { matchClaims, type ClaimMatchSummary } from './claimMatch';
import { buildTrajectory, type ScientistTrajectory } from './trajectory';
import type {
  StaffMember, ProjectInfo, ProjectStaff, PhDStudent, ScientificOutput,
  IPIntelligence, Equipment, TechTransfer, MoU,
} from '../../types';
import type { PMSReport, PMSReportSection } from '../../types/pms';

// One-click "everything the institute knows about this scientist", joined at
// the person: present work, history, impact, PMS claim corroboration, and
// descriptive trajectory. Pure assembly over already-loaded data — same
// evolutionary path as divisions/dossier.ts. No scores of the person (see
// trajectory.ts / trackRecord.ts for why).

/** How the person's records were joined. Everything except the staff row
 * itself is matched by NAME (name-variant tolerant), which is the known weak
 * link — surfaces must disclose this so a missing item reads as a possible
 * match/ingestion gap, not an absence of work. */
export interface DossierJoinBasis {
  staff: 'id';
  publications: 'name';
  ip: 'name';
  projects: 'name';
  supervision: 'name';
}

export interface ScientistDossier {
  member: StaffMember;
  joinBasis: DossierJoinBasis;
  present: {
    activeProjects: ProjectInfo[];
    supervisedPhDs: PhDStudent[];
    coSupervisedPhDs: PhDStudent[];
    assignedEquipment: Equipment[];
  };
  history: {
    completedProjects: ProjectInfo[];
    trackRecord: PiTrackRecord | null;
    pmsHistory: PmsHistoryEntry[];
  };
  impact: {
    publications: ScientificOutput[];
    citationTotal: number;
    ipAssets: IPIntelligence[];
    grantedPatents: number;
    techTransfers: TechTransfer[];
    mous: MoU[];
  };
  trajectory: ScientistTrajectory;
  /** Present only when a PMS report + its sections were supplied. */
  claims: ClaimMatchSummary | null;
  dataFreshness: string; // ISO date the dossier was built
}

export interface PmsHistoryEntry {
  cycleName: string;
  status: string;
  finalScore: number | null;
  grade: string | null;
}

const isActive = (status: string) => status.trim().toLowerCase() === 'active';
const isCompleted = (status: string) =>
  ['completed', 'closed'].includes(status.trim().toLowerCase());

export function buildScientistDossier(params: {
  staffId: string;
  staff: StaffMember[];
  projects: ProjectInfo[];
  projectStaff: ProjectStaff[];
  phDStudents: PhDStudent[];
  scientificOutputs: ScientificOutput[];
  ipIntelligence: IPIntelligence[];
  equipment: Equipment[];
  techTransfers: TechTransfer[];
  mous: MoU[];
  /** Current-cycle report + sections to run claim corroboration. Optional. */
  report?: PMSReport | null;
  sections?: PMSReportSection[];
  /** Prior PMS cycles (finalized), most recent first. Optional. */
  pmsHistory?: PmsHistoryEntry[];
}): ScientistDossier | null {
  const portfolio = getStaffPortfolio({
    staffId: params.staffId,
    staff: params.staff,
    projects: params.projects,
    projectStaff: params.projectStaff,
    phDStudents: params.phDStudents,
    scientificOutputs: params.scientificOutputs,
    ipIntelligence: params.ipIntelligence,
    equipment: params.equipment,
  });
  if (!portfolio) return null;

  const { member } = portfolio;
  const ownTechTransfers = params.techTransfers.filter(t => t.divisionCode === member.Division);
  const ownMous = params.mous.filter(m => m.divisionCode === member.Division);

  const collabPairs = coAuthorPairs(portfolio.publications, params.staff);

  const trajectory = buildTrajectory({
    scientistName: member.Name,
    publications: portfolio.publications,
    ipAssets: portfolio.ipAssets,
    linkedProjects: portfolio.linkedProjects,
    supervisedPhDs: portfolio.supervisedPhDs,
    techTransfers: ownTechTransfers,
    recentCollaboratorCount: collabPairs.length,
    priorCollaboratorCount: 0,  // no historical baseline yet; flag stays off until we track it
    dutyDays: params.report?.dutyDays ?? null,
  });

  const claims = params.report && params.sections
    ? matchClaims({
        sections: params.sections,
        scientistName: member.Name,
        scientificOutputs: params.scientificOutputs,
        ipIntelligence: params.ipIntelligence,
        projects: params.projects,
      })
    : null;

  return {
    member,
    joinBasis: { staff: 'id', publications: 'name', ip: 'name', projects: 'name', supervision: 'name' },
    present: {
      activeProjects: portfolio.linkedProjects.filter(p => isActive(p.ProjectStatus)),
      supervisedPhDs: portfolio.supervisedPhDs,
      coSupervisedPhDs: portfolio.coSupervisedPhDs,
      assignedEquipment: portfolio.assignedEquipment,
    },
    history: {
      completedProjects: portfolio.linkedProjects.filter(p => isCompleted(p.ProjectStatus)),
      trackRecord: piTrackRecord(params.projects, member.Name),
      pmsHistory: params.pmsHistory ?? [],
    },
    impact: {
      publications: portfolio.publications,
      citationTotal: portfolio.publications.reduce((n, p) => n + (p.citationCount ?? 0), 0),
      ipAssets: portfolio.ipAssets,
      grantedPatents: portfolio.ipAssets.filter(i => i.status === 'Granted').length,
      techTransfers: ownTechTransfers,
      mous: ownMous,
    },
    trajectory,
    claims,
    dataFreshness: new Date().toISOString().slice(0, 10),
  };
}
