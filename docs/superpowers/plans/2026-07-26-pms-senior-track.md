# PMS Senior Track (Annexure-I / Annexure-II) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every scientist (B–G) and the Director use the PMS portal, with Scientist G / Chief Scientist / Outstanding Scientist / Distinguished Scientist filing the CSIR **Annexure-I** proforma and the Director filing **Annexure-II**, running parallel to the existing Scientist B–F track.

**Architecture:** One new `track` column on `pms_reports`, derived server-side from the caller's staff designation by a BEFORE-INSERT trigger (clients never choose their own format). The annexure proformas are **data**, not new components: a `SectionSpec` array in `src/lib/pms/annexureSpecs.ts` drives one generic renderer `SpecSection.tsx` through the existing `ReportWizard`, `DynamicTable`, and `WordCountTextarea`. Evaluation for senior tracks is a categorical "pen picture" stored in a new `pen_picture` jsonb column on the existing `pms_evaluations` table — the existing assign/complete/auto-advance machinery is reused unchanged; only a new `pms_finalize_senior_report` RPC (no score) is added.

**Tech Stack:** React 19 + TypeScript 5.9 (strict, `verbatimModuleSyntax`), Vite 8, Tailwind 4 semantic tokens, Supabase (Postgres + RLS), vitest + @testing-library/react, @react-pdf/renderer.

## Global Constraints

- Read `CLAUDE.md` and `DESIGN.md` before any visual change. Semantic Tailwind tokens only (`bg-surface`, `text-text-muted`, `border-border`) — never `bg-white`/`text-gray-500`. The accent hex `#c96442` is already used literally throughout `src/components/pms/` and `src/pages/pms/`; match that local convention, do not introduce new raw colors.
- `import type { ... }` for every type-only import (`verbatimModuleSyntax`).
- `interface` for object shapes, `type` for unions.
- Never edit a shipped migration in `supabase/migrations/`. New work goes in `supabase/migrations/20260726000001_pms_senior_track.sql`.
- Every `SECURITY DEFINER` function opens with an authorization block, enforced by `scripts/check_security_definer.py`.
- Never patch `pms_reports.status` from the client — call an RPC.
- Pages consume data via `usePMS()` / `useData()` only — never Supabase directly.
- `npm run build` is the only real typecheck (`npx tsc --noEmit` passes vacuously in this repo). Run it, not `tsc --noEmit`.
- Do not touch the STANDARD (Scientist B–F) flow behaviour. Every task below either adds new code or adds a branch that leaves `track === 'STANDARD'` on exactly its current path.

## Decisions locked in (previously open)

1. **Track precedence:** `Director` role wins over designation. Then designation text (`Chief Scientist` / `Outstanding Scientist` / `Distinguished Scientist`) or grade `G` ⇒ Annexure-I. Then grade B–F ⇒ standard. Otherwise not an appraisee.
2. **Annexure-I evaluation committee:** a new tier `IV` on the existing `pms_evaluation_committees` table (same odd-count / three-role panel rule). No new committee table.
3. **Cycles and the Nov 30 lock:** senior tracks share the same `appraisal_cycles` rows, the same May 15 self-appraisal deadline, and the same absolute lock. The existing lock triggers already cover the new column and rows — no change needed.
4. **Leave-record sign-off (Sr. CoA/CoA/AO):** the leave table is filled in the wizard and the signed hardcopy is uploaded through the existing `AnnexureUpload` step. No new verification column or RPC. *Skipped deliberately — add a `pms_verify_leave_record` RPC only if CSIR-AMPRI requires an in-app countersignature.*
5. **Representation / grievance for senior tracks:** not offered. `pms_finalize_senior_report` leaves `score_communicated_at` NULL, so `representationWindowOpen()` returns false and the existing UI hides the button with no change.

---

## File Structure

**Create**
| File | Responsibility |
|---|---|
| `supabase/migrations/20260726000001_pms_senior_track.sql` | `track` column + derivation trigger, `pen_picture` column, tier `IV`, `pms_finalize_senior_report` |
| `src/lib/pms/annexureSpecs.ts` | The two proformas as data: `SectionSpec` per senior section key, plus `PEN_PICTURE_SPECS` |
| `src/lib/pms/annexureSpecs.test.ts` | Integrity: every wizard-step key resolves to a spec or a form; word caps match the proformas |
| `src/components/pms/SpecSection.tsx` | One renderer for all four spec kinds (`fields`/`prompts`/`table`/`text`) |
| `src/components/pms/PenPictureForm.tsx` | Categorical Appendix-C rating matrix + narrative |

**Modify**
| File | Change |
|---|---|
| `src/types/pms.ts` | `PmsTrack`, `SeniorSectionKey`, `PenPicture`; `track` on `PMSReport`, `penPicture` on `PMSEvaluation`, `'IV'` on `CommitteeTier` |
| `src/lib/pms/constants.ts` | `SENIOR_DESIGNATIONS`, `WizardStep` interface with `awp` flag, `ANNEXURE_I_WIZARD_STEPS`, `ANNEXURE_II_WIZARD_STEPS`, `wizardStepsFor()`, `PERIOD_SECTION_KEYS`, `COMMITTEE_TIERS.IV` |
| `src/lib/pms/permissions.ts` | Add `pmsTrack()`; remove now-dead `isEligibleAppraisee()` |
| `src/lib/pms/permissions.test.ts` | Cover `pmsTrack`; replace the `isEligibleAppraisee` block; tier `IV` for grade G |
| `src/utils/pmsMappers.ts` | Map `track` and `pen_picture` |
| `src/contexts/PMSContext.tsx` | `savePenPicture()`, `finalizeSeniorReport()` |
| `src/components/pms/ReportWizard.tsx` | Track-driven steps, `awp` flag instead of label sniffing, spec-or-form rendering, period from `PERIOD_SECTION_KEYS` |
| `src/pages/pms/ReportNew.tsx` | Gate on `pmsTrack()` instead of `isEligibleAppraisee()` |
| `src/pages/pms/EvaluateReport.tsx` | Render `PenPictureForm` when `report.track !== 'STANDARD'` |
| `src/components/pms/ReportPDF.tsx` | Track-aware title; render flat `fields`/`prompts` values |
| `src/pages/pms/ReportView.tsx` | Track-aware title; hide the meaningless self-score for senior tracks |
| `scripts/check_security_definer.py` | Add `pms_caller_track` to `AUTHZ_MARKERS` |

---

## Task 1: Track resolution, types, and wizard-step constants

Pure TypeScript. No UI, no DB. Everything later depends on the names fixed here.

**Files:**
- Modify: `src/types/pms.ts`
- Modify: `src/lib/pms/constants.ts`
- Modify: `src/lib/pms/permissions.ts`
- Modify: `src/pages/pms/ReportNew.tsx:6,26-28`
- Test: `src/lib/pms/permissions.test.ts`

**Interfaces:**
- Produces:
  - `type PmsTrack = 'STANDARD' | 'ANNEXURE_I' | 'ANNEXURE_II'`
  - `type SeniorSectionKey` (23 Annexure-I keys + 25 Annexure-II keys, listed below)
  - `type SectionKey = StandardSectionKey | SeniorSectionKey`
  - `interface PenPicture { ratings: Record<string, string>; narrative: string }`
  - `PMSReport.track: PmsTrack`, `PMSEvaluation.penPicture: PenPicture | null`
  - `type CommitteeTier = 'I' | 'II' | 'III' | 'IV'`
  - `interface WizardStep { label: string; keys: SectionKey[]; awp?: boolean }`
  - `wizardStepsFor(track: PmsTrack): WizardStep[]`
  - `PERIOD_SECTION_KEYS: SectionKey[]`
  - `SENIOR_DESIGNATIONS: string[]`
  - `pmsTrack(activeRole: Role, designation: string): PmsTrack | null`
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

Replace the whole `describe('scientistGrade / isEligibleAppraisee', ...)` block in `src/lib/pms/permissions.test.ts` and update the tier expectation. Final head of the file:

```typescript
import { describe, it, expect } from 'vitest';
import {
  isEmpoweredCommitteeValid,
  isPanelValid,
  pmsTrack,
  scientistGrade,
  tierForDesignation,
} from './permissions';
import { wizardStepsFor } from './constants';
import type { PMSEvaluationCommitteeMember } from '../../types/pms';

describe('scientistGrade', () => {
  it('parses grade letters from free-text designations', () => {
    expect(scientistGrade('Scientist F')).toBe('F');
    expect(scientistGrade('Scientist-C')).toBe('C');
    expect(scientistGrade('scientist e')).toBe('E');
    expect(scientistGrade('Principal Scientist')).toBeNull();
    expect(scientistGrade('Technician')).toBeNull();
  });
});

describe('pmsTrack', () => {
  it('routes Scientists B through F to the standard proforma', () => {
    for (const g of ['B', 'C', 'D', 'E', 'F']) {
      expect(pmsTrack('Scientist', `Scientist ${g}`)).toBe('STANDARD');
    }
  });

  it('routes Scientist G and the senior designations to Annexure-I', () => {
    expect(pmsTrack('Scientist', 'Scientist G')).toBe('ANNEXURE_I');
    expect(pmsTrack('Scientist', 'Chief Scientist')).toBe('ANNEXURE_I');
    expect(pmsTrack('Scientist', 'outstanding scientist')).toBe('ANNEXURE_I');
    expect(pmsTrack('Scientist', '  Distinguished Scientist ')).toBe('ANNEXURE_I');
  });

  it('routes the Director role to Annexure-II regardless of designation', () => {
    expect(pmsTrack('Director', 'Scientist G')).toBe('ANNEXURE_II');
    expect(pmsTrack('Director', 'Chief Scientist')).toBe('ANNEXURE_II');
    expect(pmsTrack('Director', '')).toBe('ANNEXURE_II');
  });

  it('returns null for designations that are not appraisees', () => {
    expect(pmsTrack('Technician', 'Technician')).toBeNull();
    expect(pmsTrack('Scientist', 'Technical Officer')).toBeNull();
    expect(pmsTrack('Scientist', 'Scientist A')).toBeNull();
  });
});

describe('tierForDesignation', () => {
  it('maps grades to Evaluation Committee tiers', () => {
    expect(tierForDesignation('Scientist B')).toBe('I');
    expect(tierForDesignation('Scientist C')).toBe('I');
    expect(tierForDesignation('Scientist D')).toBe('I');
    expect(tierForDesignation('Scientist E')).toBe('II');
    expect(tierForDesignation('Scientist F')).toBe('III');
    expect(tierForDesignation('Scientist G')).toBe('IV');
    expect(tierForDesignation('Chief Scientist')).toBeNull();
  });
});

describe('wizardStepsFor', () => {
  it('gives each track its own steps and only the standard track an AWP step', () => {
    expect(wizardStepsFor('STANDARD').some(s => s.awp)).toBe(true);
    expect(wizardStepsFor('ANNEXURE_I').some(s => s.awp)).toBe(false);
    expect(wizardStepsFor('ANNEXURE_II').some(s => s.awp)).toBe(false);
  });

  it('starts every track with a period-bearing section and ends with review', () => {
    for (const track of ['STANDARD', 'ANNEXURE_I', 'ANNEXURE_II'] as const) {
      const steps = wizardStepsFor(track);
      expect(steps[0].keys.length).toBeGreaterThan(0);
      expect(steps[steps.length - 1].label).toBe('Review & Submit');
    }
  });
});
```

Keep the existing `member()` helper, `describe('isPanelValid', ...)` and `describe('isEmpoweredCommitteeValid', ...)` blocks below, unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/pms/permissions.test.ts`
Expected: FAIL — `pmsTrack` and `wizardStepsFor` are not exported.

- [ ] **Step 3: Extend `src/types/pms.ts`**

Add near the top, after `CycleStatus`:

```typescript
export type PmsTrack = 'STANDARD' | 'ANNEXURE_I' | 'ANNEXURE_II';
```

Add `track` to `PMSReport` (after `status`):

```typescript
  status: ReportStatus;
  track: PmsTrack;
```

Widen `CommitteeTier`:

```typescript
export type CommitteeTier = 'I' | 'II' | 'III' | 'IV';
```

Add the pen-picture shape and field on `PMSEvaluation` (after `scores`):

```typescript
export interface PenPicture {
  ratings: Record<string, string>;
  narrative: string;
}
```

```typescript
  scores: Record<string, number>;
  penPicture: PenPicture | null;
```

Replace the `SectionKey` union at the bottom of the file with:

```typescript
export type StandardSectionKey =
  | 'summary'
  | 'section_i1'
  | 'section_i2'
  | 'section_i3'
  | 'section_i4'
  | 'section_i5'
  | 'section_ii'
  | 'section_iii'
  | 'section_iv'
  | 'section_v_curriculum'
  | 'section_v_extension'
  | 'section_v_other'
  | 'section_v_shortfall'
  | 'section_vi_national'
  | 'section_vi_international';

