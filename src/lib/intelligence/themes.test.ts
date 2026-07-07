import { describe, it, expect } from 'vitest';
import { emergingThemes } from './themes';
import type { ProjectInfo } from '../../types';

function proj(over: Partial<ProjectInfo>): ProjectInfo {
  return {
    ProjectID: 'p', ProjectNo: 'p', ProjectName: '', FundType: '', SponsorerType: '',
    SponsorerName: '', ProjectCategory: '', ProjectStatus: '', StartDate: '',
    CompletioDate: '', SanctionedCost: '', UtilizedAmount: '', PrincipalInvestigator: '',
    DivisionCode: '', Extension: '', ApprovalAuthority: '', ...over,
  };
}

const now = new Date('2026-07-01');

describe('emergingThemes', () => {
  it('flags a keyword rising across >=2 divisions in the recent window', () => {
    const projects = [
      proj({ ProjectNo: 'A', ProjectName: 'Graphene sensors', DivisionCode: 'CMD', StartDate: '2025-03-01' }),
      proj({ ProjectNo: 'B', ProjectName: 'Graphene coatings', DivisionCode: 'LWMD', StartDate: '2024-08-01' }),
      proj({ ProjectNo: 'C', ProjectName: 'Graphene basics', DivisionCode: 'CMD', StartDate: '2018-01-01' }),
    ];
    const themes = emergingThemes(projects, now);
    const g = themes.find(t => t.keyword === 'graphene');
    expect(g).toBeDefined();
    expect(g?.recentCount).toBe(2);
    expect(g?.priorCount).toBe(1);
    expect(g?.divisions.sort()).toEqual(['CMD', 'LWMD']);
  });

  it('ignores single-division or declining keywords', () => {
    const projects = [
      proj({ ProjectNo: 'A', ProjectName: 'Bamboo housing', DivisionCode: 'SCMD', StartDate: '2025-01-01' }),
      proj({ ProjectNo: 'B', ProjectName: 'Bamboo roads', DivisionCode: 'SCMD', StartDate: '2024-01-01' }),
    ];
    expect(emergingThemes(projects, now).find(t => t.keyword === 'bamboo')).toBeUndefined();
  });
});
