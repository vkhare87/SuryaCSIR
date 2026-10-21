# PMS Annual Work Plan (AWP) Workflow — Design

Date: 2026-10-21 · Status: draft for approval
Source rules: *CSIR PMS Guidelines 2026*, §5.E (Part V) and Annexure-A Part V (pp. 29–31);
Appendix-A Section V (shortfall, p. 24). Gap review: `docs/roadmap/sources/PMS-2026-GAP-REVIEW.md`.

## 1. Intent

Under the 2026 rules every scientist (Sci B–F) is assessed against an approved Annual Work Plan.
The lab needs:

1. A place to hold each scientist's AWP for a reporting year, in the Part V shape.
2. **Now (2026-27):** the AWPs already exist as PDFs (mostly typed). An admin imports them —
   SURYA reads the PDF, pre-fills Part V, a human checks and saves. Nothing saves unreviewed
   (same rule as the existing ingest pipeline).
3. **From 2027-28:** scientists fill Part V in SURYA, get a PDF, and send it up the chain
   Scientist → HoD / Reporting Officer → Reviewing Officer → Director.
4. The Evaluation Committee and Empowered Committee see the approved AWP next to the report,
   so they can compare plan against outcome.

## 2. Rules the design must honour (from the notification)

| # | Rule | Source |
|---|---|---|
| R1 | AWP covers 1 Apr YYYY – 31 Mar YYYY+1 (one reporting year) | Part V header |
| R2 | Scientist submits AWP signed, by **15 May**, with the self-appraisal | §5.E.a.i |
| R3 | Forwarded to Reporting Officer/HoD and Reviewing Officer "wherever applicable"; finalised by consensus as far as possible | §5.E.a.ii |
| R4 | HoD/RO records "reasonable / not reasonable"; if not, gives reasons | Part V sign-off block |
| R5 | Director may accept or modify; decision final, no appeal | §5.E.a.iv |
| R6 | If Director is the RO and/or Reviewing Officer, no separate Director approval | §5.E.a.v |
| R7 | Approved AWP communicated to the scientist | §5.E.a.vi |
| R8 | Revision only in first 6 months (to 30 Sep), started by scientist / RO / Reviewing Officer / Director, reasons recorded, Director approves, communicated at once | §5.E.a.vii |
| R9 | No AWP in time → blank Part V goes to Reporting Officer, who acts | §5.E.a.iii |
| R10 | AWP is the base to measure performance; Section V of self-appraisal = committed vs achieved vs reasons | §5.E, App-A §V |
| R11 | Confidential / national-security projects: lab decides case by case | §5.E |

## 3. Goals / non-goals / anti-goals

**Goals:** Part V data model; PDF import with review; online fill + PDF; approval chain with
R4–R9; revision; committee view side by side with the report.

**Non-goals (now):** scanned-PDF OCR (falls back to manual entry beside the PDF); R11 handling
beyond a free-text "confidential" flag; senior tracks (Annexure-I/II have no AWP); rebuilding the
rest of the 2026 proforma (separate work in the gap review).

**Anti-goals:** saving extracted data without a human check; the client driving status changes
(all transitions are SECURITY DEFINER RPCs, per repo rules); losing the original PDF.

## 4. Data model (new migration)

AWP lives on its own, **not** inside `pms_reports`: 2026-27 AWPs exist before any 2026-27 report,
and an AWP for year Y+1 is filed with the report for year Y.

`pms_awps` — one row per scientist per reporting year.

