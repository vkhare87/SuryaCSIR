# PMS Annual Work Plan (AWP) Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store, import (scanned PDF → OCR → reviewed form), fill online, approve (Scientist → HoD → Reviewing Officer → Director), revise, and show to committees the Part V Annual Work Plan.

**Architecture:** New `pms_awps` + `pms_awp_revisions` tables, keyed on `staff."ID"` + reporting year, independent of `pms_reports`. Every status change is a SECURITY DEFINER RPC. Frontend: new `AWPContext`, a pure workflow lib, a pure OCR-text parser, four pages under `/pms/awp`, and an AWP panel on the committee screens. OCR runs in the browser (pdfjs-dist renders pages → tesseract.js reads them) with the English model shipped in `public/`.

**Tech Stack:** React 19 + TS strict, Tailwind 4 tokens, Supabase (Postgres RLS + RPC), `@react-pdf/renderer` (existing), `pdfjs-dist` + `tesseract.js` (new), vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-pms-awp-workflow-design.md`

## Global Constraints

- New migration file only: `supabase/migrations/20261021000002_pms_awp.sql`. Never edit shipped migrations.
- RLS enabled on every new table, explicit policies, explicit GRANTs (default privileges give `authenticated` ALL — revoke what RPCs own).
- Every SECURITY DEFINER function opens with an authorization block; wrap nullable OR-chains in `COALESCE(..., false)`; `SET search_path = public`.
- Pages use `useAWP()` / `usePMS()` only — never Supabase directly. `useMemo` for derived data.
- Semantic Tailwind tokens only (`bg-surface`, `text-text-muted`, `border-border`, `focus:border-terracotta`); no raw colors/hex.
- `import type` for type-only imports; no `any` outside `src/utils/pmsMappers.ts`.
- Reporting year string format: `'2026-27'` (regex `^\d{4}-\d{2}$`). Period 1 Apr YYYY – 31 Mar YYYY+1.
- Revision window: until **30 Sep** of the first calendar year of the reporting year.
- Status values (exact): `DRAFT`, `WITH_RO`, `WITH_RVO`, `WITH_DIRECTOR`, `RETURNED`, `APPROVED`.
- Fixed activity labels (exact, in order): `R&D — Fundamental Research`, `R&D — Translational Research`, `R&D — Allied Services`, `R&D — Management Services`, `Leadership / HoD`, `Outreach activities`, `Any other`. Extra free rows allowed. Time % total must be 100 to submit.
- Extracted data is never saved without a human pressing Save.
- Gates: `npm run build`, `npm test`, `npm run lint` (0 errors), `python scripts/check_security_definer.py`.

## Review Focus

1. Scientist without a SURYA login (staff row `user_id` NULL) — import must still save; their AWP is visible to admins/RO/RvO/Director, and becomes theirs when `user_id` is linked (RLS reads via `staff.user_id`, not a copied column only).
2. OCR returns garbage or nothing for a page — import screen still opens with an empty form beside the PDF; nothing crashes.
3. Same scientist + year imported twice — second save must show "already exists" and offer to open it, not create a duplicate or silently overwrite.
4. Director is also the Reporting Officer — submit goes straight to `WITH_DIRECTOR`; Director's one decision fills RO + Director fields (R6).
5. Revision requested on 1 Oct or later, or on a non-APPROVED AWP — rejected by RPC with a clear message.

---

### Task 1: Database — tables, RLS, RPCs

**Files:**
- Create: `supabase/migrations/20261021000002_pms_awp.sql`
- Create: `supabase/tests/rls_awp.sql` (same style as `rls_negative.sql`: one transaction, `ROLLBACK`, raises `T<n> FAILED`)
- Modify: `scripts/check_security_definer.py` only if a pure resolver needs an `EXEMPT` entry (with reason)

**Interfaces — Produces:**
- Table `pms_awps` with columns exactly as spec §4, plus `confidential_note text`. `UNIQUE (staff_id, reporting_year)`. JSONB columns default `'[]'`/`'{}'`. Shapes:
  - `part_a`: `{ name, employeeId, group, designation, division, dob, dojCsir, dojGrade, category, email, mobile, reportingOfficer, reviewingOfficer, prevPmsOnTime: boolean|null, prevPmsDate }`
  - `activity_split`: `[{ label, role, timePct }]`
  - `projects`: `[{ kind: 'CSIR'|'EXTERNAL'|'LAB_MANDATE'|'OTHER', details, objectives, resources, confidential: boolean }]`
  - `objectives`: `{ projectDetails, hrd, processes, patents, publications, other }`
  - `development`: `{ fellowships, training, academic, other }`
- Table `pms_awp_revisions` per spec §4.
- Helper `pms_awp_director_staff_id() RETURNS text` — staff ID of the (first) user holding role `Director`.
- Helper `pms_awp_can_read(p_awp pms_awps) RETURNS boolean` (SECURITY DEFINER, STABLE): caller is admin, Director, owner (`staff.user_id = auth.uid()` for `staff_id`), RO/RvO (`caller_staff_id()`), or can read any `pms_reports` row of that scientist (committee readers).
- RPCs (all `RETURNS void` unless noted, each audits to `pms_audit_logs` and notifies the next actor via `pms_notifications` when they have a `user_id`):
  - `pms_awp_save_draft(p_staff_id text, p_year text, p_payload jsonb) RETURNS uuid` — owner only, creates or updates while `DRAFT`/`RETURNED`. Fills `reporting_officer_id` from `staff."ReportingID"` else division `"divHoDID"`; `reviewing_officer_id` default `pms_awp_director_staff_id()`.
  - `pms_awp_submit(p_awp_id uuid)` — owner; requires activity total = 100; → `WITH_RO`, or `WITH_DIRECTOR` if RO is the Director.
  - `pms_awp_ro_review(p_awp_id uuid, p_verdict text, p_reasons text)` — caller is RO; `NOT_REASONABLE` needs reasons ≥ 20 chars; → `WITH_DIRECTOR` if RvO is Director else `WITH_RVO`.
  - `pms_awp_rvo_review(p_awp_id uuid, p_remarks text)` — caller is RvO → `WITH_DIRECTOR`.
  - `pms_awp_director_decide(p_awp_id uuid, p_decision text, p_remarks text, p_payload jsonb DEFAULT NULL)` — Director or admin; `ACCEPTED` or `MODIFIED` (payload required, replaces content); → `APPROVED`, sets `approved_at/by`, `communicated_at = now()`, notifies scientist (R7). If RO step was skipped, records `ro_verdict='REASONABLE'`, `ro_at=now()` with remark "Director is Reporting Officer".
  - `pms_awp_return(p_awp_id uuid, p_reasons text)` — current actor (RO/RvO/Director/admin) → `RETURNED`.
  - `pms_awp_forward_blank(p_staff_id text, p_year text)` — admin; creates/moves to `WITH_RO`, `source='BLANK_FORWARDED'` (R9).
  - `pms_awp_import(p_staff_id text, p_year text, p_payload jsonb, p_status text, p_pdf_path text, p_ro_verdict text, p_ro_date date, p_approved_date date) RETURNS uuid` — admin; `p_status IN ('APPROVED','WITH_DIRECTOR','WITH_RO')`; raises `'AWP already exists for this scientist and year'` on conflict.
  - `pms_awp_request_revision(p_awp_id uuid, p_reasons text, p_after jsonb) RETURNS uuid` — owner/RO/RvO/Director; status `APPROVED`; `now()::date <= make_date(left(year,4)::int, 9, 30)`.
  - `pms_awp_decide_revision(p_revision_id uuid, p_approve boolean, p_remarks text)` — Director/admin; approve → content replaced, `communicated_at = now()`, notify scientist.
- Storage: new private bucket `awp-pdfs`, path `<awp_id>/<file>`; read via `pms_awp_can_read`, write admin/owner.

- [ ] **Step 1: Write `supabase/tests/rls_awp.sql`** with tests:
  - T1 scientist A cannot read scientist B's AWP.
  - T2 owner cannot `UPDATE pms_awps SET status='APPROVED'` directly (0 rows / permission error).
  - T3 RO of B can call `pms_awp_ro_review` on B's AWP; RO of nobody gets `'Not the Reporting Officer'`.
  - T4 `pms_awp_submit` with activity total 90 raises `'Time committed must total 100%'`.
  - T5 RO = Director → submit lands in `WITH_DIRECTOR`.
  - T6 import twice for same staff+year raises `'AWP already exists for this scientist and year'`.
  - T7 `pms_awp_request_revision` when today > 30 Sep of year raises `'Revision window (first six months) has closed'` (use year `'2020-21'`).
  - T8 evaluator assigned to B's report can read B's AWP.
- [ ] **Step 2: Write the migration** (tables, indexes on `staff_id`, `status`; RLS; grants: `REVOKE INSERT, UPDATE, DELETE ON pms_awps, pms_awp_revisions FROM authenticated; GRANT SELECT ...`; helpers; RPCs; bucket + storage policies; `REVOKE EXECUTE ... FROM PUBLIC, anon; GRANT ... TO authenticated` per function).
- [ ] **Step 3: Run** `python scripts/check_security_definer.py` → `OK: ... none unguarded.`
- [ ] **Step 4: Run** the SQL tests on a scratch DB if available (`supabase db reset` then `psql ... -f supabase/tests/rls_awp.sql` → `ALL RLS AWP TESTS PASSED`). If no scratch DB on this machine, say so in the task report — do not skip silently.
- [ ] **Step 5: Commit** `feat(pms): AWP tables, RLS and workflow RPCs`

### Task 2: Types, mappers, pure workflow rules

**Files:**
- Modify: `src/types/pms.ts`, `src/utils/pmsMappers.ts`
- Create: `src/lib/pms/awp.ts`, `src/lib/pms/awp.test.ts`

**Interfaces — Produces:**
- Types: `AWPStatus` (union of the 6), `AWPActivityRow { label: string; role: string; timePct: number }`, `AWPProject { kind: 'CSIR'|'EXTERNAL'|'LAB_MANDATE'|'OTHER'; details: string; objectives: string; resources: string; confidential: boolean }`, `AWPPartA`, `AWPObjectives`, `AWPDevelopment`, `AWPContent { partA; activitySplit; projects; objectives; development; institutionalWork: string; other: string }`, `PMSAWP extends AWPContent { id; staffId; scientistUserId: string|null; reportingYear; status; reportingOfficerId; reviewingOfficerId; roVerdict: 'REASONABLE'|'NOT_REASONABLE'|null; roReasons; roAt; rvoRemarks; rvoAt; directorDecision: 'ACCEPTED'|'MODIFIED'|null; directorRemarks; approvedAt; communicatedAt; source: 'IMPORTED'|'ONLINE'|'BLANK_FORWARDED'; sourcePdfPath: string|null; submittedAt; createdAt; updatedAt }`, `PMSAWPRevision`.
- Mappers: `mapAWPRow(row): PMSAWP`, `mapAWPRevisionRow(row): PMSAWPRevision`.
- `src/lib/pms/awp.ts`:
  - `AWP_ACTIVITY_LABELS: readonly string[]` (the 7, exact).
  - `emptyAWPContent(): AWPContent` (7 fixed rows, timePct 0; 4 project rows one per kind).
  - `activityTotal(rows: AWPActivityRow[]): number`
  - `reportingYearFor(date: Date): string` (Apr–Mar; 2026-10-21 → `'2026-27'`, 2027-02-01 → `'2026-27'`, 2027-04-01 → `'2027-28'`).
  - `revisionWindowOpen(year: string, now?: Date): boolean` (true through 30 Sep 23:59 local of first year).
  - `awpActionFor(awp: PMSAWP, ctx: { staffId: string|null; isDirector: boolean; isAdmin: boolean }): 'EDIT'|'RO_REVIEW'|'RVO_REVIEW'|'DIRECTOR_DECIDE'|null`.
  - `AWP_STATUS_LABEL: Record<AWPStatus, string>`.

- [ ] **Step 1: Write tests** in `awp.test.ts`: `activityTotal` of sample rows (25,50,5,2,5,2,1,5,5) = 100; `reportingYearFor` three dates above; `revisionWindowOpen('2026-27', new Date(2026,8,30,12))` true, `(…, new Date(2026,9,1))` false; `awpActionFor` — owner on `DRAFT` → `'EDIT'`, RO on `WITH_RO` → `'RO_REVIEW'`, Director on `WITH_DIRECTOR` → `'DIRECTOR_DECIDE'`, stranger → `null`; `emptyAWPContent().activitySplit.map(r=>r.label)` equals `AWP_ACTIVITY_LABELS`.
- [ ] **Step 2:** `npx vitest run src/lib/pms/awp.test.ts` → FAIL.
- [ ] **Step 3:** Implement types, mappers, `awp.ts`.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5: Commit** `feat(pms): AWP types and workflow rules`

### Task 3: AWPContext

**Files:**
- Create: `src/contexts/AWPContext.tsx`
- Modify: `src/App.tsx` (wrap PMS routes' provider tree next to `PMSProvider`)

**Interfaces:**
- Consumes: Task 1 RPC names/params, Task 2 types/mappers.
- Produces `useAWP()` returning `{ awps: PMSAWP[]; revisions: PMSAWPRevision[]; isLoading; error; refresh(); saveDraft(staffId, year, content): Promise<string>; submit(id); roReview(id, verdict, reasons); rvoReview(id, remarks); directorDecide(id, decision, remarks, content?); returnAWP(id, reasons); forwardBlank(staffId, year); importAWP(input: AWPImportInput): Promise<string>; requestRevision(id, reasons, after); decideRevision(revId, approve, remarks); uploadSourcePdf(awpId, file): Promise<string>; getSignedPdfUrl(path): Promise<string>; awpFor(staffId, year): PMSAWP | undefined }`.
- `AWPImportInput { staffId; year; content: AWPContent; status: 'APPROVED'|'WITH_DIRECTOR'|'WITH_RO'; pdf: File; roVerdict?: 'REASONABLE'|'NOT_REASONABLE'; roDate?: string; approvedDate?: string }` — `importAWP` calls `pms_awp_import` first (gets id), then uploads the PDF to `awp-pdfs/<id>/source.pdf` and stores the path via the same RPC's `p_pdf_path`. *(Order: upload to a temp path `import/<uuid>.pdf` first, pass that path; bucket policy allows admin write anywhere.)*
- Follow the repo context pattern (`createContext<… | undefined>`, throwing hook, `// eslint-disable react-refresh/only-export-components` at top). Load with `try/catch`, `console.error`, empty arrays on failure.

