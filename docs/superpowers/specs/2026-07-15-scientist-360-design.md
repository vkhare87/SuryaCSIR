# Scientist 360 — Evidence-Grounded Assessment & One-Click Dossier

**Date:** 2026-07-15
**Status:** Approved
**Relation to intelligence ladder:** parallel person-centric track. Stages 1–2
are pure client-side (no dependency on `docs/roadmap/sources/INTELLIGENCE-PHASES.md` phases);
stage 3 integrates with the ladder after Phase 1b (production RAG gate) exits.

## Problem

Every table in SURYA is ultimately about scientists — publications, patents,
projects, proposals, PhD supervision, tech transfers, committee service, PMS
history — but nothing joins them at the person. Evaluators read PMS
self-appraisals with no institutional evidence beside them; leadership cannot
pull up "present work + history + impact" for one person in one click.
Decisions are slower and less fact-grounded than the data already allows.

## Decisions (confirmed)

1. **Audience: both, one engine.** A single dossier builder feeds (a) an
   evidence panel embedded in PMS evaluation screens and (b) a standalone
   360° profile surface reachable from anywhere a staff name appears.
2. **Autonomy boundary: evidence + patterns + drafted brief. No scores.**
   The system assembles evidence, flags claim corroboration, surfaces
   trajectory patterns, and drafts a factual pre-evaluation brief. Committees
   score. The system never proposes a number — consistent with the existing
   `piTrackRecord` philosophy ("scoring scientists creates gaming incentives —
   governance question, not a math one") and the 2026 CSIR guidelines, which
   place scoring exclusively with committees.
3. **Claim cross-check is a core feature.** PMS self-appraisal items are
   automatically matched against institutional records. Language discipline:
   `no-matching-record`, never "unverified claim" — a missing record most
   likely means an ingestion gap, not misconduct.

## Architecture: staged hybrid

- **Stage 1 (this spec's build):** pure client-side derivation in
  `src/lib/scientist/` — the same evolutionary path `themes.ts`,
  `successionRisk.ts`, `trackRecord.ts` took. Zero new infrastructure, no new
  tables, fully unit-testable.
- **Stage 2 (this spec's build):** pattern flags feed the already-shipped
  executive digest pipeline — the system nominates what needs attention,
  humans decide.
- **Stage 3 (deferred, ladder-gated):** `scientist_dossier` catalog function
  in the Ask SURYA analytics catalog returning the same typed shape computed
  by the TS engine (twinning ratchet: TS is the home; the catalog consumes the
  shape, no re-implementation), enabling "Ask about this scientist" and
  optional LLM narration of the brief. Blocked until Phase 1b exit criteria
  pass. Not built now.

## Components (Stage 1)

### 1. `src/lib/scientist/dossier.ts`

`buildScientistDossier(staffId, data, pmsHistory) → ScientistDossier`

Pure function over entities already loaded by `DataContext` / `PMSContext`:

- **Identity:** staff row, division, designation, IRINS profile pointer.
- **Present work:** active projects (PI via `personNamesMatch`, staff via
  `project_staff`), proposals in flight, current PhD supervisees (+ milestone
  status), committee memberships, open action items.
- **History:** completed projects with `piTrackRecord` budget/timeline facts,
  past PMS cycles (final score, grade, committee reasons, representation
  outcomes) — visible only to roles allowed to see them (see Access).
  **RLS constraint:** `pms_committee_decisions` is readable only by the
  decider and admins, so the score-history section populates for admin roles
  and degrades gracefully ("score history not visible to your role") for
  everyone else. Widening that policy is a governance decision, explicitly
  out of scope here.
- **Impact:** publications (`staffNameMatchesAuthor`) with citations/impact
  factor, patents (`ip_intelligence.inventors`), tech transfers, MoU
  involvement, completed PhD supervisions.

**Identity join disclosure:** staff ↔ auth-user ↔ author-name matching is the
known weak link. Every matched item carries
`matchBasis: 'id' | 'email' | 'name'`; surfaces render the basis and the
brief footers count them.

### 2. `src/lib/scientist/claimMatch.ts`

`matchClaims(reportSections, dossier) → ClaimMatch[]`

Per PMS self-appraisal item: `corroborated` (institutional record found —
carries a link), `no-matching-record`, or `new-to-system` (claim dated after
the latest relevant data load). Matching = normalized-token title fuzzy match
guarded by year and record type. Inherits the division-dossier coverage-gap
discipline: gaps are flagged as possible ingestion gaps.

### 3. `src/lib/scientist/trajectory.ts`

Per-year series (publications, projects started, IP filed, supervisees,
transfers) plus deltas against the previous PMS cycle window. Emits
**descriptive flags only** — `output-rising`, `output-flat`,
`new-collaboration-cluster` (from `coAuthorPairs`), `supervision-load-up`,
`budget-overrun-history`, `duty-days-below-90-candidate`. Words, never
composite numbers.

### 4. `src/lib/scientist/brief.ts`

Deterministic markdown pre-evaluation brief (division-dossier style):
identity → current-cycle claims with corroboration status → trajectory vs
last cycle → track record → disclosure footer (match-basis counts,
data-freshness date, "no-matching-record ≠ false"). Downloadable via the
existing markdown/PDF export path.

### 5. Surfaces

- **360° profile:** new tab/section on `StaffDetail.tsx` (executor may choose
  a dedicated `StaffProfile360.tsx` page if StaffDetail is too crowded — one
  route, linked from every staff-name render: DataTable name cells,
  UserPicker results, committee member lists).
- **`src/components/pms/EvidencePanel.tsx`:** embedded in
  `EvaluateReport.tsx` and `CommitteeQueue.tsx` — claims annotated with
  corroboration chips, trajectory sparkline, "open full dossier",
  "download brief".
- **Access:** scientist sees own dossier; evaluators see dossiers of
  scientists whose reports they are assigned (committee membership via
  existing `permissions.ts` helpers); Director/HRAdmin/SystemAdmin/MasterAdmin
  see all. Client-side role gate; underlying rows already RLS-scoped, and PMS
  score history additionally respects `pms_committee_decisions` RLS.

### 6. Digest rules (Stage 2)

New rules in the existing `src/lib/digest/executive.ts` pipeline:
`evaluation-pending-brief-ready` (per committee member / admin) and
trajectory-anomaly nominations for the Director (capped + severity-sorted by
the shipped digest infrastructure; every item deep-links to the dossier or
evaluation screen).

## Testing

Every module is a pure function with vitest fixture tests (existing idiom).
`claimMatch` additionally gets adversarial cases: near-duplicate titles, name
variants, missing years, same title different year.

## Out of scope

- Any suggested score, score band, ranking, or composite index of a person.
- New DB tables or migrations (Stage 1–2 touch none).
- Stage 3 catalog function, AskDrawer integration, LLM narration — recorded
  here as direction, built only after Phase 1b exit.
- Attendance/duty-day computation (duty_days stays manual per PMS 2026
  decision; the trajectory flag only reads the recorded value).