/** Annexure-I — Chief Scientist / Outstanding Scientist / Distinguished Scientist. */
export type AnnexureISectionKey =
  | 'sr_identification'
  | 'sr_education'
  | 'sr_employment'
  | 'sr_leave'
  | 'sr_questionnaire'
  | 'sr_b_i1'
  | 'sr_b_i2'
  | 'sr_b_i3'
  | 'sr_b_i4'
  | 'sr_b_ii_journals'
  | 'sr_b_ii_conferences'
  | 'sr_b_ii_books'
  | 'sr_b_ii_institutional'
  | 'sr_b_ii_patents'
  | 'sr_b_ii_ecf'
  | 'sr_b_ii_tech_transfer'
  | 'sr_b_ii_services'
  | 'sr_b_ii_tech_dev'
  | 'sr_b_iii'
  | 'sr_b_iv'
  | 'sr_b_v_lectures'
  | 'sr_b_v_teaching'
  | 'sr_b_vi';

/** Annexure-II — Director of a CSIR Laboratory/Institute. */
export type AnnexureIISectionKey =
  | 'dir_identification'
  | 'dir_education'
  | 'dir_employment'
  | 'dir_leave'
  | 'dir_qa'
  | 'dir_qb'
  | 'dir_qc_matrix'
  | 'dir_qd'
  | 'dir_qe'
  | 'dir_qf'
  | 'dir_b_i1'
  | 'dir_b_i2'
  | 'dir_b_i3'
  | 'dir_b_ii_journals'
  | 'dir_b_ii_conferences'
  | 'dir_b_ii_books'
  | 'dir_b_ii_institutional'
  | 'dir_b_ii_patents'
  | 'dir_b_ii_ecf'
  | 'dir_b_ii_tech_transfer'
  | 'dir_b_ii_services'
  | 'dir_b_ii_tech_dev'
  | 'dir_b_iii'
  | 'dir_b_iv'
  | 'dir_b_v';

export type SeniorSectionKey = AnnexureISectionKey | AnnexureIISectionKey;

export type SectionKey = StandardSectionKey | SeniorSectionKey;
```

- [ ] **Step 4: Extend `src/lib/pms/constants.ts`**

Change the import line at the top of the file to:

```typescript
import type { CommitteeTier, PmsTrack, ReportStatus, SectionKey } from '../../types/pms';
```

Change the `SECTION_KEYS` declaration (line 3) to the narrower type so it keeps meaning "standard track only":

```typescript
export const SECTION_KEYS: StandardSectionKey[] = [
```

and add `StandardSectionKey` to that same import.

Replace the `WIZARD_STEPS` block (lines 24–39) with the typed version plus the two new tracks:

```typescript
export interface WizardStep {
  label: string;
  keys: SectionKey[];
  /** Part V — Annual Work Plan. Standard track only; saved to pms_awp_activities. */
  awp?: boolean;
}

// Sections that carry period_from / period_to for their track. ReportWizard
// lifts those two dates onto pms_reports so pms_submit_report can accept.
export const PERIOD_SECTION_KEYS: SectionKey[] = ['summary', 'sr_identification', 'dir_identification'];

// 2026 5-part proforma. Parts III (Evaluation Committee) and IV (Empowered
// Committee) are appraisal stages, not wizard steps — the scientist wizard
// covers Parts I, II (Appendix-A), and V (AWP).
export const WIZARD_STEPS: WizardStep[] = [
  { label: 'Part I: Basic Information',   keys: ['summary'] },
  { label: 'Appendix-A: Research I (1-3)', keys: ['section_i1', 'section_i2', 'section_i3'] },
  { label: 'Appendix-A: Research I (4-5)', keys: ['section_i4', 'section_i5'] },
  { label: 'Appendix-A: Research II',      keys: ['section_ii'] },
  { label: 'Appendix-A: Research III',     keys: ['section_iii'] },
  { label: 'Appendix-A: Research IV',      keys: ['section_iv'] },
  { label: 'Appendix-A: Contributions',    keys: ['section_v_curriculum', 'section_v_extension', 'section_v_other'] },
  { label: 'Appendix-A: Shortfall Tracking', keys: ['section_v_shortfall'] },
  { label: 'Appendix-A: Recognition',      keys: ['section_vi_national', 'section_vi_international'] },
  { label: 'Part V: Annual Work Plan',     keys: [], awp: true },
  { label: 'Review & Submit',              keys: [] },
];

// Annexure-I — Chief Scientist / Outstanding Scientist / Distinguished Scientist.
// No AWP and no self-score: the appraisal outcome is a categorical pen picture.
export const ANNEXURE_I_WIZARD_STEPS: WizardStep[] = [
  { label: 'Appendix-A: Identification',        keys: ['sr_identification'] },
  { label: 'Appendix-A: Educational Attainments', keys: ['sr_education'] },
  { label: 'Appendix-A: Employment Details',    keys: ['sr_employment'] },
  { label: 'Appendix-A: Leave Record',          keys: ['sr_leave'] },
  { label: 'Questionnaire',                     keys: ['sr_questionnaire'] },
  { label: 'Appendix-B I: R&D and Facilities',  keys: ['sr_b_i1', 'sr_b_i2', 'sr_b_i3'] },
  { label: 'Appendix-B I: Notable Contributions', keys: ['sr_b_i4'] },
  { label: 'Appendix-B II: Publications',       keys: ['sr_b_ii_journals', 'sr_b_ii_conferences', 'sr_b_ii_books', 'sr_b_ii_institutional'] },
  { label: 'Appendix-B II: Patents',            keys: ['sr_b_ii_patents'] },
  { label: 'Appendix-B II: Financial Contribution', keys: ['sr_b_ii_ecf', 'sr_b_ii_tech_transfer', 'sr_b_ii_services'] },
  { label: 'Appendix-B II: Technology Development', keys: ['sr_b_ii_tech_dev'] },
  { label: 'Appendix-B III: Field & Outreach',  keys: ['sr_b_iii'] },
  { label: 'Appendix-B IV: Policy & Leadership', keys: ['sr_b_iv'] },
  { label: 'Appendix-B V: AcSIR / HRD',         keys: ['sr_b_v_lectures', 'sr_b_v_teaching'] },
  { label: 'Appendix-B VI: Recognition',        keys: ['sr_b_vi'] },
  { label: 'Review & Submit',                   keys: [] },
];

// Annexure-II — Director of a CSIR Laboratory/Institute.
export const ANNEXURE_II_WIZARD_STEPS: WizardStep[] = [
  { label: 'Appendix-A: Identification',        keys: ['dir_identification'] },
  { label: 'Appendix-A: Educational Attainments', keys: ['dir_education'] },
  { label: 'Appendix-A: Employment Details',    keys: ['dir_employment'] },
  { label: 'Appendix-A: Leave Record',          keys: ['dir_leave'] },
  { label: 'A. Strategic Positioning',          keys: ['dir_qa'] },
  { label: 'B. Benchmarking',                   keys: ['dir_qb'] },
  { label: 'C. Output / Outcome Matrix',        keys: ['dir_qc_matrix'] },
  { label: 'D. Societal Interventions',         keys: ['dir_qd'] },
  { label: 'E. Administrative & Financial',     keys: ['dir_qe'] },
  { label: 'F. Challenges / Ease of Doing Business', keys: ['dir_qf'] },
  { label: 'Appendix-B I: R&D Involvement',     keys: ['dir_b_i1', 'dir_b_i2', 'dir_b_i3'] },
  { label: 'Appendix-B II: Publications',       keys: ['dir_b_ii_journals', 'dir_b_ii_conferences', 'dir_b_ii_books', 'dir_b_ii_institutional'] },
  { label: 'Appendix-B II: Patents',            keys: ['dir_b_ii_patents'] },
  { label: 'Appendix-B II: Financial Contribution', keys: ['dir_b_ii_ecf', 'dir_b_ii_tech_transfer', 'dir_b_ii_services'] },
  { label: 'Appendix-B II: Technology Development', keys: ['dir_b_ii_tech_dev'] },
  { label: 'Appendix-B III: Institutional Contribution', keys: ['dir_b_iii'] },
  { label: 'Appendix-B IV: Policy & Leadership', keys: ['dir_b_iv'] },
  { label: 'Appendix-B V: Recognition & Guidance', keys: ['dir_b_v'] },
  { label: 'Review & Submit',                   keys: [] },
];

export function wizardStepsFor(track: PmsTrack): WizardStep[] {
  if (track === 'ANNEXURE_I')  return ANNEXURE_I_WIZARD_STEPS;
  if (track === 'ANNEXURE_II') return ANNEXURE_II_WIZARD_STEPS;
  return WIZARD_STEPS;
}
```

Replace the `COMMITTEE_TIERS` block (lines 69–77) with:

```typescript
// Committee tier → Scientist grades it evaluates. Tiers I–III are the 2026
// guidelines (Scientists B–F). Tier IV handles the Annexure-I senior track.
export const COMMITTEE_TIERS: Record<CommitteeTier, string[]> = {
  I:   ['B', 'C', 'D'],
  II:  ['E'],
  III: ['F'],
  IV:  ['G'],
};

export const ELIGIBLE_SCIENTIST_GRADES = ['B', 'C', 'D', 'E', 'F'];

/** Annexure-I designations that do not parse as "Scientist <letter>". */
export const SENIOR_DESIGNATIONS = [
  'Chief Scientist',
  'Outstanding Scientist',
  'Distinguished Scientist',
];
```

- [ ] **Step 5: Add `pmsTrack()` and drop `isEligibleAppraisee()` in `src/lib/pms/permissions.ts`**

Change the imports at the top of the file to:

```typescript
import type { Role, UserAccount } from '../../types';
import type { CommitteeTier, PmsTrack, PMSEvaluationCommitteeMember, PMSReport } from '../../types/pms';
import { COMMITTEE_TIERS, ELIGIBLE_SCIENTIST_GRADES, SENIOR_DESIGNATIONS } from './constants';
```

Delete the whole `isEligibleAppraisee` function (lines 42–46) and put this in its place:

```typescript
/**
 * Which appraisal proforma applies to a user. The 2026 guidelines cover
 * Scientists B–F only; Scientist G (and the Chief/Outstanding/Distinguished
 * Scientist designations) file Annexure-I and the Director files Annexure-II.
 * Returns null when the person is not an appraisee at all.
 */
export function pmsTrack(activeRole: Role, designation: string): PmsTrack | null {
  if (activeRole === 'Director') return 'ANNEXURE_II';
  const trimmed = designation.trim();
  if (SENIOR_DESIGNATIONS.some(d => d.toLowerCase() === trimmed.toLowerCase())) return 'ANNEXURE_I';
  const grade = scientistGrade(trimmed);
  if (grade === 'G') return 'ANNEXURE_I';
  if (grade !== null && ELIGIBLE_SCIENTIST_GRADES.includes(grade)) return 'STANDARD';
  return null;
}
```

- [ ] **Step 6: Point `ReportNew.tsx` at the new gate**

In `src/pages/pms/ReportNew.tsx`, change the import on line 6 to:

```typescript
import { pmsTrack } from '../../lib/pms/permissions';
```

and replace lines 25–29 (the eligibility branch) with:

```typescript
    // Scientists B–F use the 2026 proforma; Scientist G / senior designations
    // use Annexure-I and the Director uses Annexure-II. The DB derives the
    // track itself on insert — this is the client-side "are you an appraisee"
    // gate only.
    if (ownStaff && user && pmsTrack(user.activeRole, ownStaff.Designation) === null) {
      setBlocked(`PMS appraisal is not open to your designation on record ("${ownStaff.Designation}"). Contact administration if this is wrong.`);
      return;
    }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/lib/pms/permissions.test.ts`
Expected: PASS — all blocks green.

- [ ] **Step 8: Verify the whole project still builds**

Run: `npm run build`
Expected: exit 0. If `PMSReport.track` / `PMSEvaluation.penPicture` are reported as missing in `src/utils/pmsMappers.ts`, that is expected — fix it now with the two lines from Task 2 Step 7 rather than leaving the build red.

- [ ] **Step 9: Commit**

```bash
git add src/types/pms.ts src/lib/pms/constants.ts src/lib/pms/permissions.ts src/lib/pms/permissions.test.ts src/pages/pms/ReportNew.tsx src/utils/pmsMappers.ts
git commit -m "feat(pms): add Annexure-I/II track resolution and wizard steps

Scientist G, Chief/Outstanding/Distinguished Scientist, and the Director
are outside the 2026 guidelines and file their own CSIR proformas.
pmsTrack() routes them; wizardStepsFor() gives each track its own steps.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Migration — track column, pen picture column, tier IV, senior finalize RPC

Additive only. No shipped baseline file is touched. The `track` value is derived server-side so a client can never pick its own proforma.

**Files:**
- Create: `supabase/migrations/20260726000001_pms_senior_track.sql`
- Modify: `scripts/check_security_definer.py:33-45`
- Modify: `src/utils/pmsMappers.ts:28-48,111-126`

**Interfaces:**
- Consumes: `PmsTrack`, `PenPicture` from Task 1.
- Produces:
  - column `pms_reports.track text NOT NULL DEFAULT 'STANDARD'`
  - column `pms_evaluations.pen_picture jsonb NOT NULL DEFAULT '{}'`
  - `pms_caller_track() RETURNS text`
  - `pms_finalize_senior_report(p_report_id uuid, p_remarks text) RETURNS void`
  - mappers `mapReportRow` → `track`, `mapEvaluationRow` → `penPicture`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260726000001_pms_senior_track.sql`:

```sql
-- ============================================================
-- 20260726000001_pms_senior_track
-- Scientist G / Chief Scientist / Outstanding Scientist /
-- Distinguished Scientist file CSIR Annexure-I; the Director files
-- Annexure-II. Both are outside the 2026 guidelines implemented in
-- 20260712000004_pms.sql, so they run as a parallel track on the same
-- tables: a `track` discriminator on pms_reports, a categorical
-- pen-picture payload on pms_evaluations, and a score-free finalize RPC.
--
-- Additive: no existing row, policy, or RPC changes behaviour for
-- track = 'STANDARD'.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. COLUMNS
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.pms_reports
    ADD COLUMN IF NOT EXISTS track text NOT NULL DEFAULT 'STANDARD'
    CHECK (track IN ('STANDARD','ANNEXURE_I','ANNEXURE_II'));

COMMENT ON COLUMN public.pms_reports.track IS
    'Which CSIR proforma this report uses. Derived on INSERT from the '
    'caller''s staff designation by trg_pms_reports_track — never client-set.';

-- Appendix-C pen picture: categorical ratings + a ~100 word narrative.
-- Senior tracks leave scores = {} and total_score = NULL.
ALTER TABLE public.pms_evaluations
    ADD COLUMN IF NOT EXISTS pen_picture jsonb NOT NULL DEFAULT '{}';

-- Tier IV = the Annexure-I evaluation committee (Scientist G tier).
ALTER TABLE public.pms_evaluation_committees
    DROP CONSTRAINT IF EXISTS pms_evaluation_committees_tier_check;
ALTER TABLE public.pms_evaluation_committees
    ADD CONSTRAINT pms_evaluation_committees_tier_check
    CHECK (tier IN ('I','II','III','IV'));

-- ──────────────────────────────────────────────────────────────
-- 2. TRACK DERIVATION
-- ──────────────────────────────────────────────────────────────

-- Authorization: reads only the caller's own staff row (auth.uid(), falling
-- back to the verified email like caller_staff_name does) and the caller's
-- own roles. Returns a classification, never another person's data.
CREATE OR REPLACE FUNCTION public.pms_caller_track()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_designation text;
BEGIN
    IF public.user_has_role('Director') THEN
        RETURN 'ANNEXURE_II';
    END IF;

    SELECT trim("Designation") INTO v_designation
      FROM public.staff
     WHERE user_id = auth.uid()
        OR (user_id IS NULL AND lower("Email") = public.caller_email())
     ORDER BY (user_id = auth.uid()) DESC NULLS LAST
     LIMIT 1;

    IF v_designation ~* '^scientist[[:space:]-]*G$'
       OR v_designation ILIKE 'Chief Scientist'
       OR v_designation ILIKE 'Outstanding Scientist'
       OR v_designation ILIKE 'Distinguished Scientist' THEN
        RETURN 'ANNEXURE_I';
    END IF;

    RETURN 'STANDARD';