- [ ] **Step 1:** Implement. **Step 2:** `npm run build` passes. **Step 3: Commit** `feat(pms): AWP context`

### Task 4: PDF → text (OCR) and text → AWP parser

**Files:**
- Create: `src/lib/pms/awpExtract.ts`, `src/lib/pms/awpExtract.test.ts`, `src/lib/pms/__fixtures__/awp-samarth-ocr.txt`
- Create: `src/lib/pms/awpOcr.ts` (browser only, not unit-tested)
- Create: `public/tesseract/eng.traineddata.gz` (copy from `tesseract.js-data` / `@tesseract.js-data/eng` package after install)
- Modify: `package.json` (add `pdfjs-dist`, `tesseract.js`; exact versions pinned at install time)

**Interfaces — Produces:**
- `awpOcr.ts`: `extractPdfText(file: File, onProgress?: (page: number, total: number) => void): Promise<{ text: string; usedOcr: boolean }>` — try pdfjs text layer first; if < 50 non-space chars per page, render each page to canvas at 2× scale and OCR with tesseract.js (`langPath: '/tesseract'`, one worker reused, terminated at end). Both libraries loaded with dynamic `import()`.
- `awpExtract.ts`: `parseAWPText(text: string): { content: AWPContent; employeeId: string | null; name: string | null; reportingYear: string | null; roVerdict: 'REASONABLE'|'NOT_REASONABLE'|null; confidence: Record<'partA'|'activities'|'projects'|'objectives'|'development'|'other', 'high'|'low'|'empty'> }`.
  - Section split on headings (case-insensitive, tolerant of OCR noise): `PART A`, `PART B`, `Research Projects`, `Research Objectives`, `Professional & Personal Development`, `Any Other Institutional Work`, `Any Other Matter`, `REVIEW & ENDORSEMENT`.
  - Activity rows: a line starting with a known label (fuzzy: lowercase, strip `—-–&`, compare prefix) or any other line ending in an integer 0–100 inside Part B before "Research Projects" → row; trailing integer = `timePct`, text between = `role` (joined across wrapped lines). Unknown labels become extra rows.
  - Part A: `Employee ID` → digits; `Name of Employee` → rest of line; `Reporting Period: 1 April YYYY` → `'YYYY-YY'`.
  - RO verdict: a tick/`v`/`✓`/`☑` within 3 chars before `Appears reasonable` → `REASONABLE`; same before `Does not appear` → `NOT_REASONABLE`.
