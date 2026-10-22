import type {
  AWPActivityRow, AWPContent, AWPDevelopment, AWPObjectives, AWPProjectKind, AWPStatus, PMSAWP,
} from '../../types/pms';

export const AWP_PROJECT_LABELS: Record<AWPProjectKind, string> = {
  CSIR: 'CSIR Projects',
  EXTERNAL: 'Externally funded Projects (Govt. / Industry)',
  LAB_MANDATE: 'Lab-mandate specific Projects (assigned by Director or DG, CSIR)',
  OTHER: 'Any other',
};

export const AWP_OBJECTIVE_LABELS: [keyof AWPObjectives, string][] = [
  ['projectDetails', '(a) Project details'],
  ['hrd', '(b) Human Resource Development (AcSIR / skill development / training interns etc.)'],
  ['processes', '(c) Processes / Technology / Design'],
  ['patents', '(d) Patents'],
  ['publications', '(e) Publications'],
  ['other', '(f) Any other'],
];

export const AWP_DEVELOPMENT_LABELS: [keyof AWPDevelopment, string][] = [
  ['fellowships', '(a) Fellowships / Joint Exchange Programmes'],
  ['training', '(b) Training Courses'],
  ['academic', '(c) Academic work (AcSIR / PhD supervision / guiding interns / proposal writing etc.)'],
  ['other', '(d) Any other'],
];

/** Part V activity rows, in notification order. Labs may add more rows. */
export const AWP_ACTIVITY_LABELS = [
  'R&D — Fundamental Research',
  'R&D — Translational Research',
  'R&D — Allied Services',
  'R&D — Management Services',
  'Leadership / HoD',
  'Outreach activities',
  'Any other',
] as const;

export const AWP_STATUS_LABEL: Record<AWPStatus, string> = {
  DRAFT:         'Draft',
  WITH_RO:       'With Reporting Officer',
  WITH_RVO:      'With Reviewing Officer',
  WITH_DIRECTOR: 'With Director',
  RETURNED:      'Returned for revision',
  APPROVED:      'Approved',
};

export function emptyAWPContent(): AWPContent {
  return {
    partA: {
      name: '', employeeId: '', group: '', designation: '', division: '', dob: '',
      dojCsir: '', dojGrade: '', category: '', email: '', mobile: '',
      reportingOfficer: '', reviewingOfficer: '', prevPmsOnTime: null, prevPmsDate: '',
    },
    activitySplit: AWP_ACTIVITY_LABELS.map(label => ({ label, role: '', timePct: 0 })),
    projects: (['CSIR', 'EXTERNAL', 'LAB_MANDATE', 'OTHER'] as const).map(kind => ({
      kind, details: '', objectives: '', resources: '', confidential: false,
    })),
    objectives: { projectDetails: '', hrd: '', processes: '', patents: '', publications: '', other: '' },
    development: { fellowships: '', training: '', academic: '', other: '' },
    institutionalWork: '',
    other: '',
  };
}

export function activityTotal(rows: AWPActivityRow[]): number {
  return rows.reduce((s, r) => s + (Number(r.timePct) || 0), 0);
}

/** Reporting year (1 Apr – 31 Mar) containing `date`, as '2026-27'. */
export function reportingYearFor(date: Date): string {
  const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** '2026-27' → '2027-28'. */
export function nextReportingYear(year: string): string {
  return reportingYearFor(new Date(parseInt(year.slice(0, 4), 10) + 1, 3, 1));
}

/** Years offered on "My AWP": the current one, the next one, and any the scientist already has. */
export function awpYearOptions(now: Date, existing: string[]): string[] {
  const current = reportingYearFor(now);
  return Array.from(new Set([current, nextReportingYear(current), ...existing])).sort();
}

/** §5.E.a.vii — revisions allowed through 30 Sep of the first year. */
export function revisionWindowOpen(year: string, now: Date = new Date()): boolean {
  const start = parseInt(year.slice(0, 4), 10);
  return now.getTime() <= new Date(start, 8, 30, 23, 59, 59, 999).getTime();
}

export type AWPAction = 'EDIT' | 'RO_REVIEW' | 'RVO_REVIEW' | 'DIRECTOR_DECIDE';

/** What the viewer may do with this AWP right now. Mirrors the RPC guards. */
export function awpActionFor(
  awp: PMSAWP,
  ctx: { staffId: string | null; isDirector: boolean },
): AWPAction | null {
  const me = ctx.staffId;
  switch (awp.status) {
    case 'DRAFT':
    case 'RETURNED':
      return me != null && me === awp.staffId ? 'EDIT' : null;
    case 'WITH_RO':
      return me != null && me === awp.reportingOfficerId ? 'RO_REVIEW' : null;
    case 'WITH_RVO':
      return me != null && me === awp.reviewingOfficerId ? 'RVO_REVIEW' : null;
    case 'WITH_DIRECTOR':
      return ctx.isDirector ? 'DIRECTOR_DECIDE' : null;
    default:
      return null;
  }
}