END;
$$;

-- Not SECURITY DEFINER: it runs with the writer's rights on a row RLS has
-- already authorized. Its only job is to stop the client choosing its own
-- proforma, on INSERT and on every later UPDATE.
CREATE OR REPLACE FUNCTION public.pms_set_report_track()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.track := coalesce(public.pms_caller_track(), 'STANDARD');
    ELSE
        NEW.track := OLD.track;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pms_reports_track ON public.pms_reports;
CREATE TRIGGER trg_pms_reports_track
    BEFORE INSERT OR UPDATE ON public.pms_reports
    FOR EACH ROW EXECUTE FUNCTION public.pms_set_report_track();

-- ──────────────────────────────────────────────────────────────
-- 3. RPC — senior-track finalize (no score)
-- ──────────────────────────────────────────────────────────────
-- Annexure-I: the tier-IV Evaluation Committee files pen pictures, the
-- existing trg_pms_evaluation_complete advances the report to
-- EMPOWERED_COMMITTEE_REVIEW, and the Director/DG review remark lands here.
-- Annexure-II: the DG evaluates outside SURYA, so an administrator records
-- the returned Appendix-C outcome directly from SUBMITTED.
--
-- score_communicated_at is deliberately left NULL: there is no score, so the
-- 15-day representation window must not open.
CREATE OR REPLACE FUNCTION public.pms_finalize_senior_report(
    p_report_id uuid,
    p_remarks   text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;

    IF NOT (public.pms_is_admin()
            OR EXISTS (SELECT 1 FROM public.pms_empowered_committee_members
                        WHERE cycle_id = v_report.cycle_id AND user_id = auth.uid())) THEN
        RAISE EXCEPTION 'Only PMS administrators or Empowered Committee members can finalize senior-track reports';
    END IF;

    IF v_report.track = 'STANDARD' THEN
        RAISE EXCEPTION 'Standard-track reports are finalized with a score via pms_finalize_report';
    END IF;
    IF v_report.status NOT IN ('SUBMITTED','UNDER_EVALUATION_COMMITTEE_REVIEW','EMPOWERED_COMMITTEE_REVIEW') THEN
        RAISE EXCEPTION 'Report cannot be finalized from status %', v_report.status;
    END IF;
    IF length(trim(coalesce(p_remarks, ''))) < 50 THEN
        RAISE EXCEPTION 'Review remarks must be at least 50 characters';
    END IF;

    UPDATE public.pms_reports
        SET status        = 'FINALIZED',
            system_remark = p_remarks,
            updated_at    = now()
        WHERE id = p_report_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'SENIOR_REPORT_FINALIZED', 'pms_reports', p_report_id,
            jsonb_build_object('track', v_report.track));

    INSERT INTO public.pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'report_finalized',
            'Your performance mapping proforma has been finalized',
            'The reviewing authority has recorded its evaluation on your report.',
            p_report_id);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. RLS
-- ──────────────────────────────────────────────────────────────
-- No new tables and no new policies: `track` and `pen_picture` are columns on
-- pms_reports / pms_evaluations, both already RLS-enabled with policies that
-- gate the whole row. The Nov 30 lock triggers likewise already cover them.
```

- [ ] **Step 2: Teach the SECURITY DEFINER checker about the new helper**

In `scripts/check_security_definer.py`, add one entry to `AUTHZ_MARKERS` (after `"pms_is_grievance_member",` on line 43):

```python
    "pms_caller_track",