- Fixture: hand-transcribe the sample `C:\Users\HP\Downloads\AWP-2026-27.pdf` (Samarth Singh) as OCR-like plain text (line-broken as on the page, keep the Rupee/tick noise as `v`). It is real staff data: keep it only if the user agrees; otherwise anonymise name/ID/email/mobile/DOB to `Test Scientist`, `99999`, etc. **Ask before committing it.**

- [ ] **Step 1: Write tests** (`awpExtract.test.ts`): on the fixture → `employeeId === '40110'` (or anonymised value), `reportingYear === '2026-27'`, `activityTotal(content.activitySplit) === 100`, `content.activitySplit.length === 9`, includes a row labelled `Industry Projects` with `timePct 1`, `roVerdict === 'REASONABLE'`, `content.projects.find(p=>p.kind==='CSIR')!.objectives` contains `SMA`; on `''` → all confidence `'empty'` and `content` deep-equals `emptyAWPContent()`; on random text `'lorem ipsum'` → no throw.
- [ ] **Step 2:** `npx vitest run src/lib/pms/awpExtract.test.ts` → FAIL.
- [ ] **Step 3:** Implement parser; then install deps, copy traineddata, implement `awpOcr.ts`.
- [ ] **Step 4:** Tests PASS; `npm run build` passes (OCR libs must be in a separate chunk — check `dist/assets` for a tesseract chunk not in the main bundle).
- [ ] **Step 5: Commit** `feat(pms): AWP PDF OCR and Part V parser`

