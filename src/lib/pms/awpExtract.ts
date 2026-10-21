import { AWP_ACTIVITY_LABELS, activityTotal, emptyAWPContent } from './awp';
import type { AWPActivityRow, AWPContent, AWPProjectKind, AWPVerdict } from '../../types/pms';

export type ExtractConfidence = 'high' | 'low' | 'empty';

export interface AWPExtractResult {
  content: AWPContent;
  employeeId: string | null;
  name: string | null;
  reportingYear: string | null;
  roVerdict: AWPVerdict | null;
  confidence: Record<'partA' | 'activities' | 'projects' | 'objectives' | 'development' | 'other', ExtractConfidence>;
}

// Parses OCR / text-layer output of a Part V form (CSIR template or the
// AMPRI letterhead variant). Scanned tables come out with their columns
// merged onto one line, so this is best effort: every field is shown to a
// human before saving. ponytail: heading/anchor heuristics tuned on one real
// sample; add fixtures as other labs' layouts turn up.

// Footers, page markers, table headers and the form's own instructions.
const NOISE = [
  /CSIR PMS Guidelines/i, /^=== PAGE/, /^Indicate your role/i, /^\W*\d?\s*Time\s*$/i,
  /Nature of Activity/i, /Committed\s*\(%\)/i, /Resources\s*\(availability/i,
  /Addressed in the RY/i, /^Project Details\b/i,
];

const ACTIVITY_PATTERNS: [string, RegExp][] = [
  [AWP_ACTIVITY_LABELS[0], /fundamental\s+research/i],
  [AWP_ACTIVITY_LABELS[1], /translational\s+research/i],
  [AWP_ACTIVITY_LABELS[2], /allied\s+services/i],
  [AWP_ACTIVITY_LABELS[3], /management\s+services/i],
  [AWP_ACTIVITY_LABELS[4], /leadership\s*\/?\s*hod/i],
  [AWP_ACTIVITY_LABELS[5], /outreach\s+activities/i],
  [AWP_ACTIVITY_LABELS[6], /^\W*any\s+other\b/i],
];

const PROJECT_ANCHORS: [AWPProjectKind, RegExp][] = [
  ['CSIR', /CSIR\s+Projects?\b/i],
  ['EXTERNAL', /Externally\s+funded/i],
  ['LAB_MANDATE', /Lab-?\s*mandate/i],
  ['OTHER', /^\W*Any\s+other\b/i],
];

const OBJECTIVE_ANCHORS: [keyof AWPContent['objectives'], RegExp][] = [
  ['projectDetails', /\(a\)\s*Project\s+details/i],
  ['hrd', /\(b\)\s*Human\s+Resource\s+Development/i],
  ['processes', /\(c\)\s*Processes\s*\/\s*Technology\s*\/\s*Design/i],
  ['patents', /\(d\)\s*Patents/i],
  ['publications', /\(e\)\s*Publications/i],
  ['other', /\(f\)\s*[^\n]*?(?=[A-Z][a-z]|$)/],
];

const DEVELOPMENT_ANCHORS: [keyof AWPContent['development'], RegExp][] = [
  ['fellowships', /\(a\)\s*Fellowships\s*\/\s*Joint\s+Exchange\s+Programmes/i],
  ['training', /\(b\)\s*Training\s+Courses/i],
  ['academic', /\(c\)\s*Academic\s+work/i],
  ['other', /\(d\)\s*Any\s+other/i],
];

const DATE = String.raw`(\d{1,2}\/\d{1,2}\/\d{4})`;

function grab(text: string, re: RegExp): string {
  return re.exec(text)?.[1]?.trim() ?? '';
}

function cleanLine(line: string): string {
  return line.trim().replace(/^(?:(?:[®*«•¢=|]|e(?=\s))\s*)+/, '').replace(/\s*\|\s*$/, '').trim();
}

function indexOf(lines: string[], re: RegExp, from = 0): number {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i;
  return -1;
}

/** Lines between the first `start` heading and the next `end` heading (exclusive). */
function region(lines: string[], start: RegExp, end: RegExp | null): string[] {
  const s = indexOf(lines, start);
  if (s < 0) return [];
  const e = end ? indexOf(lines, end, s + 1) : -1;
  return lines.slice(s + 1, e < 0 ? lines.length : e);
}

/**
 * Split region lines among anchors. 'after': an anchor owns its line and the
 * lines after it; the first anchor also owns any text above it. 'mid':
 * lines go to the nearest anchor (table cells are vertically centred on
 * their label, so text sits both above and below it).
 */
function segment<K extends string>(lines: string[], anchors: [K, RegExp][], mode: 'after' | 'mid'): Map<K, string> {
  const found = anchors
    .map(([key, re]) => ({ key, re, at: indexOf(lines, re) }))
    .filter(a => a.at >= 0)
    .sort((a, b) => a.at - b.at);
  const out = new Map<K, string>();
  found.forEach((a, i) => {
    const prev = found[i - 1];
    const next = found[i + 1];
    const from = i === 0 ? 0 : mode === 'mid' ? Math.floor((prev.at + a.at) / 2) + 1 : a.at;
    const to = !next ? lines.length : mode === 'mid' ? Math.floor((a.at + next.at) / 2) + 1 : next.at;
    const text = lines.slice(from, to)
      .map(l => (l === lines[a.at] ? l.replace(a.re, '') : l))
      .map(cleanLine)
      .filter(Boolean)
      .join('\n');
    out.set(a.key, text);
  });
  return out;
}

const TRAILING_PCT = /\s(\d{1,3})\s*$/;

function parseActivities(lines: string[]): { rows: AWPActivityRow[]; confidence: ExtractConfidence } {
  type Anchor = { label: string; at: number; pct: number | null; re: RegExp | null };
  const anchors: Anchor[] = [];
  lines.forEach((line, at) => {
    const known = ACTIVITY_PATTERNS.find(([, re]) => re.test(line));
    const m = TRAILING_PCT.exec(line);
    const pct = m && Number(m[1]) <= 100 ? Number(m[1]) : null;
    if (known) {
      if (!anchors.some(a => a.label === known[0])) anchors.push({ label: known[0], at, pct, re: known[1] });
    } else if (pct !== null) {
      // A lab-added row: its label is the leading capitalised words.
      const words = /^\W*((?:[A-Z][\w&/-]*\s+){0,1}[A-Z][\w&/-]*)/.exec(line);
      if (words) anchors.push({ label: words[1], at, pct, re: new RegExp('^\\W*' + words[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
    }
  });
  if (anchors.length === 0) return { rows: emptyAWPContent().activitySplit, confidence: 'empty' };

  const roles = segment(lines, anchors.map(a => [a.label, a.re ?? /$^/] as [string, RegExp]), 'after');
  // The label cell shares OCR lines with the role cell: drop the "R&D —"
  // stub and the % column from every line.
  const role = (a: Anchor) => (roles.get(a.label) ?? '')
    .split('\n')
    .map(l => l.replace(/^R&D\s*[—–-]?\s*/, '').replace(TRAILING_PCT, '').trim())
    .filter(Boolean)
    .join('\n');

  const fixed = AWP_ACTIVITY_LABELS.map(label => {
    const a = anchors.find(x => x.label === label);
    return { label, role: a ? role(a) : '', timePct: a?.pct ?? 0 };
  });
  const extras = anchors
    .filter(a => !(AWP_ACTIVITY_LABELS as readonly string[]).includes(a.label))
    .map(a => ({ label: a.label, role: role(a), timePct: a.pct ?? 0 }));
  const rows = [...fixed, ...extras];

  const missingPct = anchors.some(a => a.pct === null);
  return { rows, confidence: missingPct || activityTotal(rows) !== 100 ? 'low' : 'high' };
}

function parseVerdict(lines: string[]): AWPVerdict | null {
  const text = lines.join('\n');
  const yes = /(\S)?\s*Appears reasonable/.exec(text)?.[1] ?? '';
  const no = /(\S)?\s*Does not appear reasonable/.exec(text)?.[1] ?? '';
  const ticked = (c: string) => /^[✓√☑✔vVxX]$/.test(c);
  const blank = (c: string) => /^[0Oo☐□]$/.test(c);
  if (ticked(no)) return 'NOT_REASONABLE';
  if (ticked(yes)) return 'REASONABLE';
  if (blank(no) && text.includes('Appears reasonable')) return 'REASONABLE';
  return null;
}

export function parseAWPText(raw: string): AWPExtractResult {
  const content = emptyAWPContent();
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l && !NOISE.some(re => re.test(l)));
  const text = lines.join('\n');

  // Part A
  const p = content.partA;
  p.name             = grab(text, /Name of Employee\s+(.+?)\s+Employee ID/i);
  p.employeeId       = grab(text, /Employee ID\s*[:-]?\s*(\d{3,})/i);
  p.group            = grab(text, /Group\s*\/\s*Grade\s+(.+?)\s+Date of Birth/i);
  p.dob              = grab(text, new RegExp(String.raw`Date of Birth\s+${DATE}`, 'i'));
  p.designation      = grab(text, /Current Designation\s+(.+?)\s+Division/i);
  p.division         = grab(text, /Division\s*\/\s*Department\s+([^\n|]+)/i);
  p.dojCsir          = grab(text, new RegExp(String.raw`Date of Joining CSIR\s+${DATE}`, 'i'));
  p.dojGrade         = grab(text, new RegExp(String.raw`Date of Joining Present(?:\s+Grade)?\s+${DATE}`, 'i'));
  p.category         = grab(text, /\b(General|OBC|SC|ST|EWS)\b\s*:?\s*Email/);
  p.email            = grab(text, /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,})/);
  p.mobile           = grab(text, /Mobile No\.?\s*(\d{10})/i);
  p.reportingOfficer = grab(text, /Reporting Officer\s+([^\n|]+?)\s*(?:\||$)/m);
  p.reviewingOfficer = grab(text, /Reviewing Officer\s+([^\n|]+?)\s*(?:\||$)/m);
  const prev = /on time\?\s*(\S*?)Yes\s*(\S*?)No/i.exec(text);
  p.prevPmsOnTime    = prev ? (/[✓√☑✔vV]/.test(prev[1]) ? true : /[✓√☑✔vV]/.test(prev[2]) ? false : null) : null;
  p.prevPmsDate      = grab(text, new RegExp(String.raw`date of submission\s*:?\s*${DATE}`, 'i'));
  const startYear = grab(text, /Reporting Period\s*:?\s*1\s*April\s*(\d{4})/i);
  const reportingYear = startYear ? `${startYear}-${String((Number(startYear) + 1) % 100).padStart(2, '0')}` : null;

  // Part B activity table
  const activities = parseActivities(region(lines, /PART\s*B\b/i, /Research Projects/i));
  content.activitySplit = activities.rows;

  // (1) projects — merged columns, so everything lands in `objectives`
  const projects = segment(region(lines, /Research Projects/i, /Research Objectives/i), PROJECT_ANCHORS, 'mid');
  content.projects = content.projects.map(pr => ({ ...pr, objectives: projects.get(pr.kind) ?? '' }));

  // (2) objectives, (3) development
  const objectives = segment(region(lines, /Research Objectives/i, /Professional\s*&\s*Personal Development/i), OBJECTIVE_ANCHORS, 'after');
  for (const [k] of OBJECTIVE_ANCHORS) content.objectives[k] = objectives.get(k) ?? '';
  const development = segment(region(lines, /Professional\s*&\s*Personal Development/i, /Any Other Institutional Work/i), DEVELOPMENT_ANCHORS, 'after');
  for (const [k] of DEVELOPMENT_ANCHORS) content.development[k] = development.get(k) ?? '';

  // (4), (5)
  content.institutionalWork = region(lines, /Any Other Institutional Work/i, /Any Other Matter/i)
    .filter(l => !/Define the work/i.test(l)).map(cleanLine).filter(Boolean).join('\n');
  content.other = region(lines, /Any Other Matter/i, /^Place\b|REVIEW\s*&\s*ENDORSEMENT/i)
    .map(cleanLine).filter(Boolean).join('\n');

  const filled = (s: string) => s.trim().length > 0;
  const some = (xs: string[]): ExtractConfidence => (xs.some(filled) ? 'high' : 'empty');
  const partAFields = Object.values(p).filter((v): v is string => typeof v === 'string');

  return {
    content,
    employeeId: p.employeeId || null,
    name: p.name || null,
    reportingYear,
    roVerdict: parseVerdict(region(lines, /REVIEW\s*&\s*ENDORSEMENT/i, null)),
    confidence: {
      partA: p.employeeId && p.name ? 'high' : some(partAFields) === 'high' ? 'low' : 'empty',
      activities: activities.confidence,
      projects: content.projects.some(pr => filled(pr.objectives)) ? 'low' : 'empty',
      objectives: some(Object.values(content.objectives)),
      development: some(Object.values(content.development)),
      other: some([content.institutionalWork, content.other]),
    },
  };
}
