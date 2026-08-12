# PMS Senior Track — Annexure-I (Chief Scientist/OS/DS) & Annexure-II (Director)

> **Status: SHIPPED, 2026-07-26.** This document is now a design record, not a plan.
> Delivered by migration `20260726000001_pms_senior_track.sql` (`pms_reports.track`,
> `pms_committee_decisions.pen_picture`, `pms_caller_track`, `pms_set_report_track`,
> `pms_finalize_senior_report`) and PR #11 (`feature/pms-senior-track`):
> `ANNEXURE_I_WIZARD_STEPS` / `ANNEXURE_II_WIZARD_STEPS` in `src/lib/pms/constants.ts`,
> `src/components/pms/PenPictureForm.tsx`, `SpecSection.tsx`, track-aware report view and
> PDF export.
>
> As designed, it runs parallel to the 2026-guidelines PMS (Scientist B–F) and does not
> modify that flow. Current behaviour lives in
> [system_design.md §4.1](../engineering/system_design.md#41-pms-report--pms_reportsstatus) and
> [database_design.md §3.3](../engineering/database_design.md#33-pms--20260712000004_pmssql-);
> read those first — the sections below record *why* it was built this way.

## 1. Problem

Current PMS implements the 2026 CSIR appraisal guidelines, which cover **Scientist B through
Scientist F only** (`ELIGIBLE_SCIENTIST_GRADES` in `src/lib/pms/constants.ts`, committee tiers
I–III). Scientist G and the Director are explicitly out of scope of those guidelines. They are
appraised under separate CSIR proformas:

- **Annexure-I** — Performance Mapping Proforma of **Chief Scientist / Outstanding Scientist /
  Distinguished Scientist** (the Scientist G tier).
- **Annexure-II** — Performance Mapping Proforma of **Director** of CSIR Laboratory/Institute.

Requirement: every scientist (B–G) and the Director can access the PMS portal; when the active
role/grade resolves to Scientist G or Director, the portal presents the corresponding Annexure
format instead of the standard 5-part proforma. Fully role/grade-driven, parallel track.

## 2. Source formats (as digitised from the official DOCX proformas)

### 2.1 Annexure-I — Chief Scientist / OS / DS

| Part | Content | Filled by |
|------|---------|-----------|
| Cover | Name, designation, place of posting, DOJ present position, tenure/superannuation date | Scientist |
| Appendix A — Basic Information | Identification (name, emp ID, group/grade, DOB, division, DOJ CSIR, email, mobile), evaluation period (part/full year), immovable-property return filed, educational attainments (table), employment details (table), leave record (table, **signed by Sr. CoA/CoA/AO**) | Admin + scientist |
| Questionnaire (10 narrative Qs) | Sector-wise achievements (public/private/strategic/societal goods), National/CSIR Missions, knowledge portfolio (generation/development/management), leadership role, mentoring, capability building, impact-making activity, prestige/stakeholder connect, next 1–2 year focus, desired exposure/experience | Scientist |
| Appendix B — Work Report | **Section I**: R&D participation (table), national programmes/facility creation (table), major facilities O&M (table), notable contributions (≤10, ≤150 words). **Section II**: publications (SCI journals, conference, books, institutional pubs — tables), patents (table), financial contribution (ECF, tech transfer, testing/EIA/software jobs — tables), tech/process/product development (table). **Section III**: 13 narrative items ≤300 words (field work, strategic sector, new clients, indigenous tech, forex saving, S&T cooperation, institution building, training programmes, …). **Section IV**: 10 narrative items ≤300 words (policy, rules, inter-agency interaction, mega projects, committees, admin responsibilities, events, lab positioning, leadership). **Section V — AcSIR/HRD**: lectures (table), curriculum design ≤100 w, academy contributions ≤150 w, lecture notes ≤100 w, other teaching ≤150 w, MS/PhD guided, PG projects guided. **Section VI**: fellowships, awards, editorships | Scientist |
| Appendix C — Evaluation | **Pen Picture**: A. Personal attributes (personality; initiative/drive/networking; leadership) — Excellent/Very Good/Good/Needs Improvement. B. Professional competence (org-role perception; communication; out-of-box thinking; comprehension of new developments). C. Managerial capabilities (responsibility; decision making; crisis handling; leadership). D. Integrity & Ethics — Impeccable/Beyond Doubt/To be Monitored. E. Adverse comment Y/N. Committee evaluation report (~100 words) + **review remarks of Director/DG CSIR** | Committee, then Director/DG |

### 2.2 Annexure-II — Director

| Part | Content | Filled by |
|------|---------|-----------|
| Cover | Name, substantive position, lab, DOJ present position, tenure/superannuation date | Director |
| Appendix A — Basic Information | Same shape as Annexure-I (identification supplied by lab administration; leave record signed by Sr. CoA/CoA/AO) | Admin |
| Questionnaire — Achievements as Director | A. Strategic positioning & benchmarking (leadership ≤300 w; Vision-2030/PAB roadmap 150–200 w; GOI missions ≤300 w; new S&T domains; facilities created). B. Benchmarking (top 10 scientific contributions; top 10 technological contributions w/ socio-economic impact; top 5 leadership achievements). C. **Output/Outcome matrix — 15 numeric KPIs** (WoS papers, patents filed/granted, MOUs, PhDs, products/tech developed, transfers > ₹10 L, S&T services > ₹5 L, industry consultancy count, new projects, budget realized, CSIR/Govt/Industry/International project counts+values, foreclosures). D. Societal interventions (top 5 + skill development). E. Administrative/financial achievements (5 initiatives; vacancy status Gp IV/III/II; manpower training; budget allocation & utilization). F. Challenges / ease of doing business | Director |
| Appendix B — Achievements as Scientist/Researcher | Sections I–V, near-identical structure to Annexure-I Appendix B (R&D involvement, publications, patents, financial contribution, tech development, 300-word narrative sets, fellowships/awards/editorships, students guided). Only relevant sub-sections filled | Director |
| Appendix C — Evaluation | Pen Picture: A. Personal attributes (personality; innovation/creativity/initiative/drive). B. Professional competence (vision; organizational connect; goal achievement). C. Managerial capabilities (leadership; crisis handling). D. Integrity & Ethics. E. Adverse comment. **Evaluation by DG, CSIR (~100 words)** | **DG CSIR only** |

### 2.3 Structural differences vs standard PMS (B–F)

- **No 0–100 score, no grade bands, no AWP.** Evaluation is a categorical pen picture + a
  ~100-word narrative. `scoring.ts` / `GRADE_BANDS` do not apply.
- **Different workflow actors.** Annexure-I: evaluation committee → Director/DG review.
  Annexure-II: DG CSIR directly — no in-app evaluation step is possible (DG is outside SURYA);
  the system's job ends at producing the submission dossier + recording the outcome.
- **Leave record needs an administrative sign-off** (Sr. CoA/CoA/AO) before submission — a
  verification step the standard track doesn't have.
- Heavy table content (publications, patents, ECF, tech transfer) — same shapes as the standard
  track's Section II; `DynamicTable` and word-count sections (`WordCountTextarea`) reuse directly.

## 3. Design

### 3.1 Track resolution (role + grade based)

New pure function in `src/lib/pms/permissions.ts`:

```
type PmsTrack = 'STANDARD' | 'ANNEXURE_I' | 'ANNEXURE_II';

pmsTrack(activeRole, designation):
  Director role                                → 'ANNEXURE_II'
  Scientist G, or designation ∈ {Chief Scientist,
    Outstanding Scientist, Distinguished Scientist} → 'ANNEXURE_I'
  scientistGrade ∈ B–F                         → 'STANDARD'
  otherwise                                    → null (not an appraisee)
```

- `ELIGIBLE_SCIENTIST_GRADES` stays B–F for the standard track; add
  `SENIOR_DESIGNATIONS` + grade `G` matching for Annexure-I.
- `ACCESS_MAP` needs **no change**: `/pms` already admits `Scientist`, `Director` (both in
  `PMS_AUTHORS`). All scientists B–G therefore already reach the portal; the track function
  decides *which* format renders.
- `src/pages/pms/Index.tsx` and `ReportNew.tsx` branch on `pmsTrack()`; standard users see the
  existing wizard untouched.

### 3.2 Data model (one new migration, additive only)

`supabase/migrations/<TS>_pms_senior_track.sql`:

1. `ALTER TABLE pms_reports ADD COLUMN track text NOT NULL DEFAULT 'STANDARD'
   CHECK (track IN ('STANDARD','ANNEXURE_I','ANNEXURE_II'));`
   Existing rows/flow untouched.
2. Sections reuse `pms_report_sections` as-is (free-text `section_key`, JSONB content). New
   namespaced keys — Annexure-I: `sr_cover`, `sr_basic`, `sr_q1`…`sr_q10`, `sr_b_i1`…`sr_b_vi`;
   Annexure-II: `dir_cover`, `dir_basic`, `dir_qa`…`dir_qf`, `dir_matrix` (the 15-KPI grid),
   `dir_b_*`. **No schema change needed for content.**
3. New table `pms_pen_pictures` (report_id FK, evaluator_id, attributes JSONB — categorical
   ratings keyed per Appendix-C row, integrity_rating, adverse_comment boolean + text,
   narrative text, reviewer_remarks text, timestamps). RLS: appraisee reads own after
   FINALIZED; evaluators/DATA_ADMINS write. Kept separate from `pms_evaluations`
   (which is 0–100 dimensional and standard-track-only).
4. `ALTER TABLE pms_reports ADD COLUMN leave_verified_by uuid, leave_verified_at timestamptz;`
   plus RPC `pms_verify_leave_record(report_id)` restricted to HRAdmin/admins (stands in for
   Sr. CoA/CoA/AO sign-off).

### 3.3 State machine (reuse, subset)

Existing statuses reused; senior tracks use a subset — **no new statuses**:

- **Annexure-I**: `DRAFT → SUBMITTED → UNDER_EVALUATION_COMMITTEE_REVIEW → FINALIZED`
  (committee files pen picture; Director/DG review remark recorded on `pms_pen_pictures`;
  no `EMPOWERED_COMMITTEE_REVIEW` stage).
- **Annexure-II**: `DRAFT → SUBMITTED → FINALIZED`. DG evaluation happens off-system; on
  FINALIZE the app produces the print/PDF dossier and later stores the returned Appendix-C
  outcome (admin data entry into `pms_pen_pictures`).

Guard rails: existing RPCs gain a `track` check — `pms_assign_evaluators` /
`pms_finalize_report` validate legal transitions per track; `pms_submit_report` requires
`leave_verified_at IS NOT NULL` for senior tracks. Scores remain NULL for senior tracks
(CHECK: score columns only for `track = 'STANDARD'`).

### 3.4 UI (reuse the wizard machinery)

- `src/lib/pms/constants.ts`: add `ANNEXURE_I_WIZARD_STEPS`, `ANNEXURE_II_WIZARD_STEPS` and
  per-section `MAX_WORDS` entries (150/100/300-word caps from the proformas).
- `ReportWizard`, `SectionForms`, `DynamicTable`, `WordCountTextarea`, `SignatureUpload`,
  `AnnexureUpload` all reuse. New table-column configs for the Annexure tables (publications,
  patents, ECF, lectures, employment, leave) and a small KPI-grid form for the Director
  Output/Outcome matrix.
- New evaluation UI: `src/components/pms/PenPictureForm.tsx` (categorical radio matrix per
  Appendix C variant) rendered inside the existing `EvaluateReport.tsx` when
  `report.track !== 'STANDARD'`.
- `ReportPDF.tsx`: two new layouts mirroring the official proformas (cover + Appendix A/B/C)
  for the one-click dossier.
- `StatusBadge`, `Reports.tsx` list, audit log: track-aware labels only.

### 3.5 What explicitly does NOT change

- Standard B–F flow, scoring, deadlines, grievance, committee tiers — untouched.
- `ACCESS_MAP`, routes, nav.
- Shipped migrations (additive migration only).

## 4. Implementation phases

| Phase | Scope | Verify |
|-------|-------|--------|
| 1 | `pmsTrack()` + `SENIOR_DESIGNATIONS` + section-key/wizard-step constants; unit tests in `permissions.test.ts` | tests pass; standard-track snapshots unchanged |
| 2 | Migration: `track` column, `pms_pen_pictures`, leave-verification columns + RPC, RPC track guards, RLS | `supabase db push` on local; RLS smoke via existing pattern |
| 3 | Annexure-I wizard (steps, table configs, word caps) branching in `ReportNew`/`ReportEdit`; leave-verify admin action | draft→submit E2E as Scientist G test user |
| 4 | Annexure-II wizard incl. KPI matrix form | draft→submit as Director test user |
| 5 | `PenPictureForm` + committee flow for Annexure-I; admin outcome entry for Annexure-II | evaluate→finalize E2E |
| 6 | `ReportPDF` layouts for both annexures | PDF matches proforma section order |

Open decisions before Phase 1 (confirm with CSIR-AMPRI):
1. Does Scientist G always map to Chief Scientist/OS/DS, or can designation text diverge from
   grade? (Track resolution precedence: designation match first, then grade.)
2. Who acts as the Annexure-I evaluation committee inside SURYA — reuse
   `pms_evaluation_committees` with a new tier `IV`, or the empowered committee membership?
   Plan assumes a new tier `IV` row in `COMMITTEE_TIERS`.
3. Are senior-track reports bound to the same `appraisal_cycles` calendar and Nov-30 lock?
   Plan assumes yes (same cycle rows, same lock).
