---
name: pms-feature-builder
description: Builds new PMS (Performance Management System) pages and components for SURYA. Follows the established src/pages/pms/ + src/components/pms/ + src/lib/pms/ triad and respects the PMS state machine.
---

You are adding a new PMS feature to SURYA (CSIR-AMPRI dashboard).

## PMS Architecture

**State machine** (pms_reports.status) — 2026 CSIR guidelines:
`DRAFT → SUBMITTED → UNDER_EVALUATION_COMMITTEE_REVIEW → EMPOWERED_COMMITTEE_REVIEW → FINALIZED`,
plus terminal `NOT_ASSESSED` (duty days < 90) and `FINALIZED ⇄ UNDER_GRIEVANCE_REVIEW`.

There is no chairman-review stage and no "collegium" — that was a pre-2026 draft. The
Evaluation Committee (tiers I/II/III) scores; the Empowered Committee finalizes.

**Never patch `status` directly from the client.** Always call the RPC:
- `supabase.rpc('pms_submit_report', { p_report_id })`
- `supabase.rpc('pms_assign_evaluators', { p_report_id, p_committee_id })`
- `supabase.rpc('pms_finalize_report', { p_report_id, p_final_score, p_justification, ... })`
- `supabase.rpc('pms_finalize_senior_report', { p_report_id, p_remarks })` — Annexure-I/II
- `pms_set_duty_days` · `pms_mark_not_assessed` · `pms_record_non_submission`
- `pms_submit_representation` · `pms_resolve_representation`

Full signatures and authorization rules: `docs/engineering/api_spec.md` Part B.2.

**Triad for new features:**
- `src/pages/pms/<Page>.tsx` — route-level page (`export default function`)
- `src/components/pms/<Component>.tsx` — reusable PMS component (`export function`)
- `src/lib/pms/` — pure logic only (no JSX): `constants.ts`, `permissions.ts`, `scoring.ts`, `validation.ts`

**Context**: use `usePMS()` from `src/contexts/PMSContext.tsx` for PMS data. Use `useAuth()` for role checks. Never call Supabase directly from a page — go through context or a dedicated hook.

## Rules

1. Read `src/lib/pms/permissions.ts` before writing any role-check logic — don't duplicate.
2. Read `src/lib/pms/constants.ts` for section keys and status labels.
3. Role gates: use `hasPermission()` from `useAuth()`. PMS roles: Scientist (own report), DivisionHead/HRAdmin/SystemAdmin/MasterAdmin (admin view), EmpoweredCommittee (committee queue).
4. All async DB calls: `try/catch`, show inline error state, log with `console.error`.
5. Computed data: wrap in `useMemo`. No inline object literals passed as props.
6. Style with Tailwind semantic tokens only (`bg-surface`, `text-text-muted`, `border-border`).
7. Register new route in `src/App.tsx` under the PMS `<Route>` block.

## Workflow

1. Read `src/pages/pms/Index.tsx` and one or two existing PMS pages for context.
2. Read `src/lib/pms/permissions.ts` and `constants.ts`.
3. Implement page + components.
4. Add route to `src/App.tsx`.
5. Confirm the feature against the state machine — does it touch the right status transition?
