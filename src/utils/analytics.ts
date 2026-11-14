import type {
  DivisionInfo,
  Equipment,
  IPIntelligence,
  PhDStudent,
  ProfileFact,
  ProjectInfo,
  ScientificOutput,
  StaffMember,
} from '../types';
import { isActiveProject } from '../lib/projects/stage';

export interface DivisionMetric {
  divCode: string;
  divName: string;
  staffCount: number;
  activeProjectCount: number;
  projectCount: number;
  scientificOutputCount: number;
  phdStudentCount: number;
  equipmentCount: number;
}

export interface StaffPortfolio {
  member: StaffMember;
  linkedProjects: ProjectInfo[];
  supervisedPhDs: PhDStudent[];
  coSupervisedPhDs: PhDStudent[];
  publications: ScientificOutput[];
  ipAssets: IPIntelligence[];
  assignedEquipment: Equipment[];
}

export function normalizePersonName(name: string | null | undefined): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\b(dr|prof|sh|smt|mr|mrs|ms)\.?\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function personNamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const first = normalizePersonName(a);
  const second = normalizePersonName(b);
  if (!first || !second) return false;
  return first === second || first.includes(second) || second.includes(first);
}

export function getDivisionMetrics(params: {
  divisions: DivisionInfo[];
  staff: StaffMember[];
  projects: ProjectInfo[];
  phDStudents: PhDStudent[];
  scientificOutputs: ScientificOutput[];
  equipment: Equipment[];
}): DivisionMetric[] {
  const { divisions, staff, projects, phDStudents, scientificOutputs, equipment } = params;

  return divisions.map((division) => {
    const divisionStaff = staff.filter(item => item.Division === division.divCode);
    const divisionStaffNames = divisionStaff.map(item => item.Name);
    const divisionProjects = projects.filter(item => item.DivisionCode === division.divCode);
    const divisionPhDs = phDStudents.filter(student =>
      divisionStaffNames.some(name =>
        personNamesMatch(name, student.SupervisorName) ||
        personNamesMatch(name, student.CoSupervisorName)
      )
    );

    return {
      divCode: division.divCode,
      divName: division.divName,
      staffCount: divisionStaff.length,
      activeProjectCount: divisionProjects.filter(isActiveProject).length,
      projectCount: divisionProjects.length,
      scientificOutputCount: scientificOutputs.filter(item => item.divisionCode === division.divCode).length,
      phdStudentCount: divisionPhDs.length,
      equipmentCount: equipment.filter(item => item.Division === division.divCode).length,
    };
  });
}

/**
 * A person's records, picked by the links in staff_profile_facts (P1 identity
 * links, pi_staff_id, supervisor_staff_id, equipment owner). Nothing is
 * matched by name: an unlinked record is left out and shows on People Links.
 */
export function getStaffPortfolio(params: {
  staffId: string | undefined;
  staff: StaffMember[];
  projects: ProjectInfo[];
  phDStudents: PhDStudent[];
  scientificOutputs: ScientificOutput[];
  ipIntelligence: IPIntelligence[];
  equipment: Equipment[];
  facts: ProfileFact[];
}): StaffPortfolio | null {
  const { staffId, staff, projects, phDStudents, scientificOutputs, ipIntelligence, equipment, facts } = params;
  const member = staff.find(item => item.ID === staffId);
  if (!member) return null;

  const ids = (section: ProfileFact['section'], role?: (r: string) => boolean) => new Set(
    facts.filter(f => f.section === section && (!role || role(f.role ?? ''))).map(f => f.recordId));
  const projectIds = ids('PROJECT');
  const supervised = ids('STUDENT', r => r.startsWith('Supervisor'));
  const coSupervised = ids('STUDENT', r => r.startsWith('Co-supervisor'));
  const outputIds = ids('OUTPUT');
  const ipIds = ids('IP');
  const equipmentIds = ids('EQUIPMENT');

  return {
    member,
    linkedProjects: projects.filter(p => projectIds.has(p.ProjectID)),
    supervisedPhDs: phDStudents.filter(s => supervised.has(s.EnrollmentNo)),
    coSupervisedPhDs: phDStudents.filter(s => coSupervised.has(s.EnrollmentNo)),
    publications: scientificOutputs.filter(o => outputIds.has(o.id)),
    ipAssets: ipIntelligence.filter(i => ipIds.has(i.id)),
    assignedEquipment: equipment.filter(e => equipmentIds.has(e.UInsID)),
  };
}
