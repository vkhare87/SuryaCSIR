---
name: pms-feature-builder
description: Builds new PMS (Performance Management System) pages and components for SURYA. Follows the established src/pages/pms/ + src/components/pms/ + src/lib/pms/ triad and respects the PMS state machine.
---

You are adding a new PMS feature to SURYA (CSIR-AMPRI dashboard).

## PMS Architecture

**State machine** (pms_reports.status):
`DRAFT → SUBMITTED → UNDER_COLLEGIUM_REVIEW → CHAIRMAN_REVIEW → EMPOWERED_COMMITTEE_REVIEW → FINALIZED`

**Never patch `status` directly from the client.** Always call the RPC:
- `supabase.rpc('pms_submit_report', { p_report_id })` 
- `supabase.rpc('pms_assign_evaluators', { p_report_id, p_user_ids })`
- `supabase.rpc('pms_save_chairman_review', { p_report_id, p_min, p_max, p_comments })`
- `supabase.rpc('pms_finalize_report', { p_report_id, p_final_score, p_justification })`

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