```

`pms_caller_track` itself contains `auth.uid()` and `user_has_role`, so it passes on its own; the marker exists so any future function that delegates its caller check to it is also recognised.

- [ ] **Step 3: Run the checker to verify it passes**

Run: `python scripts/check_security_definer.py`
Expected: exit 0, a line ending `… exempt, none unguarded.`

- [ ] **Step 4: Apply the migration locally**

Run: `supabase db push`
Expected: `Applying migration 20260726000001_pms_senior_track.sql...` then `Finished supabase db push.`

If the local stack has drifted, rebuild instead: `supabase db reset` followed by the `supabase/seed/*.sql` files.

- [ ] **Step 5: Verify the derivation and the guard rails by hand**

Run this in `psql` against the local database (`supabase db reset` prints the connection string):

```sql
-- existing reports are all standard
SELECT track, count(*) FROM pms_reports GROUP BY track;

-- the column cannot be forced from a client-shaped UPDATE
UPDATE pms_reports SET track = 'ANNEXURE_II' WHERE id = (SELECT id FROM pms_reports LIMIT 1);
SELECT track FROM pms_reports WHERE id = (SELECT id FROM pms_reports LIMIT 1);

-- tier IV is now accepted
SELECT 'IV'::text IN ('I','II','III','IV') AS tier_iv_allowed;
```

Expected: every existing row reports `STANDARD`; the `UPDATE` runs without error but the row still reads `STANDARD` (the trigger restored `OLD.track`); `tier_iv_allowed` is `t`.

- [ ] **Step 6: Verify the senior finalize RPC rejects the standard track**

```sql
SELECT pms_finalize_senior_report(
  (SELECT id FROM pms_reports WHERE track = 'STANDARD' LIMIT 1),
  'A remark long enough to clear the fifty character minimum imposed by the RPC.'
);
```

Expected: `ERROR: Standard-track reports are finalized with a score via pms_finalize_report` — or, if you are not an admin/Empowered Committee member in that session, the authorization error first. Either proves a guard fired.

- [ ] **Step 7: Map the two new columns**

In `src/utils/pmsMappers.ts`, add `PmsTrack` and `PenPicture` to the type import block at the top:

```typescript
import type {
  AppraisalCycle,
  PenPicture,
  PmsTrack,
  PMSReport,
  ...
```

In `mapReportRow`, add `track` immediately after `status`:

```typescript
    status:       row.status as PMSReport['status'],
    track:        (row.track as PmsTrack) ?? 'STANDARD',
```

In `mapEvaluationRow`, add `penPicture` immediately after `scores`:

```typescript
    scores:      (row.scores as Record<string, number>) ?? {},
    penPicture:  row.pen_picture && Object.keys(row.pen_picture as object).length > 0
                   ? (row.pen_picture as PenPicture)
                   : null,
```

- [ ] **Step 8: Verify the build is green**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260726000001_pms_senior_track.sql scripts/check_security_definer.py src/utils/pmsMappers.ts
git commit -m "feat(db): add PMS senior track column, pen picture, and finalize RPC

pms_reports.track is derived server-side from the caller's staff
designation on INSERT and pinned on UPDATE, so a client cannot choose
its own proforma. Senior-track evaluations carry a categorical pen
picture instead of a 0-100 score, and finalize through a score-free RPC
that leaves score_communicated_at NULL (no representation window).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: The two proformas as data, plus one generic renderer

Both annexures are transcribed from the official CSIR DOCX formats into a `SectionSpec` per section key. One component renders all four spec kinds through the existing `DynamicTable` and `WordCountTextarea` — no per-section components are written.

Storage shapes, matching what the standard sections already use so `ReportPDF` and `ReportView` need no new conventions:
- `table` → `{ items: Record<string, string>[] }`
- `text` → `{ text: string }`
- `fields` / `prompts` → flat `{ [fieldKey]: string }` at the top level of `data`

**Files:**
- Create: `src/lib/pms/annexureSpecs.ts`
- Create: `src/components/pms/SpecSection.tsx`
- Test: `src/lib/pms/annexureSpecs.test.ts`

**Interfaces:**
- Consumes: `SeniorSectionKey`, `SectionKey`, `PmsTrack` (Task 1); `wizardStepsFor`, `WizardStep` (Task 1); `DynamicTable`, `WordCountTextarea` (existing).
- Produces:
  - `interface FieldSpec { key: string; label: string; maxWords?: number; rows?: number; type?: 'text' | 'date' }`
  - `interface ColumnSpec { key: string; label: string }`
  - `type SectionSpec` — discriminated on `kind`, always carrying `title`
  - `ANNEXURE_SPECS: Record<SeniorSectionKey, SectionSpec>`
  - `interface PenPictureGroup { title: string; scale: string[]; rows: FieldSpec[] }`
  - `PEN_PICTURE_SPECS: Record<'ANNEXURE_I' | 'ANNEXURE_II', PenPictureGroup[]>`
  - `<SpecSection spec data onChange />`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pms/annexureSpecs.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ANNEXURE_SPECS, PEN_PICTURE_SPECS } from './annexureSpecs';
import { SECTION_KEYS, wizardStepsFor } from './constants';
import type { PmsTrack, SectionKey, SeniorSectionKey } from '../../types/pms';

const SENIOR_TRACKS: PmsTrack[] = ['ANNEXURE_I', 'ANNEXURE_II'];

describe('ANNEXURE_SPECS', () => {
  it('resolves every senior wizard-step key to a spec', () => {
    for (const track of SENIOR_TRACKS) {
      for (const step of wizardStepsFor(track)) {
        for (const key of step.keys) {
          expect(ANNEXURE_SPECS[key as SeniorSectionKey], `${track}/${key}`).toBeDefined();
        }
      }
    }
  });

  it('resolves every standard wizard-step key to a standard section key, not a spec', () => {
    const standard = new Set<SectionKey>(SECTION_KEYS);
    for (const step of wizardStepsFor('STANDARD')) {
      for (const key of step.keys) {
        expect(standard.has(key), `STANDARD/${key}`).toBe(true);
        expect(ANNEXURE_SPECS[key as SeniorSectionKey]).toBeUndefined();
      }
    }
  });

  it('uses every declared spec in exactly one wizard step', () => {
    const used = SENIOR_TRACKS.flatMap(t => wizardStepsFor(t).flatMap(s => s.keys));
    expect(new Set(used).size).toBe(used.length);          // no key reused
    expect(new Set(used)).toEqual(new Set(Object.keys(ANNEXURE_SPECS)));
  });

  it('gives every spec a title and every field a unique key within its section', () => {
    for (const [key, spec] of Object.entries(ANNEXURE_SPECS)) {
      expect(spec.title, key).toBeTruthy();
      const keys =
        spec.kind === 'fields'  ? spec.fields.map(f => f.key)
        : spec.kind === 'prompts' ? spec.prompts.map(p => p.key)
        : spec.kind === 'table'   ? spec.columns.map(c => c.key)
        : [];
      expect(new Set(keys).size, key).toBe(keys.length);
    }
  });

  it('carries the word caps the proformas state', () => {
    const i4 = ANNEXURE_SPECS.sr_b_i4;
    expect(i4.kind === 'text' && i4.maxWords).toBe(150);
    const roadmap = ANNEXURE_SPECS.dir_qa;
    expect(roadmap.kind === 'prompts'
      && roadmap.prompts.find(p => p.key === 'roadmap')?.maxWords).toBe(200);
    const iii = ANNEXURE_SPECS.sr_b_iii;
    expect(iii.kind === 'prompts' && iii.prompts.every(p => p.maxWords === 300)).toBe(true);
  });

  it('carries both Appendix-C rating scales', () => {
    for (const track of SENIOR_TRACKS) {
      const groups = PEN_PICTURE_SPECS[track as 'ANNEXURE_I' | 'ANNEXURE_II'];
      expect(groups.length).toBe(5);
      expect(groups[0].scale).toEqual(['Excellent', 'Very Good', 'Good', 'Needs to be Improved']);
      expect(groups[3].scale).toEqual(['Impeccable', 'Beyond Doubt', 'To be Monitored']);
      expect(groups[4].scale).toEqual(['Yes', 'No']);
      expect(groups.flatMap(g => g.rows).length).toBeGreaterThan(5);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/pms/annexureSpecs.test.ts`
Expected: FAIL — `Failed to resolve import "./annexureSpecs"`.

- [ ] **Step 3: Write the spec data file**

Create `src/lib/pms/annexureSpecs.ts`. Both annexures share the Appendix-B Section II table shapes, so those column sets are declared once and reused.

```typescript
import type { SeniorSectionKey } from '../../types/pms';

export interface FieldSpec {
  key: string;
  label: string;
  maxWords?: number;
  rows?: number;
  type?: 'text' | 'date';
}

export interface ColumnSpec {
  key: string;
  label: string;
}

export type SectionSpec =
  | { kind: 'fields';  title: string; hint?: string; fields: FieldSpec[] }
  | { kind: 'prompts'; title: string; hint?: string; prompts: FieldSpec[] }
  | { kind: 'table';   title: string; hint?: string; columns: ColumnSpec[] }
  | { kind: 'text';    title: string; hint?: string; maxWords: number };

// --- 1. Shared Appendix-A / Appendix-B table shapes ---

const EDUCATION_COLUMNS: ColumnSpec[] = [
  { key: 'qualification',   label: 'Qualification' },
  { key: 'specialization',  label: 'Specialization / Subject(s)' },
  { key: 'year',            label: 'Year' },
  { key: 'university',      label: 'University / Institute' },
  { key: 'additionalInfo',  label: 'Additional Information' },
];

const EMPLOYMENT_COLUMNS: ColumnSpec[] = [
  { key: 'gradePost',     label: 'Grade / Post' },
  { key: 'establishment', label: 'Estt. / Lab / Instt.' },
  { key: 'from',          label: 'Duration From' },
  { key: 'to',            label: 'Duration To' },
  { key: 'remarks',       label: 'Remarks' },
];

const LEAVE_COLUMNS: ColumnSpec[] = [
  { key: 'leaveType', label: 'Type of leave' },
  { key: 'days',      label: 'No. of days' },
];

const JOURNAL_COLUMNS: ColumnSpec[] = [
  { key: 'authors',       label: 'Authors' },
  { key: 'title',         label: 'Title of the Article' },
  { key: 'year',          label: 'Year of Publication' },
  { key: 'journal',       label: 'Name of Journal' },
  { key: 'country',       label: 'Country' },
  { key: 'volIssuePages', label: 'Vol No., Issue, Pages' },
  { key: 'doi',           label: 'DOI' },
];

const CONFERENCE_COLUMNS: ColumnSpec[] = [
  { key: 'authors',    label: 'Authors' },
  { key: 'title',      label: 'Title of the Article' },
  { key: 'date',       label: 'Date' },
  { key: 'conference', label: 'Name of Conference' },
  { key: 'venue',      label: 'Venue' },
  { key: 'volPages',   label: 'Vol No., Pages' },
  { key: 'publisher',  label: 'Publisher' },
];

const BOOK_COLUMNS: ColumnSpec[] = [
  { key: 'authors',      label: 'Authors' },
  { key: 'chapterTitle', label: 'Title of the chapter' },
  { key: 'year',         label: 'Year of Publication' },
  { key: 'bookTitle',    label: 'Title of Book' },
  { key: 'country',      label: 'Country' },
  { key: 'edition',      label: 'Edition No.' },
  { key: 'publisher',    label: 'Publisher' },
];

const PATENT_COLUMNS: ColumnSpec[] = [
  { key: 'title',          label: 'Title' },
  { key: 'country',        label: 'Country' },
  { key: 'filedOn',        label: 'Filed on (Date)' },
  { key: 'grantedOn',      label: 'Granted on (Date)' },
  { key: 'otherInventors', label: 'Names of other inventors' },
];

const ECF_COLUMNS: ColumnSpec[] = [
  { key: 'projectTitle',   label: 'Title of the project' },
  { key: 'projectType',    label: 'Project Type / Category' },
  { key: 'amountReceived', label: 'Amount received with your initiative' },
  { key: 'source',         label: 'Govt. / Industry' },
  { key: 'labReserve',     label: 'Lab Reserve generation' },
];

const TECH_TRANSFER_COLUMNS: ColumnSpec[] = [
  { key: 'title',                 label: 'Title' },
  { key: 'developmentPeriod',     label: 'Period during which developed' },
  { key: 'transferDate',          label: 'Date of transfer' },
  { key: 'organization',          label: 'Organization / Industry' },
  { key: 'feesRealized',          label: 'Total fees realized' },
  { key: 'yourRole',              label: 'Your Role' },
  { key: 'commercializationStatus', label: 'Commercialisation Status' },
];

const TECH_DEV_COLUMNS: ColumnSpec[] = [
  { key: 'title',           label: 'Title' },
  { key: 'yearDeveloped',   label: 'Year of Development' },
  { key: 'yourContribution', label: 'Your contribution in the development (≤10 words)' },
];

// II.3.3 – II.3.6, identical in both annexures.
const SERVICE_PROMPTS: FieldSpec[] = [
  { key: 'testing',  label: 'II.3.3 Testing, evaluation and calibration jobs undertaken and amount charged', maxWords: 150 },
  { key: 'eia',      label: 'II.3.4 No. of EIA jobs undertaken and amount charged',                          maxWords: 150 },
  { key: 'software', label: 'II.3.5 Software developed & delivered and amount charged',                      maxWords: 150 },
  { key: 'others',   label: 'II.3.6 Others (specify, if any)',                                               maxWords: 150 },
];

// Section IV is worded identically in both proformas apart from two verbs.
function sectionIVPrompts(directorVoice: boolean): FieldSpec[] {
  return [
    { key: 'policy',       label: directorVoice ? 'Policy formulation and / or decision making' : 'Participation in policy formulation and / or decision making', maxWords: 300 },
    { key: 'rules',        label: directorVoice ? 'Direction / enablement for formulation or amendment of existing rules / procedures for better effective functioning of the organization' : 'Formulating / amending existing rules / procedures for better effective functioning of the organization', maxWords: 300 },
    { key: 'interaction',  label: 'Interacting within CSIR, with other R&D organizations, Govt. departments, industry and / or international agencies for project formulation or meeting the objectives of identified programmes', maxWords: 300 },
    { key: 'megaProjects', label: 'Obtaining / processing financial approval and associated management for implementing mega projects', maxWords: 300 },
    { key: 'service',      label: 'Providing major service to your organization in its efficient functioning & image building', maxWords: 300 },
    { key: 'committees',   label: 'Membership in organizational / national / international committees', maxWords: 300 },
    { key: 'admin',        label: 'Important administrative responsibilities taken and success achieved', maxWords: 300 },
    { key: 'events',       label: directorVoice ? 'Major events organized as leader' : 'Major events organized as leader / coordinator', maxWords: 300 },
    { key: 'positioning',  label: 'Major initiative taken towards better positioning of the Laboratory / CSIR', maxWords: 300 },
    { key: 'anyOther',     label: 'Any other dimension of your contribution essentially depicting your leadership quality', maxWords: 300 },
  ];
}

// --- 2. Annexure-I — Chief Scientist / Outstanding Scientist / Distinguished Scientist ---

const ANNEXURE_I_SPECS: Record<import('../../types/pms').AnnexureISectionKey, SectionSpec> = {
  sr_identification: {
    kind: 'fields',
    title: 'Identification Information',
    hint: 'Appendix-A. Confirm the details on record for the evaluation period.',
    fields: [
      { key: 'name',                  label: 'Name of the Employee' },
      { key: 'employeeId',            label: 'Employee ID' },
      { key: 'groupGrade',            label: 'Group / Grade' },
      { key: 'designation',           label: 'Designation' },
      { key: 'dob',                   label: 'Date of Birth', type: 'date' },
      { key: 'division',              label: 'Division / Department' },
      { key: 'placeOfPosting',        label: 'Place of posting' },
      { key: 'dojCsir',               label: 'Date of Joining CSIR', type: 'date' },
      { key: 'dojPresentPosition',    label: 'Date of joining present position', type: 'date' },
      { key: 'tenureCompletion',      label: 'Date of completion of tenure / superannuation', type: 'date' },
      { key: 'email',                 label: 'Email ID' },
      { key: 'mobile',                label: 'Mobile No.' },
      { key: 'periodFrom',            label: 'Evaluation period from', type: 'date' },
      { key: 'periodTo',              label: 'Evaluation period to', type: 'date' },
      { key: 'evaluationType',        label: 'Part year or full year evaluation' },
      { key: 'immovablePropertyReturn', label: 'Annual return on immovable property filed for this period (Yes / No)' },
    ],
  },
  sr_education: { kind: 'table', title: 'Educational Attainment(s)', columns: EDUCATION_COLUMNS },
  sr_employment: { kind: 'table', title: 'Employment Details', columns: EMPLOYMENT_COLUMNS },
  sr_leave: {
    kind: 'table',
    title: 'Leave Record',
    hint: 'List all leave for the year being evaluated. The signed hardcopy (Sr. CoA / CoA / AO) is uploaded on the final step as an annexure.',
    columns: LEAVE_COLUMNS,
  },
  sr_questionnaire: {
    kind: 'prompts',
    title: 'Questionnaire',
    hint: 'Only the items closely relevant to you need to be answered.',
    prompts: [
      { key: 'q1',  label: '1. Your most important achievements sector-wise for the past year (public / private / strategic / societal goods) — elaborate on outcomes, economic impact, and societal impact', maxWords: 300, rows: 8 },
      { key: 'q2',  label: '2. Your contribution to National Missions and CSIR Missions', maxWords: 300, rows: 6 },
      { key: 'q3',  label: '3. Your major knowledge portfolio — knowledge generation, development, or management', maxWords: 300, rows: 6 },
      { key: 'q4',  label: '4. Leadership role benefitting the Laboratory / CSIR — the interventions and their impact', maxWords: 300, rows: 6 },
      { key: 'q5',  label: '5. Scientists mentored — purpose, strategy, pathway, and outcome', maxWords: 300, rows: 6 },
      { key: 'q6',  label: '6. Contribution to the capability building of the Laboratory / CSIR and how it helps its positioning', maxWords: 300, rows: 6 },
      { key: 'q7',  label: '7. Work that led to an impact-making activity and how it benefitted the CSIR system', maxWords: 300, rows: 6 },
      { key: 'q8',  label: '8. How your contribution enhanced the prestige, positioning, and stakeholder connect of the Laboratory / CSIR', maxWords: 300, rows: 6 },
      { key: 'q9',  label: '9. Activities and tasks you would like to focus on over the next 1–2 years for the Laboratory / Institute', maxWords: 300, rows: 6 },
      { key: 'q10', label: '10. Exposure / experience you would like in the next year and how it benefits your team and CSIR', maxWords: 300, rows: 6 },
    ],
  },
  sr_b_i1: {
    kind: 'table',
    title: 'I.1 Participation in R&D / R&D management activities',
    columns: [
      { key: 'title',      label: 'Title of Project' },
      { key: 'category',   label: 'Project Category' },
      { key: 'agencies',   label: 'Participating Agencies' },
      { key: 'role',       label: 'Role' },
    ],
  },
  sr_b_i2: {
    kind: 'table',
    title: 'I.2 Major Programmes / Facility Creation identified at the National level',
    columns: [
      { key: 'title',        label: 'Title of the Project' },
      { key: 'agency',       label: 'Coordinating Agency' },
      { key: 'contribution', label: 'Contribution being made' },
    ],
  },
  sr_b_i3: {
    kind: 'table',
    title: 'I.3 Creation / development, operation and maintenance of Major Facilities',
    columns: [
      { key: 'facility',      label: 'Title of the Facility' },
      { key: 'role',          label: 'Your role in brief' },
      { key: 'beneficiaries', label: 'Beneficiaries' },
    ],
  },
  sr_b_i4: {
    kind: 'text',
    title: 'I.4 Notable contributions',
    hint: 'Up to ten, indicating status — individual achievement, output of team work, collaborative work, etc.',
    maxWords: 150,
  },
  sr_b_ii_journals: {
    kind: 'table',
    title: 'II.1.1 Papers published in SCI journals (reporting year only)',
    hint: 'Indicate the total impact factor and citations of your publications. You are responsible for the accuracy of these references.',
    columns: JOURNAL_COLUMNS,
  },
  sr_b_ii_conferences: { kind: 'table', title: 'II.1.2 Papers published in conference proceedings', columns: CONFERENCE_COLUMNS },
  sr_b_ii_books:       { kind: 'table', title: 'II.1.3 Contribution to books', hint: 'Indicate the total number of chapters and pages.', columns: BOOK_COLUMNS },
  sr_b_ii_institutional: {
    kind: 'text',
    title: 'II.1.4 Institutional publications brought out',
    hint: 'Technical brochures, feasibility reports, training manuals, publicity brochures, organizational plans, annual reports, performance reports, protocols, IPR documents, etc.',
    maxWords: 150,
  },
  sr_b_ii_patents: {
    kind: 'table',
    title: 'II.2 Patents filed and granted during the assessment period',
    hint: 'Indicate national and international patents filed and granted separately.',
    columns: PATENT_COLUMNS,
  },
  sr_b_ii_ecf:           { kind: 'table', title: 'II.3.1 ECF generated / enabled during the assessment period', columns: ECF_COLUMNS },
  sr_b_ii_tech_transfer: { kind: 'table', title: 'II.3.2 Technology / process / know-how transferred, commercialization status', columns: TECH_TRANSFER_COLUMNS },
  sr_b_ii_services:      { kind: 'prompts', title: 'II.3.3 – II.3.6 Services and other financial contribution', prompts: SERVICE_PROMPTS },
  sr_b_ii_tech_dev:      { kind: 'table', title: 'II.4 Technology / process / product development', columns: TECH_DEV_COLUMNS },
  sr_b_iii: {
    kind: 'prompts',
    title: 'Section III',
    hint: 'Provide details on the following, whatever applicable, within 300 words each.',
    prompts: [
      { key: 'fieldWork',        label: 'Field work undertaken / guidance', maxWords: 300 },
      { key: 'fieldImpl',        label: 'Field implementation / technology diffusion', maxWords: 300 },
      { key: 'technicalGuidance', label: 'Technical guidance / counselling', maxWords: 300 },
      { key: 'ecfBudget',        label: 'ECF catalyzed and budget handled (CSIR & other agencies)', maxWords: 300 },
      { key: 'strategicSector',  label: 'Participation and contributions made for the strategic sector', maxWords: 300 },
      { key: 'newClients',       label: 'New clients created / added to the organization', maxWords: 300 },
      { key: 'indigenousTech',   label: 'Contribution to indigenous technology / component / product / device / engineering systems design & development', maxWords: 300 },
      { key: 'forexSaving',      label: 'Activities leading to foreign exchange saving', maxWords: 300 },
      { key: 'stCooperation',    label: 'S&T cooperation established with other countries including regional collaboration', maxWords: 300 },
      { key: 'institutionBuilding', label: 'Assistance provided for national / international institution building', maxWords: 300 },
      { key: 'trainingProgrammes', label: 'National / international training programmes organized', maxWords: 300 },
      { key: 'upliftment',       label: 'Contribution towards upliftment of science & technology in the country', maxWords: 300 },
      { key: 'anyOther',         label: 'Any other point, not covered so far, to complete the spectrum of achievements', maxWords: 300 },
    ],
  },
  sr_b_iv: {
    kind: 'prompts',
    title: 'Section IV',
    hint: 'Provide information on the following lines, whatever applicable, within 300 words each.',
    prompts: sectionIVPrompts(false),
  },
  sr_b_v_lectures: {
    kind: 'table',
    title: 'V.1 Participation / contribution to AcSIR / HRD — lectures delivered',
    columns: [
      { key: 'subject',          label: 'Subject / Course' },
      { key: 'credits',          label: 'Credits' },
      { key: 'students',         label: 'No. of Students' },
      { key: 'lectureHours',     label: 'No. of Lecture Hours' },
      { key: 'practicalSessions', label: 'No. of Practical Sessions' },
    ],
  },
  sr_b_v_teaching: {
    kind: 'prompts',
    title: 'V.2 – V.7 Teaching and student guidance',
    prompts: [
      { key: 'curriculum',      label: 'V.2 Did you have a role in the design of the curriculum of any subject?', maxWords: 100 },
      { key: 'academy',         label: 'V.3 What other contributions have you made to the Academy this year?', maxWords: 150 },
      { key: 'lectureNotes',    label: 'V.4 Did you prepare any lecture notes, tutorials, tests / assignments?', maxWords: 100 },
      { key: 'otherTeaching',   label: 'V.5 Any other responsibility assigned / undertaken, including teaching PG / PhD students', maxWords: 150 },
      { key: 'researchStudents', label: 'V.6 No. of MS (Research) and PhD students guided — state whether in progress or completed / awarded', maxWords: 150 },
      { key: 'pgProjects',      label: 'V.7 Students guided for their project / M.E. / M.Tech. / MBA / MCA etc.', maxWords: 150 },
    ],
  },
  sr_b_vi: {
    kind: 'prompts',
    title: 'Section VI — Recognition',
    hint: 'Provide salient details including the name of the organization and the year of award.',
    prompts: [
      { key: 'fellowships', label: 'Fellowships of professional societies (all-India level selections only, besides international selections)', maxWords: 300 },
      { key: 'awards',      label: 'Prestigious award / recognition received (national & international only; indicate monetary terms where applicable)', maxWords: 300 },
      { key: 'editorship',  label: 'Editorship in reputed journals', maxWords: 300 },
    ],
  },
};
```

Continue the same file with the Annexure-II specs and the pen pictures:

```typescript
// --- 3. Annexure-II — Director of a CSIR Laboratory / Institute ---

const ANNEXURE_II_SPECS: Record<import('../../types/pms').AnnexureIISectionKey, SectionSpec> = {
  dir_identification: {
    kind: 'fields',
    title: 'Identification Information',
    hint: 'Appendix-A. This information is supplied by the Laboratory / Institute administration.',
    fields: [
      { key: 'name',                  label: 'Name of the Director' },
      { key: 'employeeId',            label: 'Employee ID' },
      { key: 'substantivePosition',   label: 'Substantive position' },
      { key: 'lab',                   label: 'Name of the Lab. / Instt.' },
      { key: 'dob',                   label: 'Date of Birth', type: 'date' },
      { key: 'permanentCouncilServant', label: 'Whether permanent Council servant (Yes / No)' },
      { key: 'dojCsir',               label: 'Date of Joining CSIR', type: 'date' },
      { key: 'dojPresentPosition',    label: 'Date of joining present position', type: 'date' },
      { key: 'tenureCompletion',      label: 'Date of completion of tenure / superannuation', type: 'date' },
      { key: 'email',                 label: 'Email ID' },
      { key: 'mobile',                label: 'Mobile No.' },
      { key: 'periodFrom',            label: 'Reporting period from', type: 'date' },
      { key: 'periodTo',              label: 'Reporting period to', type: 'date' },
      { key: 'evaluationType',        label: 'Part year or full year evaluation' },
      { key: 'immovablePropertyReturn', label: 'Annual return on immovable property filed for this period (Yes / No)' },
    ],
  },
  dir_education:  { kind: 'table', title: 'Educational Attainment(s)', columns: EDUCATION_COLUMNS },
  dir_employment: { kind: 'table', title: 'Employment Details',        columns: EMPLOYMENT_COLUMNS },
  dir_leave: {
    kind: 'table',
    title: 'Leave Record',
    hint: 'List all leave for the year being evaluated. The signed hardcopy (Sr. CoA / CoA / AO) is uploaded on the final step as an annexure.',
    columns: LEAVE_COLUMNS,
  },
  dir_qa: {
    kind: 'prompts',
    title: 'A. Strategic positioning of the Laboratory and benchmarking nationally and internationally',
    prompts: [
      { key: 'leadership',  label: '1. Leadership role played in strategically positioning the Laboratory nationally and internationally, including efforts towards becoming the global best in certain scientific and technological domains', maxWords: 300, rows: 8 },
      { key: 'roadmap',     label: '2. Roadmap created by the Laboratory / Institute in line with CSIR Vision 2030 and PAB commitments for the next five years', maxWords: 200, rows: 6 },
      { key: 'missions',    label: '3. Major role / participation of the Laboratory / Institute in GOI national missions / programmes / projects during the reporting period', maxWords: 300, rows: 8 },
      { key: 'newDomains',  label: '4. New scientific and technological domains introduced in the Laboratory / Institute', maxWords: 300, rows: 6 },
      { key: 'facilities',  label: '5. S&T facilities created to leverage cutting-edge R&D activities in the Laboratory / Institute', maxWords: 300, rows: 6 },
    ],
  },
  dir_qb: {
    kind: 'prompts',
    title: 'B. Benchmarking of scientific and technological performance',
    prompts: [
      { key: 'topScientific',    label: '1. Top 10 scientific contributions of the Laboratory / Institute during the reporting period', maxWords: 300, rows: 8 },
      { key: 'topTechnological', label: '2. Top 10 technological contributions of the Laboratory / Institute during the reporting period, along with their socio-economic impact', maxWords: 300, rows: 8 },
      { key: 'topLeadership',    label: '3. Top 5 initiatives / activities / achievements that exemplify your scientific and technological leadership', maxWords: 300, rows: 8 },
    ],
  },
  dir_qc_matrix: {
    kind: 'fields',
    title: 'C. Output / Outcome matrix of the Laboratory / Institute during the reporting period',
    hint: 'Enter counts and values as recorded for the reporting period.',
    fields: [
      { key: 'wosPapers',            label: 'i. Research papers in Web of Science indexed journals' },
      { key: 'patents',              label: 'ii. Patents filed and unique patents granted' },
      { key: 'mous',                 label: 'iii. MOUs signed' },
      { key: 'phds',                 label: 'iv. Ph.D. produced' },
      { key: 'productsDeveloped',    label: 'v. Products / technologies / processes developed' },
      { key: 'productsTransferred',  label: 'vi. Products / technologies / processes transferred to industry above Rs. 10 lakh' },
      { key: 'highValueServices',    label: 'vii. High-value S&T services provided to industry above Rs. 5 lakh' },
      { key: 'industriesApproached', label: 'viii. Industries that approached the Laboratory for consultancy, technological problem solving and S&T services' },
      { key: 'newProjects',          label: 'ix. Total new projects initiated / started during the year' },
      { key: 'budgetRealized',       label: 'x. Project money / budget realized during the year' },
      { key: 'csirProjects',         label: 'xi. CSIR projects initiated, with total project value' },
      { key: 'govtProjects',         label: 'xii. Government projects initiated, with total project value' },
      { key: 'industryProjects',     label: 'xiii. Industry projects initiated, with total project value' },
      { key: 'internationalProjects', label: 'xiv. International (bilateral / multilateral) projects initiated, with total project value' },
      { key: 'projectsForeclosed',   label: 'xv. Projects foreclosed during the reporting period' },
    ],
  },
  dir_qd: {
    kind: 'prompts',
    title: 'D. Societal interventions and their socio-economic impact',
    prompts: [
      { key: 'topSocietal',      label: '1. Top 5 new societal contributions along with the socio-economic impact during the reporting period (do not repeat information given elsewhere)', maxWords: 300, rows: 8 },
      { key: 'skillDevelopment', label: '2. Skill development initiatives and their socio-economic impact', maxWords: 300, rows: 6 },
    ],
  },
  dir_qe: {
    kind: 'prompts',
    title: 'E. Administrative and financial achievements during the reporting period',
    prompts: [
      { key: 'initiatives',    label: 'i. 5 initiatives / activities / achievements that exemplify your administrative and financial leadership and acumen', maxWords: 300, rows: 8 },
      { key: 'manpower',       label: 'ii. Manpower — status of vacancy positions in Group IV, III and II at the start and end of the reporting period', maxWords: 300, rows: 6 },
      { key: 'training',       label: 'iii. Training of manpower in emerging and globally benchmarked domains', maxWords: 300, rows: 6 },
      { key: 'budget',         label: 'iv. Allocation and utilization of budget in the last financial year of the Laboratory / Institute', maxWords: 300, rows: 6 },
    ],
  },
  dir_qf: { kind: 'text', title: 'F. Challenges faced / ease of doing business', maxWords: 300 },
  dir_b_i1: {
    kind: 'table',
    title: 'I.1 Involvement in R&D activities of the Laboratory / Institute',
    columns: [
      { key: 'title',    label: 'Title of Project' },
      { key: 'category', label: 'Project Category' },
      { key: 'agencies', label: 'Participating Agencies' },
      { key: 'role',     label: 'Role as defined in the Project' },
    ],
  },
  dir_b_i2: {
    kind: 'table',
    title: 'I.2 Role in Major Programmes / Facility Creation identified at the National level',
    columns: [
      { key: 'title',        label: 'Title of the Project' },
      { key: 'agency',       label: 'Coordinating Agency' },
      { key: 'contribution', label: 'Specific Contribution' },
    ],
  },
  dir_b_i3: {
    kind: 'text',
    title: 'I.3 Notable contributions',
    hint: 'Up to ten, indicating status — individual achievement, output of team work, collaborative work, etc.',
    maxWords: 150,
  },
  dir_b_ii_journals: {
    kind: 'table',
    title: 'II.1.1 Papers published in SCI journals (reporting year only)',
    hint: 'Indicate the total impact factor and citations of your publications.',
    columns: JOURNAL_COLUMNS,
  },
  dir_b_ii_conferences: { kind: 'table', title: 'II.1.2 Papers published in conference proceedings', columns: CONFERENCE_COLUMNS },
  dir_b_ii_books:       { kind: 'table', title: 'II.1.3 Contribution to books', hint: 'Indicate the total number of chapters and pages.', columns: BOOK_COLUMNS },
  dir_b_ii_institutional: {
    kind: 'text',
    title: 'II.1.4 Institutional publications brought out',
    hint: 'Technical brochures, feasibility reports, training manuals, publicity brochures, organizational plans, annual reports, performance reports, protocols, IPR documents, etc.',
    maxWords: 150,
  },
  dir_b_ii_patents: {
    kind: 'table',
    title: 'II.2 Patents filed and granted during the assessment period',
    hint: 'Indicate national and international patents filed and granted separately.',
    columns: PATENT_COLUMNS,
  },
  dir_b_ii_ecf:           { kind: 'table', title: 'II.3.1 ECF during the reporting period', columns: ECF_COLUMNS },
  dir_b_ii_tech_transfer: { kind: 'table', title: 'II.3.2 Technology / process / know-how transferred, commercialization status', columns: TECH_TRANSFER_COLUMNS },
  dir_b_ii_services:      { kind: 'prompts', title: 'II.3.3 – II.3.6 Services and other financial contribution', prompts: SERVICE_PROMPTS },
  dir_b_ii_tech_dev:      { kind: 'table', title: 'II.4 Technology / process / product development', columns: TECH_DEV_COLUMNS },
  dir_b_iii: {
    kind: 'prompts',
    title: 'Section III',
    hint: 'Provide details on the following, whatever applicable, within 300 words each.',
    prompts: [
      { key: 'budgetEcf',           label: 'Budget handled and ECF catalyzed (CSIR & other agencies)', maxWords: 300 },
      { key: 'newClients',          label: 'New client addition to the organization', maxWords: 300 },
      { key: 'indigenousTech',      label: 'Contribution to indigenous technology / product / device / component / engineering systems design & development', maxWords: 300 },
      { key: 'stCooperation',       label: 'S&T cooperation established with other countries including regional collaboration', maxWords: 300 },
      { key: 'institutionBuilding', label: 'Contribution for national / international institution building', maxWords: 300 },
      { key: 'upliftment',          label: 'Contribution towards upliftment of science & technology in the country', maxWords: 300 },
      { key: 'anyOther',            label: 'Any other point, not covered so far, to complete the spectrum of your achievements', maxWords: 300 },
    ],
  },
  dir_b_iv: {
    kind: 'prompts',
    title: 'Section IV',
    hint: 'Provide information on the following lines, whatever applicable, within 300 words each.',
    prompts: sectionIVPrompts(true),
  },
  dir_b_v: {
    kind: 'prompts',
    title: 'Section V — Recognition and student guidance',
    hint: 'Provide salient details including the name of the organization and the year of award.',
    prompts: [
      { key: 'fellowships', label: 'Fellowships of professional societies (all-India level selections only, besides international selections)', maxWords: 300 },
      { key: 'awards',      label: 'Prestigious award / recognition received (national & international only; indicate monetary terms where applicable)', maxWords: 300 },
      { key: 'editorship',  label: 'Editorship in reputed journals', maxWords: 300 },
      { key: 'studentsGuided', label: 'No. of Master’s & Ph.D. students guided — state whether in progress or completed / awarded', maxWords: 300 },
      { key: 'pgProjects',  label: 'Students guided for project work / assignments for PG courses such as M.Sc. / M.E. / M.Tech. / MBA / MCA', maxWords: 300 },
    ],
  },
};

export const ANNEXURE_SPECS: Record<SeniorSectionKey, SectionSpec> = {
  ...ANNEXURE_I_SPECS,
  ...ANNEXURE_II_SPECS,
};

// --- 4. Appendix-C — pen picture (behavioural aspects) ---

export interface PenPictureGroup {
  title: string;
  scale: string[];
  rows: FieldSpec[];
}

const FOUR_POINT = ['Excellent', 'Very Good', 'Good', 'Needs to be Improved'];
const INTEGRITY_SCALE = ['Impeccable', 'Beyond Doubt', 'To be Monitored'];
const YES_NO = ['Yes', 'No'];

export const PEN_PICTURE_SPECS: Record<'ANNEXURE_I' | 'ANNEXURE_II', PenPictureGroup[]> = {
  ANNEXURE_I: [
    { title: 'A. Personal Attributes', scale: FOUR_POINT, rows: [
      { key: 'personality',        label: 'Personality' },
      { key: 'initiativeDrive',    label: 'Initiative, drive, networking ability' },
      { key: 'leadershipQualities', label: 'Leadership qualities' },
    ] },
    { title: 'B. Professional Competence', scale: FOUR_POINT, rows: [
      { key: 'orgRolePerception', label: 'Perception of organizational role' },
      { key: 'communication',     label: 'Ability to communicate (both in speech and writing)' },
      { key: 'outOfBox',          label: 'Ability to think out of the box' },
      { key: 'comprehension',     label: 'Comprehension and appreciation of new developments related to the job' },
    ] },
    { title: 'C. Managerial Capabilities', scale: FOUR_POINT, rows: [
      { key: 'responsibility',      label: 'Willingness to accept responsibility' },
      { key: 'decisionMaking',      label: 'Decision making ability' },
      { key: 'crisisHandling',      label: 'Crisis handling' },
      { key: 'managerialLeadership', label: 'Qualities of leadership' },
    ] },
    { title: 'D. Integrity and Ethics', scale: INTEGRITY_SCALE, rows: [
      { key: 'integrity', label: 'Integrity and ethics' },
    ] },
    { title: 'E. Adverse Comment', scale: YES_NO, rows: [
      { key: 'adverseComment', label: 'Any adverse comment (if yes, give details in the evaluation report below)' },
    ] },
  ],
  ANNEXURE_II: [
    { title: 'A. Personal Attributes', scale: FOUR_POINT, rows: [
      { key: 'personality', label: 'Personality' },
      { key: 'innovation',  label: 'Innovation, creativity, initiative and drive' },
    ] },
    { title: 'B. Professional Competence', scale: FOUR_POINT, rows: [
      { key: 'vision',              label: 'Vision' },
      { key: 'organizationalConnect', label: 'Organizational connect' },
      { key: 'goalAchievement',     label: 'Ability to achieve the goal' },
    ] },
    { title: 'C. Managerial Capabilities', scale: FOUR_POINT, rows: [
      { key: 'leadershipQuality',  label: 'Leadership quality' },
      { key: 'crisisHandling',     label: 'Crisis handling ability' },
    ] },
    { title: 'D. Integrity and Ethics', scale: INTEGRITY_SCALE, rows: [
      { key: 'integrity', label: 'Integrity and ethics' },
    ] },
    { title: 'E. Adverse Comment', scale: YES_NO, rows: [
      { key: 'adverseComment', label: 'Any adverse comment (if yes, give details in the evaluation report below)' },
    ] },
  ],
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/pms/annexureSpecs.test.ts`
Expected: PASS — all six blocks green. A failure in *"uses every declared spec in exactly one wizard step"* means a key in `src/types/pms.ts` has no step in `constants.ts` (or vice versa); fix the mismatch rather than loosening the test — it is the only thing keeping the three lists in sync.

- [ ] **Step 5: Write the generic renderer**

Create `src/components/pms/SpecSection.tsx`:

```tsx
import { DynamicTable } from './DynamicTable';
import { WordCountTextarea } from './WordCountTextarea';
import type { SectionSpec } from '../../lib/pms/annexureSpecs';

interface Props {
  spec: SectionSpec;
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}

export function SpecSection({ spec, data, onChange }: Props) {
  const str = (key: string): string => (data[key] as string) ?? '';
  const set = (key: string, value: string) => onChange({ ...data, [key]: value });

  return (
    <div className="space-y-4">
      {spec.hint && <p className="text-sm text-text-muted">{spec.hint}</p>}

      {spec.kind === 'table' && (
        <DynamicTable
          columns={spec.columns}
          rows={(data.items as Record<string, string>[]) ?? []}
          onChange={rows => onChange({ ...data, items: rows })}
        />
      )}

      {spec.kind === 'text' && (
        <WordCountTextarea
          value={str('text')}
          onChange={text => onChange({ ...data, text })}
          maxWords={spec.maxWords}
          rows={8}
        />
      )}

      {spec.kind === 'fields' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {spec.fields.map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-text-muted mb-1">{f.label}</label>
              <input
                type={f.type ?? 'text'}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-text"
                value={str(f.key)}
                onChange={e => set(f.key, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      {spec.kind === 'prompts' && (
        <div className="space-y-5">
          {spec.prompts.map(p => (
            <div key={p.key}>
              <label className="block text-sm font-medium text-text mb-1">{p.label}</label>
              <WordCountTextarea
                value={str(p.key)}
                onChange={v => set(p.key, v)}
                maxWords={p.maxWords ?? 300}
                rows={p.rows ?? 5}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify the build is green**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pms/annexureSpecs.ts src/lib/pms/annexureSpecs.test.ts src/components/pms/SpecSection.tsx
git commit -m "feat(pms): transcribe Annexure-I and Annexure-II proformas as specs

Both CSIR formats are data, not components: one SectionSpec per section
key rendered by SpecSection through the existing DynamicTable and
WordCountTextarea. A spec-integrity test keeps the section-key union,
the wizard steps, and the specs in sync.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Persist the period (pre-existing bug), then drive the wizard from the track

> **Pre-existing bug found while planning.** `period_from`, `period_to`, and `self_score` are collected by `SummaryForm` and pushed into local component state by `ReportWizard`, but **never written to `pms_reports`** — `saveBasicInfo` only updates the two `previous_pms_*` columns (`src/contexts/PMSContext.tsx:355-369`). `pms_submit_report` hard-rejects a report whose `period_from`/`period_to` are NULL (`supabase/migrations/20260712000004_pms.sql:410-412`), so **no report can currently be submitted on any track**. The senior tracks are blocked by the same line, so the fix belongs here. It is fixed once in the shared `saveBasicInfo` — every track routes through it.

**Files:**
- Create: `src/lib/pms/basicInfo.ts`
- Test: `src/lib/pms/basicInfo.test.ts`
- Modify: `src/contexts/PMSContext.tsx:97,355-369`
- Modify: `src/components/pms/ReportWizard.tsx`
- Modify: `src/pages/pms/AssignEvaluators.tsx:31`

**Interfaces:**
- Consumes: `wizardStepsFor`, `PERIOD_SECTION_KEYS`, `WizardStep` (Task 1); `ANNEXURE_SPECS`, `SectionSpec`, `SpecSection` (Task 3); `PMSReport.track` (Task 2).
- Produces:
  - `interface BasicInfoPayload { previousPmsSubmittedOnTime: boolean | null; previousPmsSubmissionDate: string | null; periodFrom: string | null; periodTo: string | null; selfScore: number | null }`
  - `basicInfoFromSection(data: Record<string, unknown>, previous: Pick<BasicInfoPayload, 'previousPmsSubmittedOnTime' | 'previousPmsSubmissionDate'>): BasicInfoPayload`
  - `saveBasicInfo(reportId: string, data: BasicInfoPayload): Promise<void>` (widened)

- [ ] **Step 1: Write the failing test for the payload builder**

Create `src/lib/pms/basicInfo.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { basicInfoFromSection } from './basicInfo';

const NO_PREVIOUS = { previousPmsSubmittedOnTime: null, previousPmsSubmissionDate: null };

describe('basicInfoFromSection', () => {
  it('lifts the standard summary section onto the report columns', () => {
    expect(basicInfoFromSection(
      { title: 'APR 2025-26', periodFrom: '2025-04-01', periodTo: '2026-03-31', selfScore: 82 },
      { previousPmsSubmittedOnTime: true, previousPmsSubmissionDate: '2025-05-10' },
    )).toEqual({
      previousPmsSubmittedOnTime: true,
      previousPmsSubmissionDate: '2025-05-10',
      periodFrom: '2025-04-01',
      periodTo: '2026-03-31',
      selfScore: 82,
    });
  });

  it('lifts the senior identification section, which has no self score', () => {
    expect(basicInfoFromSection(
      { name: 'A. Scientist', periodFrom: '2025-04-01', periodTo: '2026-03-31' },
      NO_PREVIOUS,
    )).toEqual({
      previousPmsSubmittedOnTime: null,
      previousPmsSubmissionDate: null,
      periodFrom: '2025-04-01',
      periodTo: '2026-03-31',
      selfScore: null,
    });
  });

  it('normalises blank and non-numeric values to null rather than writing them', () => {
    expect(basicInfoFromSection(
      { periodFrom: '', periodTo: '   ', selfScore: 'not a number' },
      NO_PREVIOUS,
    )).toEqual({
      previousPmsSubmittedOnTime: null,
      previousPmsSubmissionDate: null,
      periodFrom: null,
      periodTo: null,
      selfScore: null,
    });
  });

  it('accepts a self score that arrived as a numeric string from the input', () => {
    expect(basicInfoFromSection({ selfScore: '73' }, NO_PREVIOUS).selfScore).toBe(73);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/pms/basicInfo.test.ts`
Expected: FAIL — `Failed to resolve import "./basicInfo"`.

- [ ] **Step 3: Write the payload builder**

Create `src/lib/pms/basicInfo.ts`:

```typescript
export interface BasicInfoPayload {
  previousPmsSubmittedOnTime: boolean | null;
  previousPmsSubmissionDate: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  selfScore: number | null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function asScore(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return typeof value !== 'boolean' && value !== null && value !== undefined
      && value !== '' && Number.isFinite(n)
    ? n
    : null;
}

/**
 * Lifts the report-level columns out of whichever section carries them for
 * this track — `summary` on the standard proforma, `sr_identification` /
 * `dir_identification` on the annexures. `pms_submit_report` rejects a report
 * whose period dates are NULL, so these must reach `pms_reports`, not just the
 * section jsonb.
 */
