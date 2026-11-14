# SURYA — bug register & fix work orders

Date: 2026-11-01. Scope: whole codebase read (not a diff review) — `src/` (191 tsx + 110 ts),
`supabase/migrations/` (8-file baseline + 29 later migrations), `scripts/`, `docs/`.

This is a **work-order brief**: hand one work order at a time to an implementation session.
It is not a roadmap of future features and it is not authoritative about how the system
works — `docs/engineering/` owns that. Delete or archive this file when the register is
empty.

Every item below was verified by reading the code at the cited line. Where a claim could be
checked mechanically (counts, greps, `tsc`, the policy linter), the command is given so you
can re-run it.

---

## 1. Baseline — what was run

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc -b` | **Pass** (`npm run build` = `tsc -b && vite build`) |
| Lint (app) | `npx eslint src` | **Pass** — 0 errors, 1057 warnings (all design-token debt) |
| Lint (repo) | `npm run lint` | **Fails on Windows/dev boxes** — walks `ingest/.pytest_cache` → `EPERM`. See `DOC-05`. |
| Policy audit | `python scripts/check_security_definer.py` | **OK** — 75 functions, 16 exempt, none unguarded (but see `SQL-08`) |
| Tests | `npm test` | **Not runnable in the review sandbox** — vite's config loader hits `spawn EPERM`. Run it yourself before starting WO-1. |
| RLS tests | `supabase/tests/*.sql` | Only `rls_awp.sql` is wired into vitest (`scripts/db/awp.db.test.ts`); the rest run only in the CI `db` job |

⚠️ **`supabase/tests/rls_negative.sql` is the suite that would have caught `BUG-01`.**

---

## 2. Rules these fixes must not break

Read `CLAUDE.md` and `supabase/CLAUDE.md` first. The five that will actually bite:

1. **Never edit a shipped migration.** Every SQL fix is a *new* timestamped file. The newest
   is `20261101000001_contribution_requests.sql`, so start at `20261102000001_…`.
2. **Every new `SECURITY DEFINER` function opens with an authorization block**
   (`scripts/check_security_definer.py` fails CI otherwise) **and pins `SET search_path`**.
3. **Client-supplied actor ids must be asserted equal to `auth.uid()::text`.** Never trust
   `p_actor_id`.
4. **Never patch `pms_reports.status` from the client.** After WO-1 the database will
   enforce this; do not "fix" a broken flow by re-granting the column.
5. **RLS is the only hard gate.** Do not add a second authorization path in the client, and
   do not treat a hidden button as a fix.

The discriminator used throughout WO-1/WO-2 is `current_user IN ('authenticated','anon')`:
direct PostgREST writes run as `authenticated`, while `SECURITY DEFINER` RPCs run as the
function owner (`postgres`). **This is the one thing to prove with a test before shipping** —
if a legitimate RPC starts raising, the discriminator or the trigger placement is wrong.
`session_user` and `auth.role()` both fail to distinguish the two cases.

---

## 3. Bug register

Severity: **P0** integrity/security of the institute record · **P1** visible wrong behaviour
or security hardening · **P2** correctness debt users hit occasionally · **P3** hygiene.

| ID | Sev | Area | Defect | Evidence |
|---|---|---|---|---|
| BUG-01 | **P0** | PMS / RLS | Scientist can set their own report to `FINALIZED` (or `NOT_ASSESSED`, `duty_days`, `self_score`) with a plain `UPDATE`/`INSERT` — the whole EC → Empowered → scoring chain is bypassable from the browser | `20260712000004_pms.sql:787-795` |
| BUG-02 | **P0** | PMS / RLS | `pms_evaluations` `UPDATE` has no `WITH CHECK`: an evaluator can re-point their row at any `report_id` and set `COMPLETED`, firing the auto-advance trigger onto an arbitrary report | `20260712000004_pms.sql:862-863`, trigger `:333-337` |
| BUG-03 | **P1** | PMS / RLS | `pms_finalize_report` accepts the global `EmpoweredCommittee` role (cycle-agnostic), and skips the 3/5/7-plus-Chairman validity check when a cycle has no members configured. Same global branch opens every report's scores in `reports_select` | `20260712000004_pms.sql:496-505`; `20261021000001_pms_p0_fixes.sql:25` |
| BUG-04 | **P1** | PMS / lock | A report finalized on/after **16 Nov** cannot be appealed or resolved: the Nov 30 lock blocks `FINALIZED ⇄ UNDER_GRIEVANCE_REVIEW`, so the 15-day representation window is unusable exactly when it matters | impl. of `20260712000004_pms.sql:340-394` vs `:653-690` |
| BUG-05 | **P1** | PMS / time | Three clocks for one deadline: server lock uses UTC (`now()::date`), AWP RPCs use IST, client builds local-time deadlines. On 1 Dec 00:00–05:29 IST the UI says locked while the DB says open | `20260712000004_pms.sql:275-278`; `20261021000002_pms_awp.sql:259,586`; `src/lib/pms/deadlines.ts:17-18` |
| BUG-06 | **P1** | Helpdesk | Token generation races (`SELECT MAX+1` then `INSERT`, no lock) and the `(\d{3})` capture re-issues `-1000` forever; status/assign RPCs read without `FOR UPDATE`, so two handlers both pass the transition gate and one transition vanishes from the audit trail | `20260725000004_ticket_actor_uuid.sql:201-205,228-232,243-246,305-306` |
| BUG-07 | **P1** | DB hardening | 18 `SECURITY DEFINER` functions have no pinned `search_path`, including `admin_set_user_roles`, `approve_access_request`, `reject_access_request` and most of `pms_*` | `20260712000002_auth_rbac.sql:192,226,249,68`; `20260712000004_pms.sql:224-253,285,435,480,552,577,616,653,692,925` |
| BUG-08 | **P1** | Notifications | `notifications_sweep` tells scientists the deadline is `end_date` (31 Mar) when `pms_submit_report` actually accepts until 15 May, and fires ~59 days early | `20261020000001_notifications.sql:117-127` |
| BUG-09 | **P1** | Recruitment / FE | The UI renders columns that do not exist: `designation`, `division`, `numberOfPositions`, `salary`, `applicationDeadline` (vs `title, division_code, closing_date, …`), and treats `vacancy_posts` (post *definitions*) as candidate applications. Every pipeline/funnel number is 0 and the search box matches only the title | `src/utils/dataMapper.ts:202-229`; `20260712000003_hr_core.sql:204-236`; `src/pages/Recruitment.tsx:55-89` |
| BUG-10 | **P1** | Upload / RLS | Non-admin owners can no longer attach a project-report PDF: the page uploads `accessTier: 'division'` and `documents_insert` allows non-admins only `owner`/`confidential`, so the registry returns `{ok:false}` and the UI says nothing | `src/pages/reports/ProjectReportDetail.tsx:67`; `20260725000001_security_hardening.sql:139-148` |
| BUG-11 | **P1** | Data loading | Six call sites bypass `fetchAll`, so they silently truncate at the PostgREST 1000-row cap — including all `pms_reports`, `pms_evaluations` and `notifications`, plus a second copy of the whole `staff` table | `src/contexts/PMSContext.tsx:172-182`; `AWPContext:79-81`; `ProposalsContext:47`; `ProjectReportsContext:84-87`; `src/pages/IrinsSync.tsx:56-59`; `DataContext:363-387` |
| BUG-12 | **P1** | Data loading | `DataContext` loads all 28 tables **twice** on every page load: the effect fires on mount with `role: null`, before auth resolves, then again when `role` lands. 56 requests, plus an empty-data flash | `src/contexts/DataContext.tsx:357-359` |
| BUG-13 | **P2** | Divisions | Selection state seeds from an empty `divisions` array → the sidebar row is **never** highlighted and `?div=` deep links never work on a hard refresh | `src/pages/Divisions.tsx:38-40,52,254` |
| BUG-14 | **P2** | Analytics | `Date.parse` on `DOJ` returns `NaN` for the `22.12.1997` form the HR sheets use → the tenure histogram silently drops those staff | `src/pages/StaffAnalytics.tsx:20-21,138` |
| BUG-15 | **P2** | Calendar | `EVENT_COLOR[kind].replace('bg-','border-')` produces classes Tailwind never emits → the accent bar is invisible for 7 of 9 kinds; and month changes don't clamp `selectedDay`, so 31 Jan → February renders "February 31" | `src/pages/Calendar.tsx:382,101-103,166-167,404` |
| BUG-16 | **P2** | Loading states | Permanent spinner when Supabase is absent or any request rejects (`if (!supabase) return` before `setLoading(false)`; no `try/finally`) | `src/pages/IrinsSync.tsx:53-65`; `dashboards/MasterAdminView.tsx:90-118`; `AccessRequests.tsx:21-32` |
| BUG-17 | **P2** | DataTable | Page index resets on result **length** instead of filter identity → changing a filter to a same-size result set on page 3 shows an empty slice. Affects every list page | `src/components/ui/DataTable.tsx:136` |
| BUG-18 | **P2** | PMS perf | `getReport` is a plain function in the provider body (unlike the `useCallback` versions elsewhere) → new identity each render → `EvaluateReport` refetches the whole report on every provider update | `src/contexts/PMSContext.tsx:340`; `src/pages/pms/EvaluateReport.tsx:50-64` |
| BUG-19 | **P2** | Audit log | `'all'` mode pages each source independently then slices the merged union → union rows 26-50 are unreachable | `src/pages/pms/AuditLog.tsx:48-68` |
| BUG-20 | **P2** | Intelligence | KPI hardcoded `value="6.8"` for "Avg Impact Factor" (the real average is computed in `MasterAdminView`), and "Sorted by Latest" doesn't sort | `src/pages/Intelligence.tsx:300-301,346-350` |
| BUG-21 | **P2** | A11y | `useDialog` has no focus trap (self-documented), so Tab escapes behind every modal; `Card`'s `onClick` is a bare `div` (grid cards unreachable by keyboard); `Badge` uses light-only hex → light chips in dark mode | `src/utils/useDialog.ts:7,14-24`; `src/components/ui/Cards.tsx:18-31,76-82` |
| BUG-22 | **P2** | A11y | `htmlFor` appears **0 times** in `src/pages`; `aria-live`/`role="alert"` appear **0 times in all of `src/`**. Login errors, the 12 appraisal score inputs, ticket forms and streamed Ask answers are all silent to assistive tech | grep |
| BUG-23 | **P2** | Login | Ticker's inner `setTimeout` never cleared on unmount; the auto-advancing slide deck has no keyboard-reachable pause; two `setInterval`s run regardless of `prefers-reduced-motion` | `src/pages/Login.tsx:113-129` |
| BUG-24 | **P2** | Theme | The **Data Density** control is dead: `setDensity` writes localStorage, nothing ever applies `.density-*` or `data-density` | `src/contexts/ThemeContext.tsx:29-32`; zero refs outside `src/index.css:117-125,217-222` |
| BUG-25 | **P3** | Perf | 8 of 10 context providers pass an inline object as `value`, defeating memoisation for every consumer | `AuthContext:223`, `DataContext:390`, `PMSContext:719`, `AWPContext:180`, `ProposalsContext:170`, `ProjectReportsContext:150`, `ThemeContext:35`, `UIContext:47` |
| BUG-26 | **P3** | Lint / design | The token ratchet only inspects literal `className` attributes: raw palette inside object maps and ternaries is invisible — **41 instances in 8 files**, several not even in the allowlist. `scripts/update-design-debt.mjs` is never run in CI, so the allowlist cannot shrink | `eslint.config.js:13-26,91-107`; `src/lib/pms/constants.ts`, `src/lib/helpdesk/constants.ts`, `src/lib/calendar/types.ts`, `src/utils/dateUtils.ts`, `EvaluatorQueue.tsx:10-12`, `KpiTile.tsx:42` |
| BUG-27 | **P3** | Lint | `eslint .` walks Python trees (`ingest/`, `rag/`) instead of ignoring them | `eslint.config.js:30` |
| BUG-28 | **P3** | Tests | `access.test.ts` checks `ACCESS_MAP → App.tsx` but not the reverse: a typo'd `accessPath=` locks that page for **everyone including MasterAdmin**, undetected | `src/constants/access.test.ts:12-24`; `src/lib/access/featureControls.ts:42-56` |
| BUG-29 | **P3** | Docs | `CLAUDE.md` says nav lives in `Layout.tsx` `NAV_ITEMS` (it's `Sidebar.tsx` `NAV_SECTIONS`), says entities need `src/utils/mockData.ts` (doesn't exist), says "no global error boundary exists" (it does), and its test counts are stale | `CLAUDE.md` |
| BUG-30 | **P3** | Docs | `docs/ARCHITECTURE-REMEDIATION.md` is cited by 3 files; the file actually lives at `docs/history/ARCHITECTURE-REMEDIATION.md`, so every citation is a dead path; `supabase/CLAUDE.md` cites `20260726000002_baseline_grants.sql` (file is `…0004…`); three migration headers name the wrong version of themselves | `eslint.design-debt.json:2`; `scripts/update-design-debt.mjs:96`; `src/lib/data/fetchAll.ts:16` |
| BUG-31 | **P3** | Design | `.heading` hardcodes `Georgia` instead of the `--font-serif` token (Fraunces) that `DESIGN.md` mandates | `src/index.css:212-216` |
| BUG-32 | **P3** | DB integrity | Missing FKs (`ProjectNo` join key used by 6 objects, `division_code` on outputs/IP/MoUs, committee/staff references) and missing indexes on RLS predicates and `.order()` columns; `appraisal_cycles` has no single-`OPEN` guard and no date check; `pms_resolve_representation` can silently change nothing | see WO-6 |
| BUG-33 | **P3** | DB grants | `GRANT ALL` includes `TRUNCATE` (not filtered by RLS); default table privileges are repaired `FOR ROLE postgres` only, while the function case was fixed for `['postgres', current_user]` | `20260726000004_baseline_grants.sql:40-48`; `20260726000005_relock_rpc_execute.sql:36-47` |
| BUG-34 | **P3** | Linter | `check_security_definer.py` only looks for a marker *string* anywhere in the body — `auth.uid() IS NOT NULL` or a comment mentioning `pms_is_admin` satisfies it — and has no `search_path` rule (which is why BUG-07 shipped) | `scripts/check_security_definer.py:33-46,143-148` |

---

## 4. Work orders

Order within a work order is the order to do it. `Verify` is the acceptance check; a work
order is not done until every box passes.

---

### WO-1 — Close the client-writable PMS state machine (BUG-01, BUG-02) · P0 · S

**File:** `supabase/migrations/20261102000001_pms_client_write_guard.sql`

```sql
-- ============================================================
-- Client sessions may not write PMS workflow state.
-- BUG-01: reports_insert/reports_update pinned only scientist_id, so the owner
--         could set status='FINALIZED' (or duty_days, self_score, …) directly.
-- BUG-02: evaluations_update had no WITH CHECK, so an evaluator could re-point
--         their row at any report and drive pms_check_evaluation_complete.
-- Discriminator: current_user. Direct PostgREST writes run as 'authenticated';
-- SECURITY DEFINER RPCs run as the function owner. Do not use auth.uid() — it is
-- still the caller inside a definer function and would block pms_submit_report.
-- ============================================================
BEGIN;

-- 1. The owner may only ever hold a DRAFT row.
DROP POLICY IF EXISTS "reports_insert" ON public.pms_reports;
CREATE POLICY "reports_insert" ON public.pms_reports
    FOR INSERT TO authenticated
    WITH CHECK (
        scientist_id = (SELECT auth.uid())
        AND status = 'DRAFT'
        AND EXISTS (SELECT 1 FROM public.appraisal_cycles c
                     WHERE c.id = cycle_id AND c.status = 'OPEN')
    );

DROP POLICY IF EXISTS "reports_update" ON public.pms_reports;
CREATE POLICY "reports_update" ON public.pms_reports
    FOR UPDATE TO authenticated
    USING      (scientist_id = (SELECT auth.uid()) AND status = 'DRAFT')
    WITH CHECK (scientist_id = (SELECT auth.uid()) AND status = 'DRAFT');

-- 2. Workflow columns change only through the RPCs.
CREATE OR REPLACE FUNCTION public.pms_reports_guard_owner_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') THEN
        IF NEW.status                          IS DISTINCT FROM OLD.status
        OR NEW.scientist_id                    IS DISTINCT FROM OLD.scientist_id
        OR NEW.cycle_id                        IS DISTINCT FROM OLD.cycle_id
        OR NEW.submitted_at                    IS DISTINCT FROM OLD.submitted_at
        OR NEW.duty_days                       IS DISTINCT FROM OLD.duty_days
        OR NEW.system_remark                   IS DISTINCT FROM OLD.system_remark
        OR NEW.score_communicated_at           IS DISTINCT FROM OLD.score_communicated_at
        OR NEW.non_submission_certificate_path IS DISTINCT FROM OLD.non_submission_certificate_path
        THEN
            RAISE EXCEPTION
                'status, scores, duty days and cycle are written only by the PMS workflow RPCs'
                USING HINT = 'Use pms_submit_report / pms_finalize_report / pms_mark_not_assessed / pms_set_duty_days.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pms_reports_owner_columns ON public.pms_reports;
CREATE TRIGGER trg_pms_reports_owner_columns
    BEFORE UPDATE ON public.pms_reports
    FOR EACH ROW EXECUTE FUNCTION public.pms_reports_guard_owner_columns();

-- 3. An evaluation belongs to one report and one evaluator, forever.
DROP POLICY IF EXISTS "evaluations_update" ON public.pms_evaluations;
CREATE POLICY "evaluations_update" ON public.pms_evaluations
    FOR UPDATE TO authenticated
    USING      (evaluator_id = (SELECT auth.uid()))
    WITH CHECK (evaluator_id = (SELECT auth.uid())
                AND status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED'));

CREATE OR REPLACE FUNCTION public.pms_evaluations_guard_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon')
       AND (NEW.report_id IS DISTINCT FROM OLD.report_id
            OR NEW.evaluator_id IS DISTINCT FROM OLD.evaluator_id) THEN
        RAISE EXCEPTION 'An evaluation cannot be moved to another report or evaluator';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pms_evaluations_identity ON public.pms_evaluations;
CREATE TRIGGER trg_pms_evaluations_identity
    BEFORE UPDATE ON public.pms_evaluations
    FOR EACH ROW EXECUTE FUNCTION public.pms_evaluations_guard_identity();

COMMIT;
```

**Then add the regression tests** to `supabase/tests/rls_negative.sql` (this is the whole
point — the suite that would have caught this exists, it just doesn't cover `pms_reports`):

```sql
-- T21: the owner cannot move their own DRAFT report out of DRAFT.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
       json_build_object('sub', :'scientist_uid', 'role', 'authenticated')::text, true);
DO $$
BEGIN
    UPDATE public.pms_reports SET status = 'FINALIZED' WHERE id = :'draft_report_id';
    RAISE EXCEPTION 'FAIL T21: owner finalized their own report';
EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM LIKE 'FAIL T21%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS T21: status write blocked';
END $$;
ROLLBACK;

-- T22: the owner cannot write workflow columns on their own DRAFT.
--   duty_days = 100 must raise.
-- T23: an evaluator cannot re-point an evaluation at another report.
-- T24: pms_submit_report STILL WORKS as the owner (guards the definer path).
```

**Verify**
- [ ] `supabase db reset` applies cleanly.
- [ ] T21–T23 raise; T24 passes (this is the test that proves the `current_user`
      discriminator did not break the RPC path).
- [ ] Full E2E smoke: draft → submit → assign → evaluate → finalize as an admin.
- [ ] `python scripts/check_security_definer.py` still OK.

> Already checked, so you do not have to: the only client-side INSERT into `pms_reports` is
> `PMSContext.createReport` (`src/contexts/PMSContext.tsx:329-333`), which omits `status` and
> relies on the column default `'DRAFT'`. Pinning `status = 'DRAFT'` on insert therefore
> breaks no existing flow.

**Done when:** a scientist's own session cannot change `status`, `duty_days`, `self_score`,
`submitted_at`, `score_communicated_at` or `cycle_id` on any report, and every workflow RPC
still completes.

---

### WO-2 — PMS authorization fallbacks, grievance lock, one clock (BUG-03, BUG-04, BUG-05) · P1 · M

**File:** `supabase/migrations/20261102000003_pms_authorization_and_time.sql`

Three independent changes; ship them together but as three clearly separated blocks.

**2a. Remove the cycle-agnostic `EmpoweredCommittee` branch (BUG-03).**
- `pms_finalize_report` (`20260712000004_pms.sql:480-550`): `CREATE OR REPLACE` it with the
  `OR public.user_has_role('EmpoweredCommittee')` operand deleted from the guard at `:496-499`,
  and make the validity check unconditional — change `:502-503` from
  `IF EXISTS (…members…) AND NOT pms_empowered_committee_valid(…)` to
  `IF NOT pms_empowered_committee_valid(v_report.cycle_id) THEN RAISE …`.
  Consequence to accept deliberately: an unconfigured cycle can no longer be finalized.
- `reports_select` (`20261021000001_pms_p0_fixes.sql:17-27`): `DROP` + `CREATE` without the
  same operand at `:25`, keeping the cycle-scoped `pms_empowered_committee_members` branch.
- While there, drop the `OR public.pms_is_evaluation_committee_member(cycle_id)` operand
  (`:21`): it is cycle-scoped, so a tier-I panel member reads tier-II/III scores. The
  `pms_evaluations` branch on the next line is the precise, intended grant.
- Also rewrite every `auth.uid()` in these two policies as `(SELECT auth.uid())`
  (see WO-6d).

**2b. Make the 15-day representation window usable (BUG-04).**
The window check already lives inside `pms_submit_representation`
(`20260712000004_pms.sql:664-667`), so the lock trigger is the only thing standing in the way.

```sql
-- Reports: allow exactly the two grievance transitions through the Nov 30 lock.
CREATE OR REPLACE FUNCTION public.pms_block_locked_cycle_reports()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v_cycle_id uuid;
BEGIN
    v_cycle_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.cycle_id ELSE NEW.cycle_id END;
    IF pms_cycle_locked(v_cycle_id) THEN
        -- The appeal path is the one legitimate post-lock transition; its 15-day
        -- window and its 5-member committee are enforced by pms_submit_representation
        -- / pms_resolve_representation, not by the calendar.
        IF TG_OP = 'UPDATE'
           AND ((OLD.status = 'FINALIZED'             AND NEW.status = 'UNDER_GRIEVANCE_REVIEW')
             OR (OLD.status = 'UNDER_GRIEVANCE_REVIEW' AND NEW.status = 'FINALIZED')) THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'PMS cycle is locked (system-wide lock after November 30)';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Children: the representation row itself, while its report is in the appeal states.
CREATE OR REPLACE FUNCTION public.pms_block_locked_cycle_children()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v_report_id uuid;
    v_cycle_id  uuid;
    v_status    text;
BEGIN
    v_report_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.report_id ELSE NEW.report_id END;
    SELECT cycle_id, status INTO v_cycle_id, v_status
      FROM pms_reports WHERE id = v_report_id;
    IF v_cycle_id IS NOT NULL AND pms_cycle_locked(v_cycle_id) THEN
        IF TG_TABLE_NAME = 'pms_representations'
           AND v_status IN ('FINALIZED', 'UNDER_GRIEVANCE_REVIEW') THEN
            RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END IF;
        RAISE EXCEPTION 'PMS cycle is locked (system-wide lock after November 30)';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
```

> Scope note: only `pms_representations` and the two status transitions are exempted.
> Annexures, sections, evaluations and AWP activities stay locked — do not widen this.

**2c. One clock (BUG-05).**

```sql
-- The institute's day. One helper, used by every PMS deadline comparison.
CREATE OR REPLACE FUNCTION public.ist_today()
RETURNS date LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$;

CREATE OR REPLACE FUNCTION public.pms_cycle_locked(p_cycle_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT public.ist_today() > pms_deadline(p_cycle_id, 'SYSTEM_LOCK');
$$;
```
Then replace every `now()::date` / `current_date` used for a PMS deadline with
`public.ist_today()`: `20260712000004_pms.sql` (lock + report submission window) and
`20261021000001_pms_p0_fixes.sql:155` (condonation `greatest(...)`).
AWP RPCs already do the equivalent — leave them, or refactor them onto `ist_today()` for
one spelling.

Client side (`src/lib/pms/deadlines.ts:18`): build the day boundary in IST, not the browser's
zone — `new Date(`${iso}T23:59:59.999+05:30`)` — and take `year` from the cycle's end date
string, not `new Date(endDate).getFullYear()`.

**Verify**
- [ ] A report finalized on 20 Nov can be appealed on 25 Nov and resolved on 3 Dec.
- [ ] A report finalized on 1 Nov cannot be appealed on 30 Nov (window closed).
- [ ] `pms_finalize_report` as a global `EmpoweredCommittee` holder with no cycle membership
      raises.
- [ ] Finalizing a cycle with zero configured members raises.
- [ ] 1 Dec 00:00 IST: server rejects writes; 30 Nov 23:59 IST: server accepts.
- [ ] No AWP or evaluation write is allowed after the lock (negative test each).

---

### WO-3 — Helpdesk integrity (BUG-06) · P1 · S

**File:** `supabase/migrations/20261102000004_helpdesk_integrity.sql`

1. **Token race + overflow.** In `helpdesk_create_ticket`
   (`20260725000004_ticket_actor_uuid.sql:201-205,228-232`), before the `MAX`:
   ```sql
   PERFORM pg_advisory_xact_lock(hashtext('ticket_token_' || to_char(current_date, 'YYMMDD')));
   ```
   and widen the capture to `(\d+)` so token 1000 parses and `MAX` keeps climbing. Copy the
   shape from `proposals_set_code` (`20260712000006:125`), which already does this correctly.
2. **Check-then-act.** `SELECT … FOR UPDATE` the ticket row in both
   `helpdesk_update_status:243-246` and `helpdesk_assign_ticket:305-306`.
3. **Concurrency test** in `scripts/db/helpdesk.db.test.ts` (new): two parallel
   `helpdesk_create_ticket` calls produce two distinct tokens; two parallel status updates
   where the second would be invalid produce one success and one exception, and exactly one
   `StatusChanged` audit row.

**Verify:** [ ] both tests fail before the migration and pass after; [ ] the audit trail for
a concurrent double-advance contains exactly one transition.

---

### WO-4 — `SECURITY DEFINER` hardening (BUG-07, BUG-34) · P1 · M

**File:** `supabase/migrations/20261102000005_security_definer_search_path.sql`

`CREATE OR REPLACE` each of the 18 functions listed in BUG-07 with `SET search_path = public`
(add `, extensions` only where `pgcrypto` is called). Bodies are otherwise unchanged — this is
a header change, so diff carefully and change nothing else. Re-derive the list mechanically
rather than trusting this document:

```sql
-- run against a freshly reset DB; any row here needs the header fix
SELECT p.proname, pg_get_function_identity_arguments(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.prosecdef
   AND NOT EXISTS (
       SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
        WHERE c LIKE 'search_path=%');
```

**Then extend `scripts/check_security_definer.py`** so it cannot regress: fail any
`SECURITY DEFINER` header without a `SET search_path`, and tighten the existing check so a
marker must sit inside an `IF NOT … RAISE` guard rather than anywhere in the body (BUG-34).

**Verify:** [ ] the query above returns zero rows; [ ] the linter fails when you deliberately
remove one `SET search_path`; [ ] full PMS + helpdesk E2E still passes.

---

### WO-5 — Correct the self-appraisal reminder (BUG-08) · P1 · S

**File:** `supabase/migrations/20261102000006_notifications_deadline.sql`

`CREATE OR REPLACE FUNCTION public.notifications_sweep()` — replace the `end_date`-based
condition and the printed date in `20261020000001_notifications.sql:117-127`:

```sql
JOIN LATERAL (
    SELECT greatest(
             public.pms_deadline(c.id, 'SELF_APPRAISAL'),
             coalesce((SELECT cd.condoned_until FROM pms_condonations cd
                        WHERE cd.report_id = r.id), '-infinity'::date)
           ) AS due
) d ON true
WHERE r.status = 'DRAFT'
  AND c.status = 'OPEN'
  AND d.due BETWEEN public.ist_today() AND public.ist_today() + 14
```
and print `to_char(d.due, 'DD Mon YYYY')` in the body text.

**Verify:** [ ] with the seeded cycle (`end_date` 2027-03-31) the reminder fires in the
window around 1 May 2027 and names **15 May 2027**; [ ] a condoned report is not nagged;
[ ] no duplicate notification per day (`notifications` should have one row per
`(user_id, type, report_id)` — check the ON CONFLICT clause while you are in there).

---

### WO-6 — Schema integrity (BUG-32, BUG-33, plus the perf halves of BUG-05) · P2 · M

**File:** `supabase/migrations/20261102000007_schema_integrity.sql`

**6a. The join key that nothing protects.** `projects."ProjectNo"` is used as a join key by
`project_staff`, `phd_students`, `proposals.linked_project_no`, `project_reports.project_no`
and the `projects_select` policy — with no uniqueness and no FK. A duplicate silently
duplicates rows in every one of those, including the Director aggregates.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS projects_project_no_key
    ON public.projects ("ProjectNo") WHERE "ProjectNo" IS NOT NULL;
```
Then add the FKs (`ON DELETE SET NULL`, so the wipe scripts keep working).

**6b. The single-`OPEN` cycle invariant is convention only.** `reports_insert` accepts any
`OPEN` cycle, so a second one silently forks the appraisal:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS appraisal_cycles_one_open
    ON public.appraisal_cycles (status) WHERE status = 'OPEN';
ALTER TABLE public.appraisal_cycles
    ADD CONSTRAINT appraisal_cycles_dates CHECK (end_date > start_date);
```
Also add `CHECK (extract(month FROM end_date) = 3)` (or, better, store the four deadlines as
columns on the cycle and drop the `make_date(…, 5, 15)` derivation — that fixes BUG-05 and
BUG-08 at the root). Decide which before writing the migration.

**6c. Indexes on the RLS predicates and the client's `.order()` clauses.** Highest value
first: `project_staff("ProjectNo")` and `staff(lower("Email"))` (both are in policy paths, so
they cost a seq scan per candidate row today), then `pms_evaluations(evaluator_id)`,
`pms_reports(created_at DESC)`, `pms_notifications(user_id, created_at DESC)`,
`tickets(created_at DESC)`, `tickets(assigned_to, status)`, `pms_audit_logs(user_id, created_at DESC)`.

**6d. `auth.uid()` → `(SELECT auth.uid())`** in every policy (3 of ~58 already do this). Pure
text change, no semantics, the cheapest performance win in the schema.

**6e. Grant residues.** `REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public
FROM authenticated;` and mirror the `FOREACH v_role IN ARRAY['postgres', current_user]` pattern
from `20260726000005_relock_rpc_execute.sql:36-47` into the *table* default privileges, or a
table created by the migration login role gets no grant at all and its policies are dead code.

**6f. `pms_resolve_representation` can silently change nothing** (`20260712000004_pms.sql:727-733`):
no `FOR UPDATE` on the representation, no "is it still PENDING" check, and the
`UPDATE pms_committee_decisions` has no `FOUND` check — so a senior-track report (which has no
committee decision row) records a `revised_score` in the audit log that was never applied.
Add both checks and raise.

**Verify:** [ ] `supabase db reset` clean; [ ] `scripts/db/*.test.ts` green; [ ] the seed still
creates exactly one `OPEN` cycle; [ ] duplicating a `ProjectNo` now fails.

---

### WO-7 — Recruitment renders a schema that does not exist (BUG-09) · P1 · M

This one needs a **decision first**: are `vacancy_posts` candidates (as the UI believes) or
post definitions (as the schema says)? The schema is right — a post is not a person.

1. **Stopgap that removes the wrongness today** (`src/utils/dataMapper.ts:202-216`):
   `applicationDeadline: row.closing_date || row.applicationDeadline || ''`,
   `division: row.division_code || row.division || ''`, `numberOfPositions` from the post
   count, and delete `designation`/`salary` from `VacancyAdvertisement` in
   `src/types/index.ts` if nothing else reads them (`grep -rn 'vacancy.*designation' src`).
2. **Then** (needs the decision): add `vacancy_applications` (`id, advertisement_id FK,
   post_id FK, candidate_name, email, phone, experience, applied_on, status, notes`) with the
   `Received|Shortlisted|Interviewed|Selected|Rejected` CHECK the UI already counts, and move
   `mapVacancyPostRow` onto it.
3. `Recruitment.tsx:55-89`: once the mapper is honest, wrap `openVacancies`,
   `activeApplicants`, `pipeline`, `selectedCount` and `filtered` in `useMemo` (they are
   derived over the whole table and currently run on every render).

**Verify:** [ ] a real advertisement shows its closing date and division; [ ] the search box
matches a division code; [ ] the funnel sums to the number of applications, not zero;
[ ] `grep -c "''" ` on the mapper no longer shows the five ghost columns.

---

### WO-8 — Restore project-report uploads (BUG-10) · P1 · XS

`src/pages/reports/ProjectReportDetail.tsx:67` → `accessTier: 'owner'`. Promotion to a shared
tier is an admin action by design (`documents_set_access_tier`). Then make the failure
visible: `src/lib/documents/registry.ts` returns `{ ok: false, error }` — surface it through
`useToast()` at the call site instead of dropping it.

**Verify:** [ ] a non-admin report owner (Scientist/HOD) can upload and see the file;
[ ] the row lands with `access_tier = 'owner'`; [ ] a Guest still cannot upload.

---

### WO-9 — Paging parity and one boot load (BUG-11, BUG-12) · P1 · S

1. Wrap every unbounded `select('*')` in `fetchAll(...)` from `src/lib/data/fetchAll.ts`:
   `PMSContext:172-182` (9 tables — `pms_reports`, `pms_evaluations`, `pms_representations`
   and `pms_notifications` all grow with the institute), `AWPContext:79-81`,
   `ProposalsContext:47`, `ProjectReportsContext:84-87`, `IrinsSync:56-59` (which re-fetches
   the whole `staff` table — prefer `useData().staff`), and
   `DataContext.refreshCalendar/refreshHolidays:363-387`. Each needs a stable `.order()` —
   without one, paging can duplicate and drop rows (the file's own comment says so).
   Skip `feature_controls` / `feature_grants` / `helpdesk_routing`: those are bounded by the
   number of routes or divisions and will never approach the cap.
2. Gate `DataContext.loadData` on `isAuthenticated`: `if (!isAuthenticated) return;` at the
   top and add `isAuthenticated` to the effect's dependencies. Today the 28-table load runs
   once with `role: null` before auth resolves — a wasted round of 28 requests plus a visible
   empty-data flash.
3. `saveEquipment` currently calls `loadData()` (all 28 tables) for one upsert — patch state
   locally instead.

**Verify:** [ ] network tab on a hard reload shows one load round, not two; [ ] a table with
1001+ rows returns all of them (seed one in local dev); [ ] `PostgREST` logs show no unbounded
`select` from the app.

---

### WO-10 — Verified UI bugs (BUG-13 … BUG-20) · P2 · M

Each is small and independent; a single PR is fine.

| ID | File | Change |
|---|---|---|
| BUG-13 | `src/pages/Divisions.tsx:38-40,254` | Drop the eager seed. `const selectedDiv = divisions.find(d => d.divCode === selectedDivCode) ?? divisions[0];` and compare `div.divCode === selectedDiv?.divCode` for the highlight. Deep links then work, because the fallback resolves. |
| BUG-14 | `src/pages/StaffAnalytics.tsx:20-21` | Delete `yearsBetween`; use `getServiceYears(s.DOJ)` from `src/utils/dateUtils.ts:80`. |
| BUG-15 | `src/pages/Calendar.tsx:382`, `src/lib/calendar/types.ts:38` | Add `export const EVENT_BORDER: Record<CalEventKind, string>` with literal `border-*` strings next to `EVENT_COLOR`, and index it. Clamp `selectedDay` inside `prevMonth`/`nextMonth` with `Math.min(selectedDay, new Date(y, m + 1, 0).getDate())`. |
| BUG-16 | `IrinsSync.tsx:53-65`, `MasterAdminView.tsx:90-118`, `AccessRequests.tsx:21-32` | `try { … } catch (e) { console.error(e); } finally { setLoading(false); }`, and check `error` from every `Promise.all` result instead of destructuring only `data`. |
| BUG-17 | `DataTable.tsx:136` | Reset on identity, not length: `useEffect(() => setCurrentPage(1), [query, sort, data])` (or a `filterKey` prop). Also reset when `currentPage > totalPages`. |
| BUG-18 | `PMSContext.tsx:340` | Wrap `getReport` in `useCallback` (match `ProposalsContext.getProposal:63`). |
| BUG-19 | `pms/AuditLog.tsx:48-68` | For `'all'`, fetch both sources fully (they are small, and `PER_PAGE` is a UI slice) or page a server-side union view; never page-then-merge. |
| BUG-20 | `Intelligence.tsx:300-301,346-350` | Derive the average from `scientificOutputs` (reuse the `MasterAdminView:136-139` helper, hoisted into `src/lib/intelligence/`), and actually sort `filteredPubs` by year desc inside its `useMemo`. |

**Verify:** each row has one observable acceptance: highlight follows the URL; the tenure
histogram includes a `22.12.1997` DOJ; every calendar kind shows an accent colour; no page
spins forever when Supabase is unset; a same-size filter change on page 3 shows page 1;
`EvaluateReport` loads once (React DevTools / network tab); audit page 2 contains no row from
page 1; the KPI matches the computed average.

---

### WO-11 — Accessibility and shared primitives (BUG-21, BUG-22, BUG-23, BUG-24) · P2 · M

Fix once, in the primitives, and it lands everywhere.

1. **Focus trap in `src/utils/useDialog.ts`.** Shift+Tab/Tab must wrap inside the panel; add
   `aria-hidden`/`inert` on the app root while open, and lock body scroll. Eleven modals
   inherit this through `Modal`/`Sheet` — do not fix them individually.
2. **`src/components/ui/Cards.tsx`.** When `onClick` is present, `Card` must render
   `role="button"`, `tabIndex={0}` and Enter/Space handlers (grid cards are the primary
   navigation on `HumanCapital`, `Projects`, `Divisions`, `Facilities`). Replace `Badge`'s
   hardcoded hex (`:76-82`) with four `--color-badge-*` tokens defined light and dark in
   `src/index.css` — today every badge is a light chip in dark mode.
3. **Labels and live regions.** `htmlFor` count must go from 0 to all: start with
   `Login.tsx:492,509` (+ `autoComplete="username"` / `"current-password"`),
   `pms/EvaluateReport.tsx` (12 score inputs + reasons), `helpdesk/TicketForm.tsx`,
   `admin/HolidaysAdmin.tsx:184-202`. Add one `aria-live="polite"` region to `AskSurya` for
   the streamed answer and `role="alert"` on every error banner.
4. **Login (BUG-23).** Clear the inner `setTimeout` on unmount (keep the id in a ref);
   gate both intervals on `matchMedia('(prefers-reduced-motion: reduce)')`; add a real
   pause/play button for the auto-advancing deck (hover-pause is not keyboard reachable).
5. **Density (BUG-24).** Decide: wire it (`document.documentElement.dataset.density = density`
   in `ThemeContext`, and key the CSS off `[data-density="compact"]` as `CLAUDE.md` already
   documents) or delete the control and the dead CSS. Do not leave it as a no-op.

**Verify:** [ ] keyboard-only pass on Login → Dashboard → Human Capital → a staff record →
   a modal (Tab never escapes); [ ] `axe`/Lighthouse a11y ≥ 95 on the five main pages;
   [ ] dark-mode screenshot shows readable badges; [ ] density visibly changes row padding
   or the setting is gone.

---

### WO-12 — Memoise the context values (BUG-25) · P3 · XS

Wrap each provider's value in `useMemo` (`AuthContext:223`, `DataContext:390`, `PMSContext:719`,
`AWPContext:180`, `ProposalsContext:170`, `ProjectReportsContext:150`, `ThemeContext:35`,
`UIContext:47`), matching `FeatureControlContext:71`. Dependency arrays must be exhaustive —
this is the one place where a wrong dep array changes behaviour instead of just performance.

**Verify:** [ ] typing in a filter on `HumanCapital` no longer re-renders unrelated pages'
   consumers (React DevTools highlight-updates); [ ] behaviour unchanged; `npm test` green.

---

### WO-13 — Hygiene that has become a bug (BUG-26 … BUG-31) · P3 · S

1. **Design-token ratchet (BUG-26).** Widen the ESLint selectors to catch non-literal
   `className` (`JSXExpressionContainer` with template literals, ternaries and `clsx(...)`
   arguments), and cover `src/lib/**` + `src/utils/**` string maps. Then fix the 41 known
   instances (they are status maps — replace with semantic tokens once, in
   `src/lib/pms/constants.ts`, `src/lib/helpdesk/constants.ts`, `src/lib/calendar/types.ts`,
   `src/utils/dateUtils.ts`, `EvaluatorQueue.tsx:10-12`, `KpiTile.tsx:42`).
   Add `node scripts/update-design-debt.mjs` as a CI step so the allowlist can only shrink —
   `eslint.config.js:10` already claims CI does this and it does not.
2. **Lint ignores (BUG-27).** Add `ingest/**`, `rag/**`, `**/__pycache__/**`,
   `**/.pytest_cache/**` to `eslint.config.js:30`, so `npm run lint` works on a Windows dev
   box and stops parsing Python trees.
3. **Route-guard test (BUG-28).** In `src/constants/access.test.ts`, add the forward direction:
   every `accessPath="…"` in `App.tsx` must be a key of `ACCESS_MAP`. A typo currently locks
   that page for **everyone, including MasterAdmin** (`featureControls.ts:42-56` returns
   `path in ACCESS_MAP` for MA), with no test and no visible error.
4. **Docs (BUG-29, BUG-30).** Correct `CLAUDE.md`: nav is `Sidebar.tsx` `NAV_SECTIONS`;
   `src/utils/mockData.ts` does not exist (decide whether the entity dance still wants a mock
   layer, and say what to do instead); an `ErrorBoundary` does wrap the app in `main.tsx`;
   refresh the test counts from `npm test`. Repoint the three `docs/ARCHITECTURE-REMEDIATION.md`
   citations at `docs/history/ARCHITECTURE-REMEDIATION.md` (that file exists); cite
   `20260726000004_baseline_grants.sql` in `supabase/CLAUDE.md`; fix the three self-naming
   migration headers.
5. **`.heading` (BUG-31).** `src/index.css:212-216` → `font-family: var(--font-serif)` so it
   resolves to Fraunces per `DESIGN.md`.

**Verify:** [ ] `npm run lint` passes on Windows; [ ] a deliberately raw `text-gray-500` in a
   `.ts` status map now fails CI; [ ] a typo'd `accessPath` fails a test; [ ] every path cited
   in `CLAUDE.md` exists (`Test-Path` each one).

---

## 5. Suggested shipping order (four PRs)

| PR | Work orders | Why together | Risk |
|---|---|---|---|
| **1. PMS integrity** | WO-1, WO-2 | One migration family, one E2E surface; WO-2's lock change needs WO-1's tests in place to prove RPCs still work | Medium — touches the appraisal state machine. Land with the full E2E smoke, not just unit tests. |
| **2. DB hardening** | WO-3, WO-4, WO-5, WO-6 | All additive SQL, no app changes; each independently revertable | Low |
| **3. App bugs users see** | WO-7, WO-8, WO-9, WO-10 | Small, verified, and independently reviewable | Low |
| **4. A11y + hygiene** | WO-11, WO-12, WO-13 | No functional risk; the a11y work is the only multi-file churn | Low, high volume |

Do **not** bundle PR-4's `clsx → cn` / token migration with anything else — it touches ~100
files and will bury a real diff.

---

## 6. Tracker

```
[x] WO-1  PMS client-write guard           P0   BUG-01 BUG-02
[x] WO-2  PMS authz + grievance + clock    P1   BUG-03 BUG-04 BUG-05
[x] WO-3  Helpdesk integrity               P1   BUG-06
[x] WO-4  SECURITY DEFINER hardening       P1   BUG-07 BUG-34
[x] WO-5  Self-appraisal reminder          P1   BUG-08
[x] WO-6  Schema integrity                 P2   BUG-32 BUG-33
[x] WO-7  Recruitment schema drift         P1   BUG-09
[x] WO-8  Report upload access tier        P1   BUG-10
[x] WO-9  Paging parity + boot load        P1   BUG-11 BUG-12
[x] WO-10 Verified UI bugs                 P2   BUG-13..BUG-20
[x] WO-11 A11y + primitives                P2   BUG-21..BUG-24
[x] WO-12 Context memoisation              P3   BUG-25
[x] WO-13 Hygiene                          P3   BUG-26..BUG-31
```

`[~]` = partly done. PRs: #16 (WO-1/2), #17 (WO-3..6), #18 (WO-7..10), #19 (WO-11..13).
§7 decisions taken 2026-11-01: all option A (applications table; derived deadlines + March-end CHECK;
appeals survive the lock; density wired). WO-12 Data/PMS/AWP contexts done in a follow-up PR (fix/context-memo). Still open:
the 3 self-naming migration headers (shipped files); vacancy_* id type drift (repo text, live uuid).
All migrations 20261102000001..0007 applied live 2026-11-01 (#20 dropped the ProjectNo unique rule: work packages share ProjectNo; #21 matched live uuid ids).

---

## 7. Needs a product decision (do not guess)

1. **Recruitment (WO-7):** separate `vacancy_applications` table, or extend `vacancy_posts`?
   Everything else in that work order depends on the answer.
2. **Appraisal deadlines (`BUG-05`, `BUG-08`):** keep the derived `make_date` calendar
   (May 15 / Jun 30 / Jul 31 / Nov 30 of the cycle's end year) or store the four deadlines on
   `appraisal_cycles` and drop the derivation? Storing them fixes both bugs at the root and
   allows a non-March cycle.
3. **Grievance after the lock (`BUG-04`):** the carve-out above is the minimum. Confirm the
   institute's actual rule — does the 15-day appeal window survive the Nov 30 lock, or does
   the lock also close appeals? The current code implements the first and the triggers
   implement the second, so one of them is wrong.
4. **Density (`BUG-24`):** wire it or delete it.