### Task 5: AWP form and PDF

**Files:**
- Create: `src/components/pms/AWPPartVForm.tsx`, `src/components/pms/AWPPartVForm.test.tsx`, `src/components/pms/AWPPDF.tsx`, `src/components/pms/AWPPanel.tsx` (read-only view + status timeline, reused by committees, inbox, register)

**Interfaces — Produces:**
- `AWPPartVForm({ value: AWPContent; onChange(v: AWPContent): void; disabled?: boolean })` — Part A grid; activity table with the 7 fixed rows (label read-only) + "Add row" for extras + live total (shows "Total must be 100%" when not 100); project rows with `confidential` checkbox; objectives a–f; development a–d; (4), (5) textareas.
- `AWPPDF({ awp: PMSAWP })` — `@react-pdf/renderer` Document laid out as Part V incl. "Review & Endorsement" block filled from `roVerdict/roAt` and Director block from `directorDecision/approvedAt`.
- `AWPPanel({ awp: PMSAWP; hideConfidential?: boolean })` — read-only; when `hideConfidential`, a project with `confidential` shows "Confidential — details withheld".

- [ ] **Step 1: Test** (`AWPPartVForm.test.tsx`, Testing Library like `ReportWizard.test.tsx`): renders 7 fixed labels; typing 100 into first row's % shows no total warning; 90 shows `Total must be 100%`; "Add row" adds an editable label input.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + build. **Step 5: Commit** `feat(pms): AWP Part V form, panel and PDF`

