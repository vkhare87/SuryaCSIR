import type { ProjectInfo } from '../../types';

export interface ComparablesInput {
  domainTheme: string;
  divisionCode: string;
  fundType: string;
}

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'for', 'and', 'in', 'on', 'to', 'with', 'using']);

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Rank past projects comparable to a proposal: keyword overlap on the project
 * name (2 pts/keyword), same division (+2), same fund type (+1). Zero-score
 * projects are excluded.
 */
export function findComparables(
  projects: ProjectInfo[],
  input: ComparablesInput,
  limit = 5,
): ProjectInfo[] {
  const keywords = new Set(tokens(input.domainTheme));
  return projects
    .map(p => {
      const nameTokens = tokens(p.ProjectName);
      const keywordHits = nameTokens.filter(t => keywords.has(t)).length;
      let score = keywordHits * 2;
      if (p.DivisionCode === input.divisionCode) score += 2;
      if (p.FundType === input.fundType) score += 1;
      if (keywordHits === 0 && p.DivisionCode !== input.divisionCode) score = 0;
      return { p, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.p);
}