| Column | Notes |
|---|---|
| `id` uuid PK | |
| `staff_id` text NOT NULL → `staff."ID"` | key, works for staff without a login |
| `scientist_user_id` uuid NULL → auth.users | filled when the staff row has `user_id` |
| `reporting_year` text NOT NULL | `'2026-27'`; UNIQUE (`staff_id`,`reporting_year`) |
| `status` text | see §5 |
| `part_a` jsonb | personal details snapshot (name, ID, grade, designation, division, DOJ, RO, RvO, prev PMS on time) |
| `activity_split` jsonb | the 7 fixed "Nature of Activity" rows: role + time % (must total 100) |
| `projects` jsonb | (1) CSIR / External / Lab-mandate rows: details, objectives, resources |
| `objectives` jsonb | (2) a–f indicator → remarks |
| `development` jsonb | (3) a–c area → remarks |
| `institutional_work` text, `other` text | (4), (5) |
| `reporting_officer_id` text → staff | default `staff."ReportingID"`, else division `divHoDID` |
| `reviewing_officer_id` text → staff | default: the Director's staff ID; admin may override |
| `ro_verdict` text `REASONABLE`/`NOT_REASONABLE`, `ro_reasons` text, `ro_at` | R4 |
| `rvo_remarks` text, `rvo_at` | R3 |
| `director_decision` text `ACCEPTED`/`MODIFIED`, `director_remarks`, `approved_at`, `approved_by` | R5 |
| `communicated_at` timestamptz | R7 — set on approval |
| `source` text `IMPORTED`/`ONLINE`, `source_pdf_path` text | original PDF kept in storage |
| `submitted_at`, `created_at`, `updated_at` | |

`pms_awp_revisions` — R8 history: `awp_id`, `initiated_by`, `reasons`, `before` jsonb,
`after` jsonb, `status` (`PENDING`/`APPROVED`/`REJECTED`), `decided_by`, `decided_at`.

Existing `pms_awp_activities` (the old report-embedded step) is left in place but the wizard's
AWP step is replaced by a link to the scientist's AWP for the next year. *(Builder call: no data
migration — table has no production rows that matter; confirm with a count before dropping later.)*

RLS: scientist reads own; RO / RvO / Director read the AWPs they act on; admin all; evaluation /
empowered / grievance members read the AWP of any scientist whose report they can read. Writes to
content only by owner while `DRAFT` or `RETURNED`; everything else via RPCs. Nov-30 lock does
**not** apply (AWP year differs from appraisal cycle).

## 5. State machine

```
DRAFT ──submit──▶ WITH_RO ──RO verdict──▶ WITH_RVO ──RvO forward──▶ WITH_DIRECTOR ──approve──▶ APPROVED
  ▲                 │ return (reasons)       │ return                    │ modify+approve ──────┘
  └──── RETURNED ◀──┴────────────────────────┴───────────────────────────┘
```

- R6 shortcut: if RvO is the Director, `WITH_RVO` and `WITH_DIRECTOR` collapse — the Director's
  one action records both. If RO is the Director, RO step also collapses.
- "Return" = consensus loop (R3): sends back to scientist with reasons; resubmit restarts at RO.
- Director "modify": Director edits content, records remarks, approves. Final (R5).
- R9: on 16 May an admin can "forward blank" — creates/moves a DRAFT AWP to `WITH_RO` with
  `source='BLANK_FORWARDED'`; RO fills it on the scientist's behalf. *(Builder call: manual admin
  action, no cron.)*
- Revision (R8): only while `now() <= 30 Sep` of the AWP's first year and status `APPROVED`.
  Creates a `pms_awp_revisions` row; Director approves → content replaced, `communicated_at`
  refreshed, scientist notified.
- Imported AWPs: admin chooses initial status at save — `APPROVED` (paper chain already done;
  records who approved and date from the PDF if present) or `WITH_RO` (still needs review).

RPCs (each opens with an authorization block): `pms_awp_submit`, `pms_awp_ro_review`,
`pms_awp_rvo_review`, `pms_awp_director_decide`, `pms_awp_return`, `pms_awp_forward_blank`,
`pms_awp_import` (admin), `pms_awp_request_revision`, `pms_awp_decide_revision`. Each writes
`pms_audit_logs` and a notification.

## 6. Screens

All under `/pms/awp`, registered in `ACCESS_MAP`.

