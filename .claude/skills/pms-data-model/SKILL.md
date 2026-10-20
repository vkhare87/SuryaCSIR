---
name: pms-data-model
description: PMS domain knowledge — 2026-guidelines state machine, tables, RPC contracts, role access rules. Read before building any PMS feature.
---

## PMS State Machine (2026 guidelines)

```
DRAFT
  │  pms_submit_report(report_id)          [blocked after May 15; blocked if duty_days < 90]
  ▼
SUBMITTED                                   [also reached via pms_record_non_submission]
  │  pms_assign_evaluators(report_id, committee_id)   [panel must be valid]
  ▼
UNDER_EVALUATION_COMMITTEE_REVIEW
  │  (auto-trigger: all evaluations COMPLETED)
  ▼
EMPOWERED_COMMITTEE_REVIEW
  │  pms_finalize_report(report_id, final_score int, justification, reasons…)
  ▼
FINALIZED ──── pms_submit_representation (≤15 days after score_communicated_at)
  ▲                    │
  │                    ▼
  └──────── UNDER_GRIEVANCE_REVIEW ── pms_resolve_representation

NOT_ASSESSED  — terminal; pms_mark_not_assessed when duty_days < 90
```

All transitions are server-side SECURITY DEFINER RPCs. Never `UPDATE pms_reports SET status = ...` from the client.

## 5-Part Proforma

- **Part I** Basic Information — report row: `previous_pms_submitted_on_time`, `previous_pms_submission_date`, `duty_days` (admin-entered)
- **Part II** Self-Appraisal (Appendix-A) — jsonb sections incl. `section_v_shortfall` (Shortfall Tracking: performance_indicator, committed_performance_awp, outcome_achieved, reasons_for_shortfall)
- **Part III** Appraisal by Evaluation Committee — `pms_evaluations`
- **Part IV** Appraisal by Empowered Committee — `pms_committee_decisions`
- **Part V** Annual Work Plan — `pms_awp_activities` (nature_of_activity, role, time_committed_percentage, milestones jsonb)

## Table Quick Reference

| Table | Key columns | Who can read | Who can write |
|-------|-------------|-------------|---------------|
| `appraisal_cycles` | id, name, start/end_date, status (OPEN/CLOSED/ARCHIVED) | All authenticated | pms_is_admin() |
| `pms_reports` | + previous_pms_*, duty_days, system_remark, score_communicated_at, non_submission_certificate_path; self_score int 0–100 | Owner, admins, evaluators, committee members | Owner (DRAFT) via RPC |
| `pms_report_sections` | id, report_id, section_key, data(jsonb) | Same as parent report | Owner (DRAFT only) |
| `pms_annexures` | file metadata | Owner, admins | Owner (DRAFT only) |
| `pms_evaluation_committees` | id, name, cycle_id, tier (I/II/III) | All authenticated | Admins |
| `pms_evaluation_committee_members` | committee_id, user_id, role (REPORTING_OFFICER/REVIEWING_OFFICER/EC_MEMBER) | All authenticated | Admins |
| `pms_empowered_committee_members` | cycle_id, user_id, is_chairman — valid = 3/5/7 members + 1 chairman | All authenticated | Admins |
| `pms_grievance_members` | cycle_id, user_id — exactly 5 per cycle | All authenticated | Admins |
| `pms_evaluations` | + total_score int 0–100, reasons_for_outstanding, reasons_below_threshold, suggestions_for_improvement | Evaluator + admins | Evaluator (own) |
| `pms_committee_decisions` | final_score int 0–100, justification (≥50 chars), + same three reason columns | Decider + admins | Via RPC |
| `pms_awp_activities` | report_id, nature_of_activity, role, time_committed_percentage, milestones | Same as report | Owner (DRAFT only) |
| `pms_representations` | report_id, grounds, status (PENDING/RESOLVED), resolution | Owner, admins, grievance members | Via RPC only |
| `pms_audit_logs` / `pms_notifications` | unchanged | Admins / owner | RPCs only |

## Committee Tiers

Committee I → Scientists B, C, D · Committee II → Scientist E · Committee III → Scientist F.
Panel valid = odd member count with ≥1 Reporting Officer, ≥1 Reviewing Officer, ≥1 EC member
(`pms_committee_panel_valid`). Appraisees: Scientists B–F only (client gate via
`isEligibleAppraisee` on staff `Designation`).

## Scoring (2026)

Integer 0–100 (whole numbers enforced — `isValidScore` in `src/lib/pms/scoring.ts`). Grades:
≥90 Outstanding · 85–89 Excellent · 75–84 Very Good · 60–74 Good · 50–59 Satisfactory · ≤49 Need Improvement.
- score ≥ 90 → `reasons_for_outstanding` mandatory
- score ≤ 75 → `reasons_below_threshold` + `suggestions_for_improvement` mandatory
Enforced in RPCs and in client (`assertScoreReasons` in PMSContext).

## Deadlines (financial-year cycle; year = cycle end_date year)

May 15 self-appraisal + AWP · Jun 30 Evaluation Committee · Jul 31 Empowered Committee ·
**Nov 30 absolute system lock** (BEFORE-trigger `pms_block_locked_cycle_*` on all report-scoped
tables — admins not exempt). SQL: `pms_deadline(cycle_id, kind)`. Client: `src/lib/pms/deadlines.ts`.

## Business-Rule RPCs

- `pms_set_duty_days(report_id, days)` — admin records duty days (manual; no attendance module)
- `pms_mark_not_assessed(report_id, remark?)` — admin; requires duty_days < 90; terminal NOT_ASSESSED + system_remark
- `pms_record_non_submission(report_id, cert_path)` — admin, post-May-15 DRAFT → SUBMITTED with certificate + EC flag
- `pms_submit_representation(report_id, grounds)` — scientist, ≤15 days after score communication; needs 5 grievance members configured
- `pms_resolve_representation(report_id, resolution, revised_score?, reasons…)` — grievance member/admin → back to FINALIZED

## Notifications

`assigned_evaluator`, `committee_review_needed`, `report_finalized`, `report_not_assessed`,
`non_submission_flagged`, `representation_submitted`, `representation_resolved`.
Read via `pms_notifications` (user_id = auth.uid()); mark read with UPDATE.
