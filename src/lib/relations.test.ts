import { describe, it, expect } from 'vitest';
import { projectsForStaff, teamForProject, buildGraph } from './relations';
import type { StaffMember, ProjectInfo, ProjectStaff, DivisionInfo } from '../types';

const s = (id: string, Name: string, Division: string) => ({ ID: id, Name, Division } as StaffMember);
const p = (ProjectID: string, ProjectNo: string, ProjectName: string, PI: string) =>
  ({ ProjectID, ProjectNo, ProjectName, PrincipalInvestigator: PI } as ProjectInfo);

const staff = [s('1', 'Alice', 'MAT'), s('2', 'Bob', 'MAT'), s('3', 'Carol', 'CHE')];
const projects = [p('p1', 'PR-1', 'Alloys', 'Alice'), p('p2', 'PR-2', 'Coatings', 'zed')];
const projectStaff = [{ ProjectNo: 'PR-2', StaffName: 'Bob' } as ProjectStaff];
const divisions = [{ divCode: 'MAT', divName: 'Materials' } as DivisionInfo];

describe('relations', () => {
  it('finds projects a staff leads as PI (by name)', () => {
    expect(projectsForStaff(staff[0], projects, projectStaff).map(x => x.ProjectID)).toEqual(['p1']);
  });

  it('finds projects a staff is a team member of (via project_staff)', () => {
    expect(projectsForStaff(staff[1], projects, projectStaff).map(x => x.ProjectID)).toEqual(['p2']);
  });

  it('dedupes when someone both leads and is listed on a project', () => {
    const ps = [{ ProjectNo: 'PR-1', StaffName: 'Alice' } as ProjectStaff];
    expect(projectsForStaff(staff[0], projects, ps).map(x => x.ProjectID)).toEqual(['p1']);
  });

  it('resolves a project team from PI + project_staff', () => {
    expect(teamForProject(projects[1], staff, projectStaff).map(x => x.Name).sort()).toEqual(['Bob']);
  });

  it('builds a graph with staff↔division and staff↔project links', () => {
    const g = buildGraph(staff, projects, projectStaff, divisions, { staff: true, project: true, division: true });
    expect(g.nodes.length).toBe(3 + 2 + 1);
    // Alice→Materials, Bob→Materials, Alice→Alloys, Bob→Coatings
    expect(g.links.length).toBe(4);
  });

  it('omits a kind when toggled off', () => {
    const g = buildGraph(staff, projects, projectStaff, divisions, { staff: true, project: false, division: true });
    expect(g.nodes.some(n => n.kind === 'project')).toBe(false);
  });
});
