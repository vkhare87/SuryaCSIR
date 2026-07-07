import { describe, it, expect } from 'vitest';
import { findComparables } from './comparables';
import type { ProjectInfo } from '../../types';

function proj(over: Partial<ProjectInfo>): ProjectInfo {
  return {
    ProjectID: 'p', ProjectNo: 'p', ProjectName: '', FundType: '', SponsorerType: '',
    SponsorerName: '', ProjectCategory: '', ProjectStatus: 'Completed', StartDate: '',
    CompletioDate: '', SanctionedCost: '', UtilizedAmount: '', PrincipalInvestigator: '',
    DivisionCode: '', Extension: '', ApprovalAuthority: '', ...over,
  };
}

const input = { domainTheme: 'Nanomaterials for water purification', divisionCode: 'CMD', fundType: 'GAP' };

describe('findComparables', () => {
  it('ranks keyword + division + fund-type matches first', () => {
    const projects = [
      proj({ ProjectNo: 'A', ProjectName: 'Nanomaterials synthesis for water treatment', DivisionCode: 'CMD', FundType: 'GAP' }),
      proj({ ProjectNo: 'B', ProjectName: 'Bamboo composites', DivisionCode: 'CMD', FundType: 'GAP' }),
      proj({ ProjectNo: 'C', ProjectName: 'Water purification membranes', DivisionCode: 'LWMD', FundType: 'MLP' }),
    ];
    const result = findComparables(projects, input);
    expect(result.map(p => p.ProjectNo)).toEqual(['A', 'C', 'B']);
  });

  it('excludes projects with zero relevance', () => {
    const projects = [proj({ ProjectNo: 'X', ProjectName: 'Unrelated topic', DivisionCode: 'ZZZ', FundType: 'OTHER' })];
    expect(findComparables(projects, input)).toEqual([]);
  });

  it('respects limit', () => {
    const projects = Array.from({ length: 10 }, (_, i) =>
      proj({ ProjectNo: `P${i}`, ProjectName: 'Nanomaterials study', DivisionCode: 'CMD', FundType: 'GAP' }));
    expect(findComparables(projects, input, 5)).toHaveLength(5);
  });
});
