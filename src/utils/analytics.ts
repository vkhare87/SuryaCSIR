import type {
  DivisionInfo,
  Equipment,
  IPIntelligence,
  PhDStudent,
  ProjectInfo,
  ProjectStaff,
  ScientificOutput,
  StaffMember,
} from '../types';

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
  projectAssignments: ProjectStaff[];
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
      activeProjectCount: divisionProjects.filter(item => item.ProjectStatus === 'Active').length,
      projectCount: divisionProjects.length,
      scientificOutputCount: scientificOutputs.filter(item => item.divisionCode === division.divCode).length,
      phdStudentCount: divisionPhDs.length,
      equipmentCount: equipment.filter(item => item.Division === division.divCode).length,
    };
  });
}

export function getStaffPortfolio(params: {
  staffId: string | undefined;
  staff: StaffMember[];
  projects: ProjectInfo[];
  projectStaff: ProjectStaff[];
  phDStudents: PhDStudent[];
  scientificOutputs: ScientificOutput[];
  ipIntelligence: IPIntelligence[];
  equipment: Equipment[];
}): StaffPortfolio | null {
  const {
    staffId,
    staff,
    projects,
    projectStaff,
    phDStudents,
    scientificOutputs,
    ipIntelligence,
    equipment,
  } = params;
  const member = staff.find(item => item.ID === staffId);
  if (!member) return null;

  const projectAssignments = projectStaff.filter(item => personNamesMatch(member.Name, item.StaffName));
  const supervisedPhDs = phDStudents.filter(item => personNamesMatch(member.Name, item.SupervisorName));
  const coSupervisedPhDs = phDStudents.filter(item => personNamesMatch(member.Name, item.CoSupervisorName));
  const linkedProjectNos = new Set([
    ...projectAssignments.map(item => item.ProjectNo),
    ...supervisedPhDs.map(item => item.ProjectNo),
    ...coSupervisedPhDs.map(item => item.ProjectNo),
  ].filter(Boolean));

  const linkedProjects = projects.filter(item =>
    personNamesMatch(member.Name, item.PrincipalInvestigator) ||
    linkedProjectNos.has(item.ProjectNo)
  );

  return {
    member,
    linkedProjects,
    projectAssignments,
    supervisedPhDs,
    coSupervisedPhDs,
    publications: scientificOutputs.filter(item =>
      item.authors.some(author => personNamesMatch(member.Name, author))
    ),
    ipAssets: ipIntelligence.filter(item =>
      item.inventors.some(inventor => personNamesMatch(member.Name, inventor))
    ),
    assignedEquipment: equipment.filter(item =>
      personNamesMatch(member.Name, item.IndenterName) ||
      personNamesMatch(member.Name, item.OperatorName)
    ),
  };
}
