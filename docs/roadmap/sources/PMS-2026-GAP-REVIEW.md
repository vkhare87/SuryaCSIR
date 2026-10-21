# PMS 2026 Guidelines — Gap Review (2026-10-21)

Source: *CSIR Performance Mapping of Scientists (PMS) Guidelines, 2026* (32 pp.), checked against
`supabase/migrations/20260712000004_pms.sql`, `20260726000001_pms_senior_track.sql`,
`src/lib/pms/*`, `src/pages/pms/*`, `src/components/pms/*`, `src/contexts/PMSContext.tsx`.
PMS unit tests: 8 files, 77 tests, all pass (they test logic, not the gaps below).

Legend: ✅ done · ⚠️ partly · ❌ missing · 🐞 bug (breaks a rule today)

## P0 — bugs that block a real lab run

| # | Rule | Problem | Where |
|---|---|---|---|
| 1 🐞 | §6 PMS must be communicated to the scientist | RLS `committee_decisions_select` allows only `decided_by` or admin. Scientist cannot read own final score or grade. Grievance members cannot read it either. | `20260712000004_pms.sql:865` |
| 2 🐞 | Part II annexures go to Evaluation Committee | RLS `annexures_select` allows only owner or admin. Evaluators and Empowered Committee see an empty annexure list. | `20260712000004_pms.sql:826` |
| 3 🐞 | Final report is a permanent record | Finalized PDF is built in the finalizer's browser, non-fatal (`fileFinalized.ts`). If it fails, no record exists. It lands in the `annexures` bucket under `<report_id>/`, so the scientist's own storage delete policy can remove it. | `src/lib/pms/fileFinalized.ts`, storage policy `pms_annexures_delete` |
| 4 🐞 | §5.B.I.iv Director may condone late submission | `pms_submit_report` hard-blocks after May 15. No condonation path. Only option is the non-submission certificate. | `pms_submit_report` |

## P1 — proforma content (Annexure-A) for the STANDARD track (Sci B–F)

| Part | Rule | Status |
|---|---|---|
| Part I | Basic info pre-filled by Establishment by 1 April, scientist reports discrepancy, Establishment verifies | ❌ no pre-fill, no discrepancy note, no "Verified by Sr.CoA/CoA/AO" step |
| Part I | Fields: immovable property return, previous PMS on time, education, employment, leave record, status (PL/member), part/full year, committee members | ⚠️ only "previous PMS on time" exists for standard track. Education/employment/leave/IPR exist only on senior track (`annexureSpecs.ts`) |
| Part II | Questionnaire A — 2 questions, all scientists (sector-wise goods; knowledge portfolio) | ❌ missing on standard track |
| Part II | Questionnaire B — 3 questions, Pay Level 13+ (Sci E, F) only | ❌ missing |
| Appendix-A | Sections I–V of the 2026 format (I.1–I.5, II.1–II.4, III.1–III.11, IV.1–IV.10, V shortfall) | ⚠️ wizard uses an older layout (`section_v_curriculum`, `section_vi_national` …). Word limits (150/100/300) not enforced everywhere |
| Part III | Pen picture: 15 behaviour items, 4-point scale, no marks | ❌ standard track has none (`EvaluateReport.tsx:99` — senior only) |
| Part III | Integrity (Appendix-B), adverse remarks Yes/No, critical assessment | ❌ missing |
| Part III | One whole-number score 0–100 on Questionnaire A/B | ⚠️ score = average of 12 old "dimensions" (`EVALUATION_DIMENSIONS`), override allowed. Not the 2026 method |
| Part III | Reasons if ≥ 90; reasons + suggestions if ≤ 75 | ✅ UI and RPC |
| Part III | Committee signs as one panel (RO/RvO, member, chair) | ⚠️ each member files a separate evaluation; no single panel score |
| Part IV | Concur / upgrade to / downgrade to, with reasons; general comments; critical assessment | ⚠️ only final score + justification. No concur/up/down record vs EC score |
| Part IV | Reasons if ≥ 90 | ✅ |
| Part V | AWP: Part B activity/role/time % | ✅ |
| Part V | AWP sections (1)–(5): projects, objectives, development, other work | ❌ |
| Part V | RO/HoD review "reasonable / not reasonable" + reasons, Director approval, communicated to scientist | ❌ no review or approval flow |
| Part V | AWP revision within first 6 months, with reasons | ❌ |
| Part V | Blank AWP forwarded to RO if scientist does not submit | ❌ |

## P1 — committees

| Rule | Status |
|---|---|
| EC tiers I (B/C/D), II (E), III (F); odd size; RO + RvO + Empowered member | ✅ `pms_committee_panel_valid` |
| Report goes to the committee of the scientist's grade | ❌ `pms_assign_evaluators` accepts any committee |
| Empowered: 3/5/7 members + Director as Chairman, odd total | ⚠️ counts checked; Chairman = Director not checked; "odd total incl. chair" (3+1 = 4) contradicts the rule |
| Quorum (EC half; Empowered chair + half) | ❌ not recorded |
| Sister-lab member, replacement on demit | ⚠️ possible only if that person has a SURYA login |
| Grievance Redressal Committee, 5 members | ✅ |

## P1 — timeline (Annexure-B)

| # | Activity | Due | Status |
|---|---|---|---|
| 1 | Distribute PMS | 1 Apr | ❌ no distribution step or notice |
| 2 | Self-appraisal + AWP | 15 May | ✅ enforced (no condonation — P0 #4) |
| 3 | Evaluation Committee | 30 Jun | ⚠️ shown on screen, not tracked as overdue |
| 4 | Empowered Committee | 31 Jul | ⚠️ same |
| 5 | Communicate PMS | ≤ 15 days after #4 | ⚠️ finalize sets `score_communicated_at`, but scientist cannot read score (P0 #1) |
| 6 | Accept or represent | 15 days | ⚠️ representation window ✅; "deemed accepted" after 15 days not recorded |
| 7 | Dispose representation | 1 month from receipt | ❌ not tracked |
| 8 | Communicate decision | 15 Nov | ❌ not tracked |
| 9 | Close, take on record | 30 Nov | ✅ absolute lock trigger |
| — | Delay report to DG if late | — | ❌ |
| — | <90 duty days → not assessed | — | ✅ |
| — | Non-submission certificate to EC | — | ✅ |

## P1 — grievance

| Rule | Status |
|---|---|
| Representation within 15 days | ✅ |
| EC / Empowered may change remarks, or add observations on the representation | ❌ only GRC resolves; no EC/Empowered comment slot |
| Mala-fide finding | ❌ |
| Decision final; no second representation | ✅ (one row per report) |

## Uploads — draft and final report

| Need | Status |
|---|---|
| Scientist uploads annexures (PDF/Word/JPG/PNG) and signature while DRAFT | ✅ |
| File size limit | ❌ none |
| Committee can open the annexures | 🐞 P0 #2 |
| Separate slot for draft report vs signed final report | ❌ only one "Annexures" list |
| Committee uploads signed Part III / Part IV sheets | ❌ |
| Final report PDF kept safely | 🐞 P0 #3 |

## P2 — nice to have
- Lab-average normalization of scores (guideline "recommended").
- Deputation: take borrowing organization's APAR on record.
- Confidential / national-security project handling (lab decides).