### Task 6: Pages, routes, access, nav

**Files:**
- Create: `src/pages/pms/AWPMine.tsx`, `src/pages/pms/AWPInbox.tsx`, `src/pages/pms/AWPImport.tsx`, `src/pages/pms/AWPRegister.tsx`
- Modify: `src/App.tsx` (routes), `src/constants/access.ts` (`'/pms/awp': PMS_AUTHORS`, `'/pms/awp/inbox': [...PMS_AUTHORS, 'DivisionHead', 'HOD', 'Director']`, `'/pms/awp/import': HR`, `'/pms/awp/register': [...HR, 'Director']` + labels), `src/components/layout/Layout.tsx` (nav under Performance Mgmt)

**Behaviour:**
- **AWPMine:** year picker (default `reportingYearFor(new Date())`, and next year from 1 Apr); form when action is `EDIT`, else `AWPPanel`; buttons Save draft, Download PDF, Submit (disabled unless total 100); revision request (reasons ≥ 20, edited content) only when `APPROVED` and `revisionWindowOpen`.
- **AWPInbox:** list where `awpActionFor(...)` is a review action; detail = `AWPPanel` + PDF link (source PDF signed URL if imported) + action panel: RO (radio reasonable / not + reasons, required if not), RvO (remarks), Director (Accept / Modify (opens form) / Return); pending revisions for Director.
- **AWPImport:** multi-file picker → queue; per file run `extractPdfText` with progress → `parseAWPText` → match staff by employee ID then exact name (show dropdown to change; unmatched = must pick) → side-by-side PDF (`<iframe>` of object URL) + `AWPPartVForm` prefilled; low-confidence sections get a `border-warning`-token outline; status select (APPROVED / WITH_DIRECTOR / WITH_RO) defaulting to WITH_DIRECTOR when `roVerdict` found, else WITH_RO; RO date / approval date inputs; Save → `importAWP`; on "already exists" show message + link. "Scanned page, no text found" note when OCR text empty.
- **AWPRegister:** table staff (Designation matches `STANDARD_DESIGNATIONS` / Sci B–F) × selected year → status badge, RO, last action date; filter "not submitted"; admin button "Forward blank to RO" (R9) for rows with no AWP after 15 May.