export function basicInfoFromSection(
  data: Record<string, unknown>,
  previous: Pick<BasicInfoPayload, 'previousPmsSubmittedOnTime' | 'previousPmsSubmissionDate'>,
): BasicInfoPayload {
  return {
    previousPmsSubmittedOnTime: previous.previousPmsSubmittedOnTime,
    previousPmsSubmissionDate:  previous.previousPmsSubmissionDate,
    periodFrom: nonEmpty(data.periodFrom),
    periodTo:   nonEmpty(data.periodTo),
    selfScore:  asScore(data.selfScore),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/pms/basicInfo.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Widen `saveBasicInfo` so the columns are actually written**

In `src/contexts/PMSContext.tsx`, add to the import block near the top:

```typescript
import type { BasicInfoPayload } from '../lib/pms/basicInfo';
```

Change the context type declaration on line 97 to:

```typescript
  saveBasicInfo: (reportId: string, data: BasicInfoPayload) => Promise<void>;
```

Replace the whole `saveBasicInfo` function (lines 355–369) with:

```typescript
  async function saveBasicInfo(reportId: string, data: BasicInfoPayload): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { error: err } = await supabase
      .from('pms_reports')
      .update({
        previous_pms_submitted_on_time: data.previousPmsSubmittedOnTime,
        previous_pms_submission_date: data.previousPmsSubmissionDate,
        period_from: data.periodFrom,
        period_to: data.periodTo,
        self_score: data.selfScore,
      })
      .eq('id', reportId);
    if (err) throw err;
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, ...data } : r));
  }
```

- [ ] **Step 6: Commit the bug fix on its own**

```bash
git add src/lib/pms/basicInfo.ts src/lib/pms/basicInfo.test.ts src/contexts/PMSContext.tsx
git commit -m "fix(pms): persist period dates and self score to pms_reports

SummaryForm collected period_from/period_to/self_score but saveBasicInfo
only wrote the previous_pms_* columns, so the values never left component
state. pms_submit_report rejects a NULL period, which made every report
unsubmittable. basicInfoFromSection lifts the columns out of whichever
section carries them, so the annexure tracks work through the same path.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 7: Rewire `ReportWizard` to the track**

In `src/components/pms/ReportWizard.tsx`:

Replace the import of `WIZARD_STEPS` (line 6) and add the new ones:

```typescript
import { useState, useCallback, useMemo } from 'react';
```

```typescript
import { PERIOD_SECTION_KEYS, wizardStepsFor } from '../../lib/pms/constants';
import { basicInfoFromSection } from '../../lib/pms/basicInfo';
import { ANNEXURE_SPECS } from '../../lib/pms/annexureSpecs';
import { SpecSection } from './SpecSection';
```

and extend the type import on line 21 with `SectionSpec` is **not** needed — instead import it from the spec module:

```typescript
import type { SectionSpec } from '../../lib/pms/annexureSpecs';
```

Change `FORM_MAP`'s type (line 31) so it no longer has to cover the senior keys:

```typescript
const FORM_MAP: Partial<Record<SectionKey, FormComponent>> = {
```

(the entries themselves are unchanged).

Immediately after `const navigate = useNavigate();` (line 52), add:

```typescript
  const steps = useMemo(() => wizardStepsFor(initialReport.track), [initialReport.track]);
```

Replace line 83 with:

```typescript
  const currentStepIsAWP = steps[step]?.awp === true;
```

Replace the body of `saveCurrent` (lines 85–118) with:

```typescript
  const saveCurrent = useCallback(async (currentSectionData: Record<string, Record<string, unknown>>) => {
    const currentStep = steps[step];
    if (!currentStep) return;
    if (currentStep.keys.length === 0 && !currentStep.awp) return;
    setSaving(true);
    setError(null);
    try {
      if (currentStep.awp) {
        await saveAWPActivities(report.id, awpActivities.filter(a => a.natureOfActivity.trim()));
      } else {
        await Promise.all(
          currentStep.keys.map(key =>
            saveSection(report.id, key, currentSectionData[key] ?? {})
          )
        );
      }
      // Each track carries period_from / period_to on its own first section.
      const periodKey = currentStep.keys.find(k => PERIOD_SECTION_KEYS.includes(k));
      if (periodKey) {
        const payload = basicInfoFromSection(currentSectionData[periodKey] ?? {}, basicInfo);
        await saveBasicInfo(report.id, payload);
        setReport(r => ({ ...r, ...payload }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      throw e;
    } finally {
      setSaving(false);
    }
  }, [step, steps, report.id, saveSection, saveBasicInfo, saveAWPActivities, basicInfo, awpActivities]);
```

Replace the three remaining `WIZARD_STEPS` references:
- line 123 → `setStep(s => Math.min(s + 1, steps.length - 1));`
- lines 167–169 →
  ```typescript
    const currentStepDef = steps[step];
    const isLastStep  = step === steps.length - 1;
    const isFirstStep = step === 0;
  ```
- the progress block (lines 176, 182, 186) → `steps.length` and `steps.map(...)`.

Finally replace the section-rendering block (lines 287–302) with the spec-or-form branch:

```tsx
            {currentStepDef.keys.map(key => {
              const spec: SectionSpec | undefined = ANNEXURE_SPECS[key as keyof typeof ANNEXURE_SPECS];
              const FormComponent = FORM_MAP[key];
              return (
                <div key={key}>
                  {currentStepDef.keys.length > 1 && (
                    <h3 className="text-sm font-mono font-medium text-text-muted uppercase tracking-wider mb-3">
                      {spec?.title ?? key.replace(/_/g, ' ')}
                    </h3>
                  )}
                  {spec ? (
                    <SpecSection
                      spec={spec}
                      data={getSectionData(key)}
                      onChange={d => handleSectionChange(key, d)}
                    />
                  ) : FormComponent ? (
                    <FormComponent
                      data={getSectionData(key)}
                      onChange={d => handleSectionChange(key, d)}
                    />
                  ) : null}
                </div>
              );
            })}
```

The `basicInfo` UI block above it (lines 244–286) still keys off `currentStepDef.keys.includes('summary')`, so it stays standard-track-only with no change.

- [ ] **Step 8: Keep Annexure-II reports out of the evaluator-assignment queue**

In `src/pages/pms/AssignEvaluators.tsx`, change line 31 to:

```typescript
  // Annexure-II (Director) is evaluated by the DG outside SURYA — it never
  // gets an Evaluation Committee.
  const submittedReports = reports.filter(r => r.status === 'SUBMITTED' && r.track !== 'ANNEXURE_II');
```

- [ ] **Step 9: Verify the build and the full test suite**

Run: `npm run build && npx vitest run`
Expected: build exit 0; all test files pass.

- [ ] **Step 10: Verify a senior draft end to end in the running app**

Start the dev server through the preview tooling (never `npm run dev` via Bash), then:
1. Sign in as a user whose `staff."Designation"` is `Scientist G`.
2. Go to `/pms` → **New Report**.
3. Confirm the first step reads **"Appendix-A: Identification"** (not "Part I: Basic Information") and that the step count matches `ANNEXURE_I_WIZARD_STEPS.length` (16).
4. Fill *Evaluation period from* / *to*, click **Save & Next** through two more steps, then reload the page.

Expected: the values survive the reload; `SELECT track, period_from, period_to FROM pms_reports ORDER BY created_at DESC LIMIT 1;` returns `ANNEXURE_I` with both dates set.

5. Repeat as the Director account and confirm the first step is Annexure-II's identification and the wizard has 19 steps with no "Annual Work Plan" step.

- [ ] **Step 11: Commit**

```bash
git add src/components/pms/ReportWizard.tsx src/pages/pms/AssignEvaluators.tsx
git commit -m "feat(pms): drive the report wizard from the report track

wizardStepsFor picks the step list, an explicit awp flag replaces the
'Part V' label sniffing, and annexure sections render through SpecSection
while the standard forms are untouched. Annexure-II never reaches an
Evaluation Committee, so it is filtered out of the assignment queue.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Pen-picture evaluation and score-free finalization

Appendix-C is categorical, so senior-track evaluations reuse the existing `pms_evaluations` row (assignment, the auto-advance trigger, the evaluator queue, and RLS all stay as they are) and write the new `pen_picture` column instead of `scores`/`total_score`.

**Files:**
- Create: `src/components/pms/PenPictureForm.tsx`
- Modify: `src/contexts/PMSContext.tsx`
- Modify: `src/pages/pms/EvaluateReport.tsx`
- Modify: `src/pages/pms/CommitteeQueue.tsx`

**Interfaces:**
- Consumes: `PenPicture` (Task 1), `pen_picture` column and `pms_finalize_senior_report` (Task 2), `PEN_PICTURE_SPECS`, `PenPictureGroup` (Task 3).
- Produces:
  - `<PenPictureForm groups value onChange disabled />`
  - `savePenPicture(evaluationId: string, penPicture: PenPicture, complete: boolean): Promise<void>`
  - `finalizeSeniorReport(reportId: string, remarks: string): Promise<void>`

- [ ] **Step 1: Write the rating-matrix component**

Create `src/components/pms/PenPictureForm.tsx`:

```tsx
import type { PenPictureGroup } from '../../lib/pms/annexureSpecs';
import type { PenPicture } from '../../types/pms';

interface Props {
  groups: PenPictureGroup[];
  value: PenPicture;
  onChange: (v: PenPicture) => void;
  disabled?: boolean;
}

export function PenPictureForm({ groups, value, onChange, disabled }: Props) {
  const setRating = (key: string, rating: string) =>
    onChange({ ...value, ratings: { ...value.ratings, [key]: rating } });

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        Appendix-C — Pen Picture (behavioural aspects). Rate every row, then record the
        evaluation report below.
      </p>

      {groups.map(group => (
        <div key={group.title} className="bg-surface border border-border rounded-2xl overflow-hidden">
          <h3 className="px-4 py-2.5 text-sm font-semibold text-text border-b border-border">
            {group.title}
          </h3>
          <div className="divide-y divide-border">
            {group.rows.map(row => (
              <div key={row.key} className="px-4 py-3 sm:flex sm:items-center sm:justify-between gap-4">
                <span className="text-sm text-text">{row.label}</span>
                <div className="flex flex-wrap gap-3 mt-2 sm:mt-0 shrink-0">
                  {group.scale.map(option => (
                    <label key={option} className="flex items-center gap-1.5 text-xs text-text-muted">
                      <input
                        type="radio"
                        name={row.key}
                        value={option}
                        checked={value.ratings[row.key] === option}
                        onChange={() => setRating(row.key, option)}
                        disabled={disabled}
                        className="accent-[#c96442]"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div>
        <label className="block text-sm font-medium text-text mb-1">
          Evaluation report <span className="text-text-muted font-normal">(about 100 words)</span>
        </label>
        <textarea
          rows={5}
          value={value.narrative}
          onChange={e => onChange({ ...value, narrative: e.target.value })}
          disabled={disabled}
          placeholder="Record the committee's evaluation, including details of any adverse comment…"
          className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442] resize-none disabled:opacity-50"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the two context methods**

In `src/contexts/PMSContext.tsx`, add `PenPicture` to the `types/pms` type import list, then declare the methods in `PMSContextType` — `savePenPicture` next to `completeEvaluation`, `finalizeSeniorReport` next to `finalizeReport`:

```typescript
  savePenPicture: (evaluationId: string, penPicture: PenPicture, complete: boolean) => Promise<void>;
```

```typescript
  finalizeSeniorReport: (reportId: string, remarks: string) => Promise<void>;
```

Add the implementations immediately after `completeEvaluation` and `finalizeReport` respectively:

```typescript
  // Senior tracks (Annexure-I / II) have no 0–100 score: Appendix-C is a
  // categorical pen picture plus a ~100 word narrative. scores/total_score are
  // left at their defaults so the standard-track scoring rules never see them.
  async function savePenPicture(evaluationId: string, penPicture: PenPicture, complete: boolean): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    ensureUser(user);
    if (complete && !penPicture.narrative.trim()) {
      throw new Error('An evaluation report is required before submitting the appraisal');
    }
    const { error: err } = await supabase
      .from('pms_evaluations')
      .update({
        pen_picture: penPicture,
        comments: penPicture.narrative,
        status: complete ? 'COMPLETED' : 'IN_PROGRESS',
      })
      .eq('id', evaluationId);
    if (err) throw err;
    await loadData();
  }
```

```typescript
  async function finalizeSeniorReport(reportId: string, remarks: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    ensureUser(user);
    if (remarks.trim().length < 50) {
      throw new Error('Review remarks must be at least 50 characters');
    }
    const { error: err } = await supabase.rpc('pms_finalize_senior_report', {
      p_report_id: reportId,
      p_remarks: remarks,
    });
    if (err) throw err;
    await loadData();
  }
```

Add both names to the provider `value` object at the bottom of the file — `savePenPicture` after `completeEvaluation`, `finalizeSeniorReport` after `finalizeReport`.

- [ ] **Step 3: Branch `EvaluateReport` on the track**

In `src/pages/pms/EvaluateReport.tsx`:

Add the imports:

```typescript
import { PEN_PICTURE_SPECS } from '../../lib/pms/annexureSpecs';
import { PenPictureForm } from '../../components/pms/PenPictureForm';
import type { PenPicture } from '../../types/pms';
```

and pull `savePenPicture` out of the context on line 17:

```typescript
  const { evaluations, reports, saveEvaluationScores, completeEvaluation, savePenPicture, getReport } = usePMS();
```

Add the pen-picture state next to the score state (after line 28):

```typescript
  const [penPicture, setPenPicture] = useState<PenPicture>({ ratings: {}, narrative: '' });
```

and hydrate it in the existing `useEffect` on `evaluation` (inside the `if (evaluation)` block):

```typescript
      setPenPicture(evaluation.penPicture ?? { ratings: {}, narrative: '' });
```

After `const summaryReport = reportDetail ?? report;` (line 90) add:

```typescript
  const track = summaryReport?.track ?? 'STANDARD';
  const isSenior = track !== 'STANDARD';
  const penGroups = isSenior ? PEN_PICTURE_SPECS[track as 'ANNEXURE_I' | 'ANNEXURE_II'] : [];
  const penComplete = penGroups.every(g => g.rows.every(r => penPicture.ratings[r.key]))
    && penPicture.narrative.trim().length > 0;
```

At the top of `handleSave`, before the existing score validation, add the senior branch:

```typescript
    if (isSenior) {
      if (complete && !penComplete) {
        setError('Rate every row of the pen picture and record the evaluation report before submitting.');
        return;
      }
      setSaving(true);
      setError(null);
      try {
        await savePenPicture(evaluation.id, penPicture, complete);
        navigate('/pms/evaluate');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setSaving(false);
      }
      return;
    }
```

In the JSX, wrap the standard-only blocks and add the senior one. Replace the opening of the dimension-grid block (line 180-181) with:

```tsx
      {isSenior ? (
        <PenPictureForm
          groups={penGroups}
          value={penPicture}
          onChange={setPenPicture}
          disabled={isCompleted}
        />
      ) : (
       <>
      {/* 12-dimension score grid (worksheet) */}
      <div className="space-y-3">
```

and close it after the `needsBelow` block ends (immediately before the `{/* Comments */}` block on line 288):

```tsx
       </>
      )}
```

Finally, change the submit button's disabled condition (line 318) so it accounts for both modes:

```tsx
            disabled={isSenior ? !penComplete : effectiveTotal == null}
```

- [ ] **Step 4: Let the committee finalize a senior report without a score**

In `src/pages/pms/CommitteeQueue.tsx`:

Pull the new method from the context on line 32:

```typescript
  const { reports, isLoading, getReportEvaluations, getReport, finalizeReport, finalizeSeniorReport } = usePMS();
```

Replace the queue filter on line 64:

```typescript
  // Annexure-II is evaluated by the DG outside SURYA — the committee records
  // the returned Appendix-C outcome straight from SUBMITTED.
  const committeeReports = reports.filter(r =>
    r.status === 'EMPOWERED_COMMITTEE_REVIEW'
    || (r.track === 'ANNEXURE_II' && r.status === 'SUBMITTED')
  );
```

Move `const selectedReport = reports.find(r => r.id === selectedReportId);` (currently line 131) up to just above `const parsedScore = ...` (line 90) and add:

```typescript
  const isSenior = selectedReport != null && selectedReport.track !== 'STANDARD';
```

At the top of `handleFinalize`, before the score checks, add:

```typescript
    if (isSenior) {
      if (justLen < 50) {
        setError('Review remarks must be at least 50 characters.');
        return;
      }
      setSaving(true);
      setError(null);
      try {
        await finalizeSeniorReport(selectedReportId, justification);
        setSelectedReportId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Finalization failed');
      } finally {
        setSaving(false);
      }
      return;
    }
```

In the JSX, wrap the *Final score*, *needsOutstanding*, and *needsBelow* blocks (lines 213–276) in `{!isSenior && (<> … </>)}`, and change the justification label (line 280–282) to:

```tsx
                <label className="block text-sm font-medium text-text mb-1">
                  {isSenior ? 'Review remarks' : 'Justification'}{' '}
                  <span className="text-text-muted font-normal">(min 50 characters)</span>
                </label>
```

- [ ] **Step 5: Verify the build and the full test suite**

Run: `npm run build && npx vitest run`
Expected: build exit 0; all tests pass.

- [ ] **Step 6: Verify the senior evaluation loop end to end**

With the dev server running:
1. As an admin, create a tier `IV` Evaluation Committee on the open cycle at `/pms/evaluation-committees` with a Reporting Officer, a Reviewing Officer, and an EC Member (three members — odd count).
2. As the Scientist G account, finish the wizard and submit.
3. As the admin, assign that committee at `/pms/assign`.
4. As each committee member, open `/pms/evaluate` → the report. Confirm the **pen-picture matrix renders instead of the 12 score inputs**, rate every row, write a narrative, and submit.
5. As an Empowered Committee member, open `/pms/committee`. Confirm there is **no score field**, enter 50+ characters of remarks, and finalize.

Expected: after step 4 the report auto-advances to `EMPOWERED_COMMITTEE_REVIEW` (the existing trigger); after step 5 it reads `FINALIZED`, `system_remark` holds the remarks, and `score_communicated_at` is still NULL — so the scientist's report view offers no "Submit Representation" button.

Verify in SQL:

```sql
SELECT status, track, score_communicated_at IS NULL AS no_representation_window
  FROM pms_reports WHERE track <> 'STANDARD';
SELECT pen_picture, total_score FROM pms_evaluations WHERE pen_picture <> '{}';
```

Expected: `FINALIZED | ANNEXURE_I | t`, and each evaluation row carries a populated `pen_picture` with `total_score` NULL.

- [ ] **Step 7: Commit**

```bash
git add src/components/pms/PenPictureForm.tsx src/contexts/PMSContext.tsx src/pages/pms/EvaluateReport.tsx src/pages/pms/CommitteeQueue.tsx
git commit -m "feat(pms): pen-picture appraisal and score-free finalization

Appendix-C is categorical, so senior-track evaluations reuse the existing
pms_evaluations row and write pen_picture instead of scores/total_score.
Assignment, the auto-advance trigger, the evaluator queue, and RLS are
unchanged. Finalization goes through pms_finalize_senior_report, which
leaves score_communicated_at NULL so no representation window opens.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: Track-aware read views and PDF export

The existing PDF and report view iterate sections generically. They need to understand the flat `fields`/`prompts` shape and stop presenting a self-score that senior tracks never have.

**Files:**
- Modify: `src/components/pms/ReportPDF.tsx`
- Modify: `src/pages/pms/ReportView.tsx`

**Interfaces:**
- Consumes: `PMSReport.track` (Task 2), `ANNEXURE_SPECS` (Task 3).
- Produces: no new exports.

- [ ] **Step 1: Render the flat field/prompt values in the PDF**

In `src/components/pms/ReportPDF.tsx`, add the spec import:

```typescript
import { ANNEXURE_SPECS } from '../../lib/pms/annexureSpecs';
```

Replace `SectionBlock` (lines 24–47) with a version that also prints flat string entries under their proforma labels:

```tsx
function SectionBlock({ section }: { section: PMSReportSection }) {
  const data = section.data;
  const items = (data.items as Record<string, string>[] | undefined) ?? [];
  const text = data.text as string | undefined;
  const spec = ANNEXURE_SPECS[section.sectionKey as keyof typeof ANNEXURE_SPECS];

  const labels: Record<string, string> = spec?.kind === 'fields'
    ? Object.fromEntries(spec.fields.map(f => [f.key, f.label]))
    : spec?.kind === 'prompts'
      ? Object.fromEntries(spec.prompts.map(p => [p.key, p.label]))
      : {};

  const entries = Object.entries(data).filter(
    ([key, value]) => key !== 'items' && key !== 'text' && typeof value === 'string' && value.trim() !== ''
  ) as [string, string][];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {spec?.title ?? section.sectionKey.replace(/_/g, ' ').toUpperCase()}
      </Text>
      {text && <Text style={{ fontSize: 9, color: '#141413', lineHeight: 1.4 }}>{text}</Text>}
      {entries.map(([key, value]) => (
        <View key={key} style={styles.row}>
          <Text style={styles.label}>{labels[key] ?? key}</Text>
          <Text style={styles.value}>{value}</Text>
        </View>
      ))}
      {items.length > 0 && (
        <View>
          {items.slice(0, 10).map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={{ ...styles.tableCell, width: 20, color: '#9b9b9a' }}>{i + 1}.</Text>
              {Object.values(item).map((v, j) => (
                <Text key={j} style={styles.tableCell}>{String(v)}</Text>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
```

Add the track-aware title. Immediately inside `ReportPDF`, before the `return`:

```typescript
  const title =
    report.track === 'ANNEXURE_II' ? 'Performance Mapping Proforma — Director'
    : report.track === 'ANNEXURE_I' ? 'Performance Mapping Proforma — Chief Scientist / OS / DS'
    : 'Performance Appraisal Report';
```

Use it on line 65 and in the `Document` title on line 62:

```tsx
    <Document title={`${title} — ${report.id}`} author="CSIR-AMPRI SURYA Platform">
```

```tsx
          <Text style={styles.title}>{title}</Text>
```

Guard the self-score row (line 76) so senior tracks do not print an empty score:

```tsx
          {report.track === 'STANDARD' && (
            <View style={styles.row}><Text style={styles.label}>Self Score:</Text><Text style={styles.value}>{report.selfScore != null ? `${report.selfScore} (${getGrade(report.selfScore)})` : '—'}</Text></View>
          )}
```

- [ ] **Step 2: Make the report view track-aware**

In `src/pages/pms/ReportView.tsx`, after `if (!report) return null;` (line 92), add:

```typescript
  const isSenior = report.track !== 'STANDARD';
  const heading = report.track === 'ANNEXURE_II'
    ? 'Performance Mapping Proforma — Director'
    : report.track === 'ANNEXURE_I'
      ? 'Performance Mapping Proforma — Chief Scientist / OS / DS'
      : (report.cycle?.name ?? 'Appraisal Report');
```

Use `heading` on line 101 in place of `{report.cycle?.name ?? 'Appraisal Report'}`, and wrap the self-score cell (lines 125–130) so it only renders for the standard track:

```tsx
          {!isSenior && (
            <div>
              <span className="text-text-muted">Self Score: </span>
              <span className="text-text">
                {report.selfScore != null ? `${report.selfScore} (${getGrade(report.selfScore)})` : '—'}
              </span>
            </div>
          )}
```

The raw JSON section dump (lines 199–213) is pre-existing behaviour shared with the standard track — leave it. *Skipped: a rendered read view of the annexure sections. Add it if reviewers ask to read reports in the app rather than exporting the PDF.*

- [ ] **Step 3: Verify the build and the full test suite**

Run: `npm run build && npx vitest run`
Expected: build exit 0; all tests pass.

- [ ] **Step 4: Verify the exported PDF**

With the dev server running, open the finalized Annexure-I report at `/pms/reports/<id>` and click **Export PDF**.

Expected: the header reads *"Performance Mapping Proforma — Chief Scientist / OS / DS"*, there is no *Self Score* row, and each annexure section prints under its proforma title (for example *"II.1.1 Papers published in SCI journals (reporting year only)"*) with the questionnaire answers labelled by their full prompt text rather than by raw keys like `q1`.

Repeat for the Director report and confirm the *"C. Output / Outcome matrix…"* section prints all fifteen KPI labels.

- [ ] **Step 5: Commit**

```bash
git add src/components/pms/ReportPDF.tsx src/pages/pms/ReportView.tsx
git commit -m "feat(pms): track-aware report view and PDF export

SectionBlock prints the flat field/prompt values under their proforma
labels, both surfaces title themselves per annexure, and the self score —
which senior tracks never have — is hidden for them.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Verification checklist for the whole feature

Run these once, after Task 6:

- [ ] `npm run build` — exit 0
- [ ] `npx vitest run` — all files pass
- [ ] `npx eslint src/` — clean
- [ ] `python scripts/check_security_definer.py` — exit 0
- [ ] A Scientist D account still sees the 11-step 2026 wizard with the score field and the AWP step — the standard track is unchanged.
- [ ] A Scientist D report still finalizes with a 0–100 score through `/pms/committee` and still offers the representation button afterwards.
- [ ] `SELECT track, count(*) FROM pms_reports GROUP BY track;` shows every pre-existing row as `STANDARD`.

## Self-review notes

- **Coverage.** Every section, table, and word cap of both DOCX proformas is transcribed in Task 3; the Appendix-C rating rows and both scales are in `PEN_PICTURE_SPECS`; the three previously-open questions are answered under *Decisions locked in*.
- **Deliberate omissions**, each with its trigger for revisiting: in-app Sr. CoA/CoA/AO leave countersignature (Decision 4); grievance/representation for senior tracks (Decision 5); a rendered read view of annexure sections (Task 6 Step 2).
- **Unplanned finding.** The `period_from`/`period_to`/`self_score` persistence bug (Task 4) is pre-existing and blocks the standard track too. It is fixed in its own commit so it can be reviewed — and reverted — independently of the annexure work.

