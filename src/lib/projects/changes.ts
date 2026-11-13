import { BUDGET_HEADS, headLabel, rupees } from './heads';
import type {
  ChangeKind, ChangeLine, ChangePayload, ChangeStatus, ChangeStepKind, ProjectBudgetLine, ProjectExpenditure,
  ReappropriationMove, RephaseMove,
} from '../../types/projectFile';

export interface ChangeKindInfo {
  kind: ChangeKind;
  label: string;
  /** One line a PI can choose by. */
  when: string;
  /** What the guidelines forbid, shown beside the form. */
  rules: string[];
  hqOnly?: boolean;
}

// Guidelines (April 2025) §6.4 and §7.2. The same rules are enforced by
// project_change_deltas() in 20261112000001; these only explain them early.
export const CHANGE_KINDS: ChangeKindInfo[] = [
  {
    kind: 'TIME_OVERRUN', label: 'More time', when: 'The work needs longer; the cost stays the same.',
    rules: ['Allowed only in genuine cases; the reasons for the delay are examined.'],
  },
  {
    kind: 'RCE', label: 'Revised cost estimate', when: 'The project needs more money than sanctioned (with or without more time).',
    rules: ['Enter the whole revised budget.', 'On HQ projects, a rise above 20% also goes to the Revised Cost Committee.'],
  },
  {
    kind: 'REPHASING', label: 'Carry money forward', when: 'Unspent money of one year is needed in a later year.',
    rules: ['Travel (India and abroad) and project manpower cannot be rephased.', 'Only unspent money moves; the total stays the same.'],
  },
  {
    kind: 'REAPPROPRIATION', label: 'Move money between heads', when: 'Money sanctioned under one head is needed under another, in the same year.',
    rules: ['Only within Capital or within Revenue — never between them.', 'Travel cannot be increased.', 'Only unspent money moves.'],
  },
  {
    kind: 'REALLOCATION', label: 'Move money to or from another lab', when: 'A participating laboratory needs part of the funds, or sends some here.',
    rules: ['Only on HQ projects with participating laboratories.', 'Money coming in can be used only for heads approved under the project.'],
    hqOnly: true,
  },
  {
    kind: 'FORECLOSURE', label: 'Close the project early', when: 'Continuing is no longer worth it.',
    rules: ['Needs a cost-benefit analysis of continuing against stopping.', 'On approval the project is foreclosed and its remaining reviews are cancelled.'],
  },
];

export const changeKindInfo = (k: ChangeKind) => CHANGE_KINDS.find(c => c.kind === k)!;

export const STEP_LABELS: Record<ChangeStepKind, string> = {
  PME_VETTING: 'PME vetting',
  FINANCE: 'Finance',
  REVIEW_COMMITTEE: 'Review committee',
  RESEARCH_COUNCIL: 'Research Council',
  DIRECTOR_APPROVAL: 'Director approves',
  DIRECTOR_FORWARD: 'Director forwards',
  MONITORING_COMMITTEE: 'Monitoring Committee',
  REVISED_COST_COMMITTEE: 'Revised Cost Committee',
  COMPETENT_AUTHORITY: 'Competent authority (HQ)',
};

export const CHANGE_STATUS: Record<ChangeStatus, { label: string; variant: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Draft', variant: 'neutral' },
  SUBMITTED: { label: 'Submitted', variant: 'info' },
  UNDER_REVIEW: { label: 'In review', variant: 'info' },
  RETURNED: { label: 'Returned to you', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'danger' },
  WITHDRAWN: { label: 'Withdrawn', variant: 'neutral' },
};

