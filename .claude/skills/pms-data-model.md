---
name: pms-data-model
description: PMS domain knowledge — state machine, tables, RPC contracts, role access rules. Read before building any PMS feature.
---

## PMS State Machine

```
DRAFT
  │  pms_submit_report(report_id)
  ▼
SUBMITTED
  │  pms_assign_evaluators(report_id, user_ids[])
  ▼
UNDER_COLLEGIUM_REVIEW
  │  (auto-trigger: all evaluations COMPLETED)
  ▼
CHAIRMAN_REVIEW
  │  pms_save_chairman_review(report_id, min, max, comments?)
  ▼
EMPOWERED_COMMITTEE_REVIEW
  │  pms_finalize_report(report_id, final_score, justification)
  ▼
FINALIZED
```

All transitions are server-side SECURITY DEFINER RPCs. Never `UPDATE pms_reports SET status = ...` from the client.

## Table Quick Reference

| Table | Key columns | Who can read | Who can write |
|-------|-------------|-------------|---------------|
| `appraisal_cycles` | id, name, start/end_date, status (OPEN/CLOSED/ARCHIVED) | All authenticated | pms_is_admin() |
| `pms_reports` | id, cycle_id, scientist_id, status, period_from/to, self_score, submitted_at | Owner, admins, evaluators, collegium members | Owner (DRAFT) via RPC |
| `pms_report_sections` | id, report_id, section_key, data(jsonb) | Same as parent report | Owner (DRAFT only) |
| `pms_annexures` | id, report_id, file_name, file_path, file_size, mime_type | Owner, admins | Owner (DRAFT only) |
| `pms_collegiums` | id, name, description, cycle_id | All authenticated | Admins |
| `pms_collegium_members` | id, collegium_id, user_id, role (CHAIRMAN/MEMBER) | All authenticated | Admins |
| `pms_evaluations` | id, report_id, evaluator_id, status (PENDING/IN_PROGRESS/COMPLETED), scores(jsonb) | Evaluator + admins | Evaluator (own) |
| `pms_chairman_reviews` | id, report_id, chairman_id, recommended_min/max, comments | Chairman + admins | Via RPC |
| `pms_committee_decisions` | id, report_id, decided_by, final_score, justification (≥50 chars) | Decider + admins | Via RPC |
| `pms_audit_logs` | id, user_id, action, entity_type, entity_id, details(jsonb) | Admins only | RPCs only (auto) |
| `pms_notifications` | id, user_id, type, title, body, report_id, read | Owner + admins | RPCs only (auto) |

## Role Access

| Role | Access |
|------|--------|
| Scientist | Own reports (DRAFT→SUBMITTED) |
| DivisionHead / HOD | Read own division reports |
| HRAdmin / SystemAdmin / MasterAdmin | Full admin: all reports, cycles, audit |
| EmpoweredCommittee | Committee queue (EMPOWERED_COMMITTEE_REVIEW) |
| CHAIRMAN (collegium role) | Chairman queue (CHAIRMAN_REVIEW) |
| MEMBER (collegium role) | Evaluator queue (UNDER_COLLEGIUM_REVIEW) |

## Section Keys (from src/lib/pms/constants.ts)

Read `src/lib/pms/constants.ts` for the canonical list. Each section maps to a JSONB payload in `pms_report_sections.data`.

## Self-Score Range

`self_score` and `final_score`: numeric `[0.5, 1.1]` (APAR scoring scale). Validate before submission.

## Notifications

Auto-sent by RPCs:
- `assigned_evaluator` → evaluator on `pms_assign_evaluators`
- `chairman_review_needed` → CHAIRMANs on all-evaluations-complete
- `committee_review_needed` → EmpoweredCommittee on `pms_save_chairman_review`
- `report_finalized` → scientist on `pms_finalize_report`

Read via `pms_notifications` table (user_id = auth.uid()). Mark read with UPDATE.