- [ ] **Step 1:** Implement pages + wiring. **Step 2:** `npm run build`, `npm run lint` (0 errors). **Step 3:** Run the app (`preview_start`), log in as admin, import the sample PDF end to end; screenshot import screen. **Step 4: Commit** `feat(pms): AWP pages — mine, inbox, import, register`

### Task 7: Committees see the AWP; wizard links to it

**Files:**
- Modify: `src/pages/pms/EvaluateReport.tsx`, `src/pages/pms/CommitteeQueue.tsx`, `src/pages/pms/ReportView.tsx`, `src/lib/pms/constants.ts` (WIZARD_STEPS: replace the `awp: true` step label with `Part V: Annual Work Plan (next year)`), `src/components/pms/ReportWizard.tsx` (AWP step renders a link card to `/pms/awp?year=<next>` with its status instead of `AWPForm`), `src/lib/pms/permissions.test.ts` (update the AWP-step assertion if label/shape changes)

**Behaviour:** For a report whose period starts in April YYYY, show `AWPPanel` (`hideConfidential` for committees) for `reportingYear = 'YYYY-YY'` — the plan the work is judged against — under a heading "Approved Annual Work Plan"; if none or not APPROVED, show status text ("No approved AWP on record"). Place it directly above the Section V shortfall data.

- [ ] **Step 1:** Implement. **Step 2:** `npm test` all pass; build; lint. **Step 3:** Preview: open an evaluation for a report with an AWP; screenshot. **Step 4: Commit** `feat(pms): show approved AWP to committees; wizard links to AWP`

### Task 8: Docs and final verification

**Files:** Modify `docs/engineering/database_design.md` (2 tables), `docs/engineering/api_spec.md` (RPCs), `docs/engineering/FEATURES.md` (AWP), `docs/roadmap/sources/PMS-2026-GAP-REVIEW.md` (mark Part V rows done), `CLAUDE.md` health-stack test count.

- [ ] **Step 1:** Update docs. **Step 2:** Full gates: `npm run build`, `npm test`, `npm run lint`, `python scripts/check_security_definer.py`. **Step 3: Commit** `docs(pms): AWP workflow`.