/** The route a request will take; mirrors project_change_step_kinds(). */
export function changeRoute(track: string | null | undefined, kind: ChangeKind, increasePct: number | null = null): ChangeStepKind[] {
  if (track === 'ULIP' || track === 'OLP') return ['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL'];
  if (track === 'EFP') return ['PME_VETTING', 'DIRECTOR_FORWARD', 'COMPETENT_AUTHORITY'];
  switch (kind) {
    case 'TIME_OVERRUN': return ['PME_VETTING', 'RESEARCH_COUNCIL', 'MONITORING_COMMITTEE', 'COMPETENT_AUTHORITY'];
    case 'RCE': return (increasePct ?? 0) <= 20
      ? ['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'COMPETENT_AUTHORITY']
      : ['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'MONITORING_COMMITTEE', 'REVISED_COST_COMMITTEE', 'COMPETENT_AUTHORITY'];
    case 'FORECLOSURE': return ['PME_VETTING', 'MONITORING_COMMITTEE', 'RESEARCH_COUNCIL'];
    default: return ['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'MONITORING_COMMITTEE', 'COMPETENT_AUTHORITY'];
  }
}

export interface HeadCell { fiscalYear: string; head: string; sanctioned: number; spent: number; unspent: number }

/** Sanctioned, spent and unspent per year and head — what may move. */
export function headCells(lines: Pick<ProjectBudgetLine, 'fiscalYear' | 'head' | 'amount'>[],
                          spend: Pick<ProjectExpenditure, 'fiscalYear' | 'head' | 'amount'>[]): HeadCell[] {
  const m = new Map<string, HeadCell>();
  const at = (fy: string, head: string) => {
    const k = `${fy}|${head}`;
    if (!m.has(k)) m.set(k, { fiscalYear: fy, head, sanctioned: 0, spent: 0, unspent: 0 });
    return m.get(k)!;
  };
  for (const l of lines) at(l.fiscalYear, l.head).sanctioned += l.amount;
  for (const e of spend) at(e.fiscalYear, e.head).spent += e.amount;
  return [...m.values()]
    .map(c => ({ ...c, unspent: Math.max(0, c.sanctioned - Math.max(c.spent, 0)) }))
    .sort((a, b) => a.fiscalYear.localeCompare(b.fiscalYear) || a.head.localeCompare(b.head));
}

const isCapital = (head: string) => BUDGET_HEADS.find(h => h.head === head)?.capital ?? false;
const NO_REPHASE = ['TA_INDIA', 'TA_ABROAD', 'MANPOWER'];

/**
 * What stops this request, in words the PI can act on. Empty when the
 * database would accept it as far as the screen can tell.
 */
export function changeProblems(
  kind: ChangeKind, p: ChangePayload, ctx: { track: string | null | undefined; endDate: string | null; cells: HeadCell[] },
): string[] {
  const out: string[] = [];
  const cell = (fy: string, head: string) => ctx.cells.find(c => c.fiscalYear === fy && c.head === head);
  const deltas = new Map<string, number>();
  const move = (fy: string, head: string, d: number) => deltas.set(`${fy}|${head}`, (deltas.get(`${fy}|${head}`) ?? 0) + d);

  if (kind === 'TIME_OVERRUN' || (kind === 'RCE' && p.new_end_date)) {
    if (!p.new_end_date) out.push('Give the new end date.');
    else if (ctx.endDate && p.new_end_date <= ctx.endDate) out.push(`The new end date must be after ${ctx.endDate}.`);
  }
  if (kind === 'FORECLOSURE') {
    if (!p.effective_date) out.push('Give the date the project is to close.');
    if (!p.cost_benefit?.trim()) out.push('Add the cost-benefit analysis of continuing against stopping.');
  }
  if (kind === 'REPHASING') {
    const moves = (p.moves ?? []) as RephaseMove[];
    if (moves.length === 0) out.push('Add an amount to carry forward.');
    for (const m of moves) {
      if (NO_REPHASE.includes(m.head)) out.push(`${headLabel(m.head)} cannot be rephased.`);
      if (m.from_year && m.to_year && m.to_year <= m.from_year) out.push('Money can only be carried forward to a later year.');
      if (!(m.amount > 0)) out.push('Each amount must be above zero.');
      move(m.from_year, m.head, -m.amount);
    }
  }
  if (kind === 'REAPPROPRIATION') {
    const moves = (p.moves ?? []) as ReappropriationMove[];
    if (moves.length === 0) out.push('Add an amount to move.');
    for (const m of moves) {
      if (m.from_head === m.to_head) out.push('Choose two different heads.');
      else if (isCapital(m.from_head) !== isCapital(m.to_head)) out.push('Capital and Revenue cannot be moved into each other.');
      if (m.to_head === 'TA_INDIA' || m.to_head === 'TA_ABROAD') out.push('Travel cannot be increased.');
      if (!(m.amount > 0)) out.push('Each amount must be above zero.');
      move(m.fiscal_year, m.from_head, -m.amount);
    }
  }
  if (kind === 'REALLOCATION') {
    if (ctx.track !== 'HQ') out.push('Only HQ projects with participating laboratories can reallocate.');
    if (!p.lab?.trim()) out.push('Name the other laboratory.');
    const lines = p.lines ?? [];
    if (lines.length === 0) out.push('Add an amount.');
    for (const l of lines) {
      if (!(l.amount > 0)) out.push('Each amount must be above zero.');
      if (p.direction === 'OUT') move(l.fiscal_year, l.head, -l.amount);
      else if (!ctx.cells.some(c => c.head === l.head && c.sanctioned > 0)) out.push(`${headLabel(l.head)} is not approved under this project.`);
    }
  }
  if (kind === 'RCE') {
    const lines = p.lines ?? [];
    const now = ctx.cells.reduce((a, c) => a + c.sanctioned, 0);
    const next = lines.reduce((a, l) => a + (l.amount || 0), 0);
    if (lines.length === 0) out.push('Enter the revised budget.');
    else if (next <= now) out.push(`The revised total (${rupees(next)}) must be above the sanction (${rupees(now)}).`);
    for (const c of ctx.cells) {
      const n = lines.filter(l => l.fiscal_year === c.fiscalYear && l.head === c.head).reduce((a, l) => a + l.amount, 0);
      if (n < c.spent) out.push(`${headLabel(c.head)} ${c.fiscalYear} cannot go below what is already spent (${rupees(c.spent)}).`);
    }
  }
  for (const [k, d] of deltas) {
    const [fy, head] = k.split('|');
    const c = cell(fy, head);
    if (d < 0 && (c?.unspent ?? 0) + d < 0) {
      out.push(`${headLabel(head)} ${fy} has ${rupees(c?.unspent ?? 0)} unspent — only that can move.`);
    }
  }
  return [...new Set(out)];
}

/** RCE rise over the current sanction, in percent; decides the HQ route. */
export function rceIncreasePct(lines: ChangeLine[], cells: HeadCell[]): number | null {
  const now = cells.reduce((a, c) => a + c.sanctioned, 0);
  if (now <= 0) return null;
  const next = lines.reduce((a, l) => a + (l.amount || 0), 0);
  return Math.round(((next - now) * 10000) / now) / 100;
}

/** One line saying what an approved (or proposed) change does. */
export function changeSummary(kind: ChangeKind, p: ChangePayload): string {
  switch (kind) {
    case 'TIME_OVERRUN': return `End date to ${p.new_end_date ?? '—'}`;
    case 'FORECLOSURE': return `Close on ${p.effective_date ?? '—'}`;
    case 'RCE': return `Revised total ${rupees((p.lines ?? []).reduce((a, l) => a + l.amount, 0))}${p.new_end_date ? `, end date ${p.new_end_date}` : ''}`;
    case 'REPHASING': return ((p.moves ?? []) as RephaseMove[])
      .map(m => `${rupees(m.amount)} ${headLabel(m.head).toLowerCase()} ${m.from_year} → ${m.to_year}`).join('; ');
    case 'REAPPROPRIATION': return ((p.moves ?? []) as ReappropriationMove[])
      .map(m => `${rupees(m.amount)} ${headLabel(m.from_head).toLowerCase()} → ${headLabel(m.to_head).toLowerCase()} (${m.fiscal_year})`).join('; ');
    case 'REALLOCATION': return `${rupees((p.lines ?? []).reduce((a, l) => a + l.amount, 0))} ${p.direction === 'OUT' ? 'to' : 'from'} ${p.lab ?? '—'}`;
  }
}
