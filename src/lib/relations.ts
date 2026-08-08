import type { StaffMember, ProjectInfo, ProjectStaff, DivisionInfo } from '../types';

/** Central client-side joins over the already-loaded useData() arrays.
 *  One source of truth for hover peeks, related-entity rails, and the graph. */

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

export function divisionOfStaff(member: StaffMember, divisions: DivisionInfo[]): DivisionInfo | undefined {
  return divisions.find(d => d.divCode === member.Division);
}

/** Projects a staff member leads (PI) or is a team member of. */
export function projectsForStaff(
  member: StaffMember,
  projects: ProjectInfo[],
  projectStaff: ProjectStaff[],
): ProjectInfo[] {
  const name = norm(member.Name);
  const id = norm(member.ID);
  const led = projects.filter(p => {
    const pi = norm(p.PrincipalInvestigator);
    return pi === name || pi === id;
  });
  const memberProjectNos = new Set(
    projectStaff.filter(ps => norm(ps.StaffName) === name).map(ps => ps.ProjectNo),
  );
  const onTeam = projects.filter(p => memberProjectNos.has(p.ProjectNo));
  const seen = new Set<string>();
  return [...led, ...onTeam].filter(p => (seen.has(p.ProjectID) ? false : (seen.add(p.ProjectID), true)));
}

/** Staff on a project: the PI (resolved to a StaffMember) plus project_staff names. */
export function teamForProject(
  project: ProjectInfo,
  staff: StaffMember[],
  projectStaff: ProjectStaff[],
): StaffMember[] {
  const names = new Set(
    projectStaff.filter(ps => ps.ProjectNo === project.ProjectNo).map(ps => norm(ps.StaffName)),
  );
  const pi = norm(project.PrincipalInvestigator);
  return staff.filter(s => names.has(norm(s.Name)) || norm(s.Name) === pi || norm(s.ID) === pi);
}

export interface GraphNode { id: string; name: string; kind: 'staff' | 'project' | 'division'; val: number; }
export interface GraphLink { source: string; target: string; }
export interface GraphData { nodes: GraphNode[]; links: GraphLink[]; }

/** Build a force-graph dataset: staff↔division (works-in), staff↔project (leads/member-of). */
export function buildGraph(
  staff: StaffMember[],
  projects: ProjectInfo[],
  projectStaff: ProjectStaff[],
  divisions: DivisionInfo[],
  kinds: { staff: boolean; project: boolean; division: boolean },
): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const deg = new Map<string, number>();
  const bump = (id: string) => deg.set(id, (deg.get(id) ?? 0) + 1);

  const sid = (s: StaffMember) => `s:${s.ID}`;
  const did = (d: string) => `d:${d}`;
  const pid = (p: ProjectInfo) => `p:${p.ProjectID}`;
  const has = new Set<string>();
  const add = (id: string, name: string, kind: GraphNode['kind']) => {
    if (has.has(id)) return; has.add(id);
    nodes.push({ id, name, kind, val: 1 });
  };

  if (kinds.division) divisions.forEach(d => add(did(d.divCode), d.divName || d.divCode, 'division'));
  if (kinds.staff) staff.forEach(s => add(sid(s), s.Name || s.ID, 'staff'));
  if (kinds.project) projects.forEach(p => add(pid(p), p.ProjectName || p.ProjectNo, 'project'));

  if (kinds.staff && kinds.division) {
    staff.forEach(s => {
      if (s.Division && has.has(did(s.Division))) {
        links.push({ source: sid(s), target: did(s.Division) }); bump(sid(s)); bump(did(s.Division));
      }
    });
  }
  if (kinds.staff && kinds.project) {
    staff.forEach(s => {
      projectsForStaff(s, projects, projectStaff).forEach(p => {
        if (has.has(pid(p))) { links.push({ source: sid(s), target: pid(p) }); bump(sid(s)); bump(pid(p)); }
      });
    });
  }

  nodes.forEach(n => { n.val = 1 + (deg.get(n.id) ?? 0); });
  return { nodes, links };
}
