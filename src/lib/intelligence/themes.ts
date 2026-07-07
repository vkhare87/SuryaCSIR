import type { ProjectInfo } from '../../types';

export interface ThemeSignal {
  keyword: string;
  divisions: string[];
  recentCount: number;
  priorCount: number;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'using', 'study', 'studies', 'development',
  'analysis', 'project', 'research', 'novel', 'based', 'from',
]);

const RECENT_WINDOW_YEARS = 3;

function keywords(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 3 && !STOPWORDS.has(t));
}

/**
 * Convergence detection: keywords whose recent-window project count (last 3y)
 * exceeds their prior count AND that appear in >=2 divisions recently —
 * i.e. themes different groups are independently moving toward.
 */
export function emergingThemes(projects: ProjectInfo[], now = new Date()): ThemeSignal[] {
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - RECENT_WINDOW_YEARS);

  const recent = new Map<string, { count: number; divisions: Set<string> }>();
  const prior = new Map<string, number>();

  for (const p of projects) {
    const start = new Date(p.StartDate);
    if (isNaN(start.getTime())) continue;
    const isRecent = start >= cutoff;
    for (const kw of new Set(keywords(p.ProjectName))) {
      if (isRecent) {
        const entry = recent.get(kw) ?? { count: 0, divisions: new Set<string>() };
        entry.count += 1;
        if (p.DivisionCode) entry.divisions.add(p.DivisionCode);
        recent.set(kw, entry);
      } else {
        prior.set(kw, (prior.get(kw) ?? 0) + 1);
      }
    }
  }

  const signals: ThemeSignal[] = [];
  for (const [kw, entry] of recent) {
    const priorCount = prior.get(kw) ?? 0;
    if (entry.divisions.size >= 2 && entry.count > priorCount) {
      signals.push({
        keyword: kw,
        divisions: [...entry.divisions],
        recentCount: entry.count,
        priorCount,
      });
    }
  }
  return signals.sort((a, b) => b.recentCount - a.recentCount);
}
