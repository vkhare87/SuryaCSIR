import type { ProjectBudgetLine, ProjectExpenditure, ProjectReceipt } from '../../types/projectFile';

export interface YearRow {
  fiscalYear: string;
  sanctioned: number;
  received: number;
  spent: number;
  /** Received less spent. */
  balance: number;
}

export interface HeadRow {
  fiscalYear: string;
  head: string;
  sanctioned: number;
  spent: number;
  /** Spent more than the year's sanction for this head: a re-appropriation is due. */
  over: boolean;
}

export interface FundSummary {
  years: YearRow[];
  heads: HeadRow[];
  total: YearRow & { fiscalYear: 'Total' };
}

const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

/**
 * Sanctioned, received, spent and balance per financial year, and spend
 * against sanction per year and head. Reversal entries are negative, so plain
 * sums net them out. The same arithmetic is checked in SQL by
 * scripts/db/projectExecution.db.test.ts ("worked example").
 */
export function fundSummary(
  lines: Pick<ProjectBudgetLine, 'fiscalYear' | 'head' | 'amount'>[],
  receipts: Pick<ProjectReceipt, 'fiscalYear' | 'amount'>[],
  spend: Pick<ProjectExpenditure, 'fiscalYear' | 'head' | 'amount'>[],
): FundSummary {
  const sanctioned = new Map<string, number>();
  const received = new Map<string, number>();
  const spent = new Map<string, number>();
  const headSanction = new Map<string, number>();
  const headSpent = new Map<string, number>();

  for (const l of lines) { add(sanctioned, l.fiscalYear, l.amount); add(headSanction, `${l.fiscalYear}|${l.head}`, l.amount); }
  for (const r of receipts) add(received, r.fiscalYear, r.amount);
  for (const e of spend) { add(spent, e.fiscalYear, e.amount); add(headSpent, `${e.fiscalYear}|${e.head}`, e.amount); }

  const yearKeys = [...new Set([...sanctioned.keys(), ...received.keys(), ...spent.keys()])].sort();
  const years = yearKeys.map((fy) => {
    const r = received.get(fy) ?? 0;
    const s = spent.get(fy) ?? 0;
    return { fiscalYear: fy, sanctioned: sanctioned.get(fy) ?? 0, received: r, spent: s, balance: r - s };
  });

  const headKeys = [...new Set([...headSanction.keys(), ...headSpent.keys()])].sort();
  const heads = headKeys.map((k) => {
    const [fiscalYear, head] = k.split('|');
    const sanc = headSanction.get(k) ?? 0;
    const sp = headSpent.get(k) ?? 0;
    return { fiscalYear, head, sanctioned: sanc, spent: sp, over: sp > sanc };
  });

  const sum = (f: (y: YearRow) => number) => years.reduce((a, y) => a + f(y), 0);
  return {
    years,
    heads,
    total: {
      fiscalYear: 'Total', sanctioned: sum(y => y.sanctioned), received: sum(y => y.received),
      spent: sum(y => y.spent), balance: sum(y => y.balance),
    },
  };
}