1. **My AWP** (scientist) — Part V form for the selected year; 7 activity rows with live total;
   sections (1)–(5); Download PDF; Submit. Shows status timeline and reviewer remarks.
2. **AWP Inbox** (HoD / RvO / Director) — list of AWPs waiting on me; open → read-only Part V +
   verdict panel (RO: reasonable/not + reasons; RvO: remarks; Director: accept / modify / return).
3. **AWP Import** (HRAdmin / SystemAdmin / MasterAdmin) — pick many PDFs → per file: extracted
   text, auto-matched staff (by employee ID, then name), pre-filled Part V form beside a PDF
   preview; fix, choose initial status, Save. Files with no text layer flagged "scanned — enter
   manually".
4. **AWP Register** (admin / Director) — all scientists × year with status; who is overdue.
5. **Committee view** — `EvaluateReport` and `CommitteeQueue` gain an "Approved AWP" panel for
   the report's reporting year, beside the Section V shortfall table.

PDF: new `AWPPDF.tsx` with `@react-pdf/renderer` (already used by `ReportPDF`), laid out as
Part V incl. the HoD sign-off and Director block.

## 7. PDF extraction (typed PDFs)

- Library: `pdfjs-dist` (new dependency; runs in browser, no server). Lazy-loaded on the import
  page only.
- Parser `src/lib/pms/awpExtract.ts` (pure function, text → partial AWP): split on the fixed
  Part V headings ("Part A", "Nature of Activity", "Research projects", "Research Objectives",
  "Professional & Personal Development", "Any other Institutional work", "Any other not
  covered"); within the activity table match the 7 known activity labels and pick role + a
  number as time %; Employee ID / Name from Part A.
- Returns a confidence flag per section; empty/low sections highlighted for the reviewer.
- Unit-tested against text fixtures (a few real AWPs, anonymised, as `.txt`).

### 7a. Findings from the real sample (Samarth Singh, AWP-2026-27.pdf, 5 pp.)

- **No text layer.** The form was typed, printed, signed and scanned — every page is one image.
  Text extraction alone returns nothing; OCR is required. "Typed" ≠ "has text".
- Lab template (CSIR-AMPRI letterhead) follows Part V but **adds rows**: activity table has
  "Industry Projects" and "Projects Submission" besides the 7 notification rows (9 rows, total
  100 %); Section (1) has an "Any other" project row; Section (2)(f) reads "Reports for Govt. /
  Pvt. / strategic establishments / Annual Report"; Section (3) has "(d) Any other". ⇒ activity
  rows = the 7 fixed labels **plus free extra rows**; objectives/development keep a free "other".
- Part A carries Reporting Officer *and* Reviewing Officer by name, and previous-PMS date.
- Sign-off state on the sample: scientist signed 18-08-2026; HoD/RO endorsed "Appears
  reasonable" 18-08-2026; **Director block blank**. ⇒ import must also allow initial status
  `WITH_DIRECTOR` with the RO verdict and date recorded from the paper.

## 8. Constraints

Repo rules apply: RLS on every new table; SECURITY DEFINER with authz block; pages use context,
not Supabase directly; semantic Tailwind tokens; new migration file only; `npm run build`,
`npm test`, `npm run lint`, `scripts/check_security_definer.py` must pass.

## 9. Calls made by Claude (please check)

1. AWP is a separate entity keyed on staff ID + reporting year, not part of the report.
2. Reporting Officer = `staff."ReportingID"`, fallback division HoD.
3. Reviewing Officer defaults to the Director; admin can override per AWP.
4. Typed PDFs only; scanned ones get manual entry beside the PDF.
5. Imported AWPs: admin picks APPROVED, WITH_DIRECTOR (HoD already endorsed on paper) or
   WITH_RO at save.
6. Blank-forwarding (R9) is a manual admin button, not automatic.
7. Confidential projects: a "confidential" tick per project row that hides its text from
   committee view; anything more is the lab's call later.
8. The old in-report AWP step is replaced by a link; old table not dropped yet.
