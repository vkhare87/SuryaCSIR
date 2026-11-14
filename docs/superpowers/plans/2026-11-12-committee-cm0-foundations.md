# Committee Module CM0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give committees terms, seats and membership-based access in the database, and give
meetings a stage, without breaking any screen that works today.

**Architecture:** Three new tables (`committee_terms`, `committee_memberships`,
`external_members`) become the source of who sits where. SQL helpers answer "what is the
caller's seat" and every committee read policy calls them. The old columns
(`committees.chairperson_id`, `secretary_id`) and the old table (`committee_members`) stay
and are rewritten by one RPC, so existing readers keep working. `meetings.stage` is added
beside `status` and the two are kept in step by a trigger.

**Tech Stack:** Supabase Postgres (RLS, `SECURITY DEFINER` RPC) · React 19 + TypeScript
strict · vitest + PGlite harness (`scripts/db/pgliteHarness.ts`).

**Spec:** [`docs/roadmap/sources/COMMITTEE-MODULE-PLAN.md`](../../roadmap/sources/COMMITTEE-MODULE-PLAN.md)
— phase `CM0`, §2.3, §2.4, §3.1–3.3.

## Global Constraints

- Migrations are new files `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`. **Take the next
  free timestamp when you create the file** — another session is adding migrations (last
  seen: `20261112000012`). The four names below are fixed; their order is fixed. Never edit
  a shipped file.
- Every new table: RLS enabled and an explicit policy block in the same migration.
- Every `SECURITY DEFINER` function: `SET search_path = public` and an authorization block
  first. `python scripts/check_security_definer.py` must pass.
- No `GRANT ALL`. Grant `EXECUTE` to `authenticated` per function.
- "Authority" in this plan means exactly: `caller_has_role('Director') OR
  caller_has_role('SystemAdmin') OR caller_has_role('MasterAdmin')` — the three roles that
  write committees today.
- Existing committees get `confidentiality = 'institute'`. CM0 must not hide any record that
  is visible today.
- In CM0 the chairperson and the member-secretary must be staff. External members hold
  other seats only.
- Pages and components read through `useData()`. New client writes go through an RPC.
- TypeScript: `interface` for shapes, `import type` for types, no `any` outside
  `dataMapper.ts`. Semantic Tailwind tokens only; read `DESIGN.md` before the UI task.
- Do not edit `docs/superpowers/plans/2026-11-12-enterprise-phases.md`.
- Shared files with the other session: `src/types/index.ts`, `src/utils/dataMapper.ts`,
  `src/contexts/DataContext.tsx`. Pull before each task that touches them; add, do not
  reorder.

## Found in the code (2026-11-12) — why some tasks exist

1. All six committee tables have `FOR SELECT … USING (true)`. Any logged-in user reads
   every committee, meeting, agenda and document row.
2. All writes are authority-only in RLS. `permissions.ts` lets the chairperson and secretary
   schedule and write minutes, but the database refuses them.
3. `canScheduleMeeting` compares `user.id` (login id) with `committee.chairperson_id` (staff
   ID). They are never equal.
4. Components write to the tables directly (`CommitteeFormModal.tsx`, `MeetingFormModal.tsx`,
   `MinutesEditor.tsx`, `KanbanCard.tsx`, `ActionItemModal.tsx`, `DocumentUploader.tsx`).
   CM0 moves only the committee form to an RPC. The rest move in CM2–CM6.
5. Files in the `committee-docs` bucket are stored at
   `<committee_id>/<meeting_id>/<time>_<name>` and are readable by every logged-in user.
6. `project_slot_schedule` (PME) inserts an agenda item as a definer function and only checks
   that the meeting exists. It keeps working unchanged.

## Review Focus

1. **A staff ID on a committee that is not in `staff`.** The backfill skips that seat and
   the migration still applies. (Task 1)
2. **One person is both chairperson and secretary.** One membership, seat `CHAIRPERSON`; the
   committee still loads. (Task 1)
3. **A user with no linked staff row.** `committee_seat()` returns `NULL`; an `institute`
   committee is still readable; a `members` one is not. (Task 2)
4. **An old screen sets `status = 'Completed'` directly.** `stage` follows to `HELD`. A later
   RPC sets `stage`; `status` follows. Neither write loops. (Task 4)
5. **Saving the committee form twice with no change.** No membership is ended or reopened;
   the event log gains nothing. (Task 3)

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<TS>_committee_terms.sql` | New tables, new `committees` columns, event log, backfill |
| `supabase/migrations/<TS>_committee_access.sql` | Seat helpers; read and write policies; storage read policy |
| `supabase/migrations/<TS>_committee_save.sql` | `committee_save`, `my_committee_seats`; direct writes to `committees` / `committee_members` closed |
| `supabase/migrations/<TS>_meeting_stage.sql` | `meetings.stage`, time columns, `term_id`, sync trigger |
| `scripts/db/committees.db.test.ts` | All database tests of this plan |
| `supabase/tests/rls_negative.sql`, `rls_positive.sql` | One committee case each |
| `src/types/index.ts`, `src/utils/dataMapper.ts`, `src/contexts/DataContext.tsx` | New types, mappers, loads |
| `src/lib/committees/permissions.ts` (+ test) | Decide by seat, not by id comparison |
| `src/lib/committees/seats.ts` (+ test) | Seat labels and ordering — one place |
| `src/components/committees/CommitteeFormModal.tsx` | Calls `committee_save`; confidentiality field; seat per member |
| `src/pages/committees/CommitteeDetail.tsx`, `MeetingDetail.tsx` | Show term, seats, stage |

---

### Task 1: Terms, seats and the event log

**Files:**
- Create: `supabase/migrations/<TS>_committee_terms.sql`
- Create: `scripts/db/committees.db.test.ts`

**Interfaces:**
- Consumes: `public.committees`, `public.committee_members`, `public.staff("ID")`,
  `public.set_updated_at()`.
- Produces (tables):
  - `committees` `+ confidentiality text NOT NULL DEFAULT 'institute' CHECK (confidentiality IN ('institute','members','confidential'))`,
    `+ sign_policy text NOT NULL DEFAULT 'CHAIR_SECRETARY' CHECK (sign_policy IN ('CHAIR_SECRETARY','ALL_PRESENT'))`,
    `+ parent_committee_id uuid REFERENCES committees(id) ON DELETE SET NULL`,
    `+ rule_key text`, `+ dissolved_on date`, `+ dissolution_ref text`.
  - `committee_terms(id uuid PK, committee_id uuid NOT NULL → committees ON DELETE CASCADE, term_no integer NOT NULL, from_on date NOT NULL, to_on date, order_ref text, order_document_id uuid, terms_of_reference text NOT NULL DEFAULT '', quorum_min integer, quorum_needs_chair boolean NOT NULL DEFAULT true, cadence_months integer, status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','SUPERSEDED')), created_at)`,
    `UNIQUE (committee_id, term_no)`, and a partial unique index: one `ACTIVE` term per
    committee.
  - `external_members(id uuid PK, name text NOT NULL, organisation text NOT NULL DEFAULT '', designation text NOT NULL DEFAULT '', email text, phone text, user_id uuid → auth.users, created_by uuid, created_at)`.
  - `committee_memberships(id uuid PK, term_id uuid NOT NULL → committee_terms ON DELETE CASCADE, staff_id text → staff("ID") ON DELETE RESTRICT, external_member_id uuid → external_members ON DELETE RESTRICT, seat text NOT NULL CHECK (seat IN ('CHAIRPERSON','MEMBER_SECRETARY','CONVENER','MEMBER','EXTERNAL_EXPERT','NOMINEE','INVITEE')), from_on date NOT NULL, to_on date, ended_reason text, created_at)`,
    `CHECK ((staff_id IS NULL) <> (external_member_id IS NULL))`; partial unique indexes
    `WHERE to_on IS NULL`: one open membership per `(term_id, staff_id)`, one per
    `(term_id, external_member_id)`, one open `CHAIRPERSON` per term, one open
    `MEMBER_SECRETARY` per term.
  - `committee_events(id bigserial PK, committee_id uuid NOT NULL → committees ON DELETE CASCADE, meeting_id uuid, kind text NOT NULL, actor_user_id uuid, detail jsonb NOT NULL DEFAULT '{}', at timestamptz NOT NULL DEFAULT now())`
    — insert-only.
- Produces (function): `committee_log_event(p_committee_id uuid, p_meeting_id uuid, p_kind text, p_detail jsonb) RETURNS void`
  — internal writer. Follow the pattern of the `project_events` writer in
  `20261111000002_project_execution.sql` exactly (definer, `EXECUTE` revoked from `PUBLIC`,
  `anon`, `authenticated`), so the definer lint treats it the same way.
- RLS in this file: enable on all four new tables with **read policies that return no rows
  to `authenticated` yet** (`USING (false)`); Task 2 replaces them. No write policy.

- [ ] **Step 1: Write the failing tests**

In `scripts/db/committees.db.test.ts`, header and helpers copied from
`scripts/db/contributions.db.test.ts` (`rpc`, `one`, `su`, `beforeAll` with `migratedDb()`,
180 s timeout). Users and seed:

```ts
const U = {
  admin:  '40000000-0000-0000-0000-000000000001', // MasterAdmin
  chair:  '40000000-0000-0000-0000-000000000002', // staff T-CH
  sec:    '40000000-0000-0000-0000-000000000003', // staff T-SEC
  member: '40000000-0000-0000-0000-000000000004', // staff T-MEM
  outsider: '40000000-0000-0000-0000-000000000005', // staff T-OUT, role Scientist
  nostaff:  '40000000-0000-0000-0000-000000000006', // role Scientist, no staff row
} as const;
```

The migration backfill runs inside `migratedDb()` on empty tables, so the tests call the
backfill function directly after seeding legacy rows. Therefore the migration exposes the
backfill as `committee_backfill_terms() RETURNS integer` (definer, `EXECUTE` revoked from
everyone; run once at the end of the migration).

```ts
describe('backfill', () => {
  it('gives each committee term 1 and seats from the old columns', async () => {
    // seed as su(): committee C1 (chairperson_id 'T-CH', secretary_id 'T-SEC', formed_date '2025-01-10')
    // + committee_members: ('T-MEM','Member'), ('T-CH','Member')  <- chair also listed as member
    await su().query(`SELECT public.committee_backfill_terms()`);
    const term = await one(su(), `SELECT * FROM committee_terms WHERE committee_id = $1`, [C1]);
    expect(term.term_no).toBe(1);
    expect(term.status).toBe('ACTIVE');
    expect(String(term.from_on)).toContain('2025-01-10');
    const seats = (await su().query(
      `SELECT staff_id, seat FROM committee_memberships WHERE term_id = $1 ORDER BY staff_id`, [term.id])).rows;
    expect(seats).toEqual([
      { staff_id: 'T-CH', seat: 'CHAIRPERSON' },
      { staff_id: 'T-MEM', seat: 'MEMBER' },
      { staff_id: 'T-SEC', seat: 'MEMBER_SECRETARY' },
    ]);
  });
  it('skips a seat whose staff ID is not in staff, and still finishes', async () => {
    // committee C2: chairperson_id 'GHOST', secretary_id 'T-SEC'
    await su().query(`SELECT public.committee_backfill_terms()`);
    const n = await one(su(), `SELECT count(*)::int AS n FROM committee_memberships m
      JOIN committee_terms t ON t.id = m.term_id WHERE t.committee_id = $1`, [C2]);
    expect(n.n).toBe(1);
  });
  it('uses one CHAIRPERSON seat when chair and secretary are the same person', async () => {
    // committee C3: both 'T-CH'  -> exactly one membership, seat CHAIRPERSON
  });
  it('is safe to run twice', async () => {
    // run again -> counts of committee_terms and committee_memberships unchanged
  });
});
describe('constraints', () => {
  it('refuses a second open CHAIRPERSON in one term');          // expect rejects /unique/
  it('refuses a membership with both or neither of staff_id and external_member_id');
  it('refuses a second ACTIVE term for one committee');
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run scripts/db/committees.db.test.ts`
Expected: FAIL — `relation "committee_terms" does not exist`.

- [ ] **Step 3: Write `<TS>_committee_terms.sql`**

Wrap in `BEGIN; … COMMIT;`. Seat mapping in `committee_backfill_terms()`:
`chairperson_id → CHAIRPERSON`; `secretary_id → MEMBER_SECRETARY` unless equal to the chair;
`committee_members.role` `Member → MEMBER`, `Invitee → INVITEE`,
`ExternalExpert → EXTERNAL_EXPERT`, skipping a `staff_id` already seated in that term.
Insert a seat only `WHERE EXISTS (SELECT 1 FROM staff WHERE "ID" = …)`. `from_on` =
`committees.formed_date`. A committee that already has a term is skipped.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run scripts/db/committees.db.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the schema and definer checks**

Run: `npx vitest run scripts/db/schema.db.test.ts` and `python scripts/check_security_definer.py`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_committee_terms.sql scripts/db/committees.db.test.ts
git commit -m "CM0: committee terms, seats, event log and backfill"
```

---

### Task 2: Access by seat

**Files:**
- Create: `supabase/migrations/<TS>_committee_access.sql`
- Modify: `scripts/db/committees.db.test.ts`
- Modify: `supabase/tests/rls_negative.sql`, `supabase/tests/rls_positive.sql`

**Interfaces:**
- Consumes: Task 1 tables; `caller_staff_id()`, `caller_has_role(text)`,
  `caller_is_verified()`, `ist_today()`.
- Produces (all `STABLE SECURITY DEFINER SET search_path = public`, `EXECUTE` to
  `authenticated`; definer so a policy on `committees` can read `committee_memberships`
  without recursion):
  - `committee_is_authority() RETURNS boolean` — the three roles in Global Constraints.
  - `committee_seat(p_committee_id uuid) RETURNS text` — the caller's seat in the `ACTIVE`
    term where `staff_id = caller_staff_id()` **or** `external_member_id` belongs to
    `auth.uid()`, `from_on <= ist_today()` and `to_on IS NULL OR to_on >= ist_today()`.
    `NULL` when none.
  - `committee_can_read(p_committee_id uuid) RETURNS boolean` —
    `committee_is_authority()` **or** seat is not null **or**
    (`confidentiality = 'institute'` and `caller_is_verified()`).
  - `committee_can_run(p_committee_id uuid) RETURNS boolean` — authority, or seat in
    (`CHAIRPERSON`, `MEMBER_SECRETARY`, `CONVENER`).
- Policy changes (drop the named baseline policy, create the replacement):

| Table | Read | Write |
|---|---|---|
| `committees` | `committee_can_read(id)` | unchanged in this task (authority) |
| `committee_members` | `committee_can_read(committee_id)` | unchanged |
| `committee_terms`, `committee_memberships` | `committee_can_read` of the committee | none (RPC only) |
| `external_members` | authority, or the caller shares a term with the member | none (RPC only) |
| `committee_events` | `committee_can_read(committee_id)` | none |
| `meetings` | `committee_can_read(committee_id)` | `committee_can_run(committee_id)` **AND the existing 7-day lock clause, kept word for word** in insert, update and delete |
| `agenda_items`, `meeting_documents` | `committee_can_read` of the meeting's committee | `committee_can_run` of the meeting's committee |
| `action_items` | `meeting_id IS NULL`, or `committee_can_read` of the meeting's committee, or `assigned_to = caller_staff_id()` | authority; or `committee_can_run` of the meeting's committee; or **update only** where `assigned_to = caller_staff_id()` before and after |
| `storage.objects`, bucket `committee-docs` | `committee_can_read(((storage.foldername(name))[1])::uuid)` | insert: `committee_can_run` of the same folder |

- [ ] **Step 1: Write the failing tests**

Add to `committees.db.test.ts`. Seed (as `su()`): staff rows `T-CH`, `T-SEC`, `T-MEM`,
`T-OUT` linked to their users; committee `OPEN` (`institute`) and committee `SEL`
(`confidential`), each with chair, secretary and member seated through direct inserts;
one meeting, one agenda item, one action item assigned to `T-OUT` on `SEL`.

```ts
const count = (who: string, sql: string, args: unknown[] = []) =>
  as(db, who, async tx => (await tx.query<Row>(sql, args)).rows.length);

describe('reading', () => {
  it('institute committee: any verified user reads it', async () => {
    expect(await count(U.outsider, `SELECT 1 FROM committees WHERE id = $1`, [OPEN])).toBe(1);
    expect(await count(U.nostaff,  `SELECT 1 FROM committees WHERE id = $1`, [OPEN])).toBe(1);
  });
  it('confidential committee: outsider reads nothing in any of the six tables', async () => {
    for (const [sql, arg] of [
      [`SELECT 1 FROM committees WHERE id = $1`, SEL],
      [`SELECT 1 FROM committee_members WHERE committee_id = $1`, SEL],
      [`SELECT 1 FROM committee_memberships m JOIN committee_terms t ON t.id = m.term_id WHERE t.committee_id = $1`, SEL],
      [`SELECT 1 FROM meetings WHERE committee_id = $1`, SEL],
      [`SELECT 1 FROM agenda_items WHERE meeting_id = $1`, SEL_MEETING],
      [`SELECT 1 FROM meeting_documents WHERE meeting_id = $1`, SEL_MEETING],
    ] as const) expect(await count(U.nostaff, sql, [arg])).toBe(0);
  });
  it('confidential committee: a member and the authority read it', async () => {
    expect(await count(U.member, `SELECT 1 FROM meetings WHERE committee_id = $1`, [SEL])).toBe(1);
    expect(await count(U.admin,  `SELECT 1 FROM meetings WHERE committee_id = $1`, [SEL])).toBe(1);
  });
  it('an assignee reads own action item on a committee they cannot read', async () => {
    expect(await count(U.outsider, `SELECT 1 FROM action_items WHERE id = $1`, [SEL_ACTION])).toBe(1);
  });
  it('a member whose membership ended yesterday no longer reads', async () => {
    // set to_on = ist_today() - 1 for T-MEM on SEL -> 0 rows
  });
});
describe('running', () => {
  it('the member-secretary inserts a meeting; a plain member is refused', async () => {
    // U.sec insert into meetings -> ok;  U.member insert -> rejects /row-level security/
  });
  it('the 7-day lock still holds for the member-secretary', async () => {
    // meeting status 'Completed', meeting_date = CURRENT_DATE - 8 -> U.sec update affects 0 rows
  });
  it('an assignee updates own action item status but cannot reassign it', async () => {
    // U.outsider: update status -> 1 row; update assigned_to -> rejects
  });
  it('committee_seat is NULL for a user with no staff row', async () => {
    expect((await as(db, U.nostaff, tx => rpc(tx, 'committee_seat', [SEL])))[0].committee_seat).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run scripts/db/committees.db.test.ts -t "reading|running"`
Expected: FAIL — `function public.committee_seat(uuid) does not exist`.

- [ ] **Step 3: Write `<TS>_committee_access.sql`**

Use `DROP POLICY IF EXISTS "<name>"` with the exact baseline names
(`committees_select`, `committee_members_select`, `agenda_items_select`,
`action_items_select`, `meeting_documents_select`, `meetings_select`, `meetings_insert`,
`meetings_update`, `meetings_delete`, `agenda_items_write`, `action_items_write`,
`meeting_documents_write`, `committee_docs_select`, `committee_docs_insert`). Split each
former `FOR ALL` write policy into insert / update / delete so it no longer grants read.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run scripts/db/committees.db.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Add one case to each RLS SQL suite**

`rls_negative.sql`: a `Scientist` with no seat selects from `meetings` of a `confidential`
committee → 0 rows. `rls_positive.sql`: the member-secretary inserts a meeting → 1 row.
Follow the block style already in each file.

- [ ] **Step 6: Run the whole database suite**

Run: `npx vitest run scripts/db` and `python scripts/check_security_definer.py`
Expected: all pass — in particular `projectMonitoring.db.test.ts` (PME still schedules a
review on a meeting) and `security.db.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/*_committee_access.sql scripts/db/committees.db.test.ts supabase/tests/rls_negative.sql supabase/tests/rls_positive.sql
git commit -m "CM0: committee access by seat; confidential committees hidden from non-members"
```

---

### Task 3: Save a committee through one RPC

**Files:**
- Create: `supabase/migrations/<TS>_committee_save.sql`
- Modify: `scripts/db/committees.db.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `committee_save(p_committee_id uuid, p_committee jsonb, p_members jsonb) RETURNS uuid`
    — `SECURITY DEFINER`; refuses unless `committee_is_authority()`.
    `p_committee` keys: `name`, `committee_type`, `mandate`, `status`, `confidentiality`.
    `p_members`: array of `{"staff_id": text}` **or** `{"external_member_id": uuid}`, each
    with `"seat"`. `p_committee_id NULL` creates the committee and term 1
    (`from_on = ist_today()`).
  - `external_member_save(p_id uuid, p_member jsonb) RETURNS uuid` — authority, or a caller
    for whom `committee_can_run` is true on any committee. Keys: `name`, `organisation`,
    `designation`, `email`, `phone`.
  - `my_committee_seats() RETURNS TABLE(committee_id uuid, seat text)` — the caller's open
    seats in `ACTIVE` terms. Definer; filters by `caller_staff_id()` / `auth.uid()` only.
- Rules inside `committee_save`:
  1. Exactly one `CHAIRPERSON` and exactly one `MEMBER_SECRETARY`, both with `staff_id`;
     else `RAISE EXCEPTION 'A committee needs one chairperson and one member-secretary from the staff'`.
  2. No person twice; else `'… is listed twice'`.
  3. Diff against the open memberships of the `ACTIVE` term: same person and same seat →
     untouched; seat changed → close the old row (`to_on = ist_today()`,
     `ended_reason = 'SEAT_CHANGE'`) and open a new one; absent from `p_members` → close
     with `ended_reason = 'REMOVED'`; new → open with `from_on = ist_today()`.
  4. Then rewrite the compatibility data in the same transaction:
     `committees.chairperson_id`, `secretary_id`, and the `committee_members` rows
     (staff members only; `MEMBER`/`CONVENER`/`NOMINEE → 'Member'`, `INVITEE → 'Invitee'`,
     `EXTERNAL_EXPERT → 'ExternalExpert'`).
  5. One `committee_log_event` per real change (`CREATED`, `UPDATED`, `MEMBER_JOINED`,
     `MEMBER_LEFT`, `SEAT_CHANGED`); none when nothing changed.
- Policy change: drop `committees_write` and `committee_members_write`. Replace with
  `committees_delete` for `caller_has_role('MasterAdmin')` only. No direct insert or update
  for anyone.

- [ ] **Step 1: Write the failing tests**

```ts
const save = (who: string, id: string | null, c: object, m: object[]) =>
  as(db, who, async tx => (await rpc(tx, 'committee_save', [id, JSON.stringify(c), JSON.stringify(m)]))[0].committee_save as string);
const base = { name: 'Purchase Committee', committee_type: 'Standing', mandate: '', status: 'Active', confidentiality: 'members' };
const seats3 = [{ staff_id: 'T-CH', seat: 'CHAIRPERSON' }, { staff_id: 'T-SEC', seat: 'MEMBER_SECRETARY' }, { staff_id: 'T-MEM', seat: 'MEMBER' }];

describe('committee_save', () => {
  it('creates committee, term 1, seats, and the old columns', async () => {
    const id = await save(U.admin, null, base, seats3);
    const c = await one(su(), `SELECT chairperson_id, secretary_id, confidentiality FROM committees WHERE id = $1`, [id]);
    expect(c).toEqual({ chairperson_id: 'T-CH', secretary_id: 'T-SEC', confidentiality: 'members' });
    const legacy = (await su().query(`SELECT staff_id, role FROM committee_members WHERE committee_id = $1`, [id])).rows;
    expect(legacy).toEqual([{ staff_id: 'T-MEM', role: 'Member' }]);
  });
  it('saving again unchanged ends nothing and logs nothing', async () => {
    // snapshot count(*) of memberships and of committee_events; save same payload; counts equal
  });
  it('removing a member closes the seat with reason REMOVED and keeps the row', async () => {
    // save without T-MEM -> row has to_on = today, ended_reason 'REMOVED'
  });
  it('changing a seat closes the old row and opens a new one', async () => {
    // T-MEM MEMBER -> CONVENER : 2 rows for T-MEM, one closed 'SEAT_CHANGE', one open CONVENER
  });
  it('refuses two chairpersons, no secretary, an external chairperson, a person twice');
  it('refuses a non-authority caller', async () => {
    await expect(save(U.chair, null, base, seats3)).rejects.toThrow(/not allowed|authori/i);
  });
  it('direct insert and update on committees and committee_members are refused for the authority too');
  it('MasterAdmin can still delete a committee; its terms and seats go with it');
  it('my_committee_seats returns only the caller’s open seats', async () => {
    const rows = await as(db, U.sec, tx => rpc(tx, 'my_committee_seats', []));
    expect(rows.every(r => r.seat === 'MEMBER_SECRETARY')).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run scripts/db/committees.db.test.ts -t "committee_save"`
Expected: FAIL — `function public.committee_save(uuid, jsonb, jsonb) does not exist`.

- [ ] **Step 3: Write `<TS>_committee_save.sql`**

Lock the committee row (`FOR UPDATE`) before the diff so two saves cannot interleave.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run scripts/db/committees.db.test.ts` and `python scripts/check_security_definer.py`
Expected: PASS (25 tests); lint clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_committee_save.sql scripts/db/committees.db.test.ts
git commit -m "CM0: committee_save RPC keeps seat history; direct committee writes closed"
```

---

### Task 4: Meeting stage and time

**Files:**
- Create: `supabase/migrations/<TS>_meeting_stage.sql`
- Modify: `scripts/db/committees.db.test.ts`

**Interfaces:**
- Produces on `meetings`:
  `+ stage text NOT NULL DEFAULT 'PLANNED' CHECK (stage IN ('PLANNED','NOTICE_ISSUED','AGENDA_CIRCULATED','HELD','MINUTES_DRAFT','MINUTES_CIRCULATED','MINUTES_SIGNED','CONFIRMED','POSTPONED','CANCELLED','ADJOURNED'))`,
  `+ starts_at timestamptz`, `+ ends_at timestamptz` with `CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)`,
  `+ mode text NOT NULL DEFAULT 'IN_PERSON' CHECK (mode IN ('IN_PERSON','ONLINE','HYBRID'))`,
  `+ term_id uuid REFERENCES committee_terms(id) ON DELETE SET NULL`,
  `+ meeting_no integer`, `+ adjourned_from_id uuid REFERENCES meetings(id) ON DELETE SET NULL`,
  `+ notice_days integer`.
- Produces: `meeting_status_for_stage(p_stage text) RETURNS text` (`IMMUTABLE`):
  `PLANNED`, `NOTICE_ISSUED`, `AGENDA_CIRCULATED`, `POSTPONED` → `'Scheduled'`;
  `CANCELLED` → `'Cancelled'`; every other stage → `'Completed'`.
- Produces: trigger `meetings_stage_sync` `BEFORE INSERT OR UPDATE`:
  1. `INSERT`: when `term_id IS NULL`, set it to the committee's `ACTIVE` term. When the row
     arrives with a non-default `status` and default `stage`, apply rule 3.
  2. `UPDATE` where `stage` changed: `status := meeting_status_for_stage(stage)`.
  3. `UPDATE` where `status` changed and `stage` did not: `Scheduled → PLANNED`,
     `Completed → HELD`, `Cancelled → CANCELLED` — **only when the present stage maps to a
     different status**; a meeting at `MINUTES_SIGNED` that an old screen re-saves as
     `Completed` stays at `MINUTES_SIGNED`.
- Backfill: `stage` from `status` by rule 3; `term_id` to the committee's term 1.
  `starts_at` is **left NULL** — the old row has no time and none is invented.

- [ ] **Step 1: Write the failing tests**

```ts
describe('meeting stage', () => {
  it('a new meeting is PLANNED / Scheduled and gets the active term', async () => {
    const m = await one(su(), `INSERT INTO meetings (committee_id, meeting_date, title)
      VALUES ($1, CURRENT_DATE + 3, 'M') RETURNING stage, status, term_id`, [OPEN]);
    expect(m.stage).toBe('PLANNED'); expect(m.status).toBe('Scheduled'); expect(m.term_id).not.toBeNull();
  });
  it('old screen sets status Completed -> stage HELD', async () => {
    // UPDATE meetings SET status = 'Completed' -> stage 'HELD'
  });
  it('setting stage MINUTES_SIGNED keeps status Completed', async () => {});
  it('old screen re-saves Completed on a MINUTES_SIGNED meeting -> stage stays', async () => {});
  it('stage CANCELLED -> status Cancelled; stage POSTPONED -> status Scheduled', async () => {});
  it('refuses an unknown stage and an end before the start', async () => {});
  it.each([['PLANNED','Scheduled'],['HELD','Completed'],['CONFIRMED','Completed'],['ADJOURNED','Completed'],['CANCELLED','Cancelled']])
    ('meeting_status_for_stage(%s) = %s', async (stage, status) => {
      expect((await one(su(), `SELECT public.meeting_status_for_stage($1) AS s`, [stage])).s).toBe(status);
    });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run scripts/db/committees.db.test.ts -t "meeting stage"`
Expected: FAIL — `column "stage" does not exist`.

- [ ] **Step 3: Write `<TS>_meeting_stage.sql`**

The trigger function is a plain (invoker) trigger function — it only sets `NEW` fields.

- [ ] **Step 4: Run the full database suite**

Run: `npx vitest run scripts/db`
Expected: all pass, including `projectMonitoring.db.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_meeting_stage.sql scripts/db/committees.db.test.ts
git commit -m "CM0: meetings gain a stage kept in step with the old status"
```

---

### Task 5: Client data and permissions by seat

**Files:**
- Modify: `src/types/index.ts` (after `MeetingDocument`, about line 342)
- Modify: `src/utils/dataMapper.ts` (committee mappers, about line 243)
- Modify: `src/contexts/DataContext.tsx` (committee loads, about lines 124, 189, 284)
- Create: `src/lib/committees/seats.ts`, `src/lib/committees/seats.test.ts`
- Modify: `src/lib/committees/permissions.ts`, `src/lib/committees/permissions.test.ts`
- Modify callers: `src/pages/committees/CommitteeDetail.tsx:155`,
  `src/pages/committees/MeetingDetail.tsx:111`, `src/components/committees/MinutesEditor.tsx:33`

**Interfaces:**
- Consumes: `my_committee_seats()` (Task 3); tables from Tasks 1 and 4.
- Produces (types, in `src/types/index.ts`):

```ts
export type CommitteeSeat = 'CHAIRPERSON' | 'MEMBER_SECRETARY' | 'CONVENER' | 'MEMBER' | 'EXTERNAL_EXPERT' | 'NOMINEE' | 'INVITEE';
export type CommitteeConfidentiality = 'institute' | 'members' | 'confidential';
export type MeetingStage = 'PLANNED' | 'NOTICE_ISSUED' | 'AGENDA_CIRCULATED' | 'HELD' | 'MINUTES_DRAFT'
  | 'MINUTES_CIRCULATED' | 'MINUTES_SIGNED' | 'CONFIRMED' | 'POSTPONED' | 'CANCELLED' | 'ADJOURNED';
export interface CommitteeTerm { id: string; committee_id: string; term_no: number; from_on: string; to_on: string | null;
  order_ref: string | null; terms_of_reference: string; quorum_min: number | null; quorum_needs_chair: boolean;
  cadence_months: number | null; status: 'ACTIVE' | 'EXPIRED' | 'SUPERSEDED'; }
export interface CommitteeMembership { id: string; term_id: string; staff_id: string | null; external_member_id: string | null;
  seat: CommitteeSeat; from_on: string; to_on: string | null; ended_reason: string | null; }
export interface ExternalMember { id: string; name: string; organisation: string; designation: string; email: string | null; phone: string | null; }
```

  `Committee` gains `confidentiality: CommitteeConfidentiality` and
  `sign_policy: 'CHAIR_SECRETARY' | 'ALL_PRESENT'`. `Meeting` gains `stage: MeetingStage`,
  `starts_at: string | null`, `ends_at: string | null`,
  `mode: 'IN_PERSON' | 'ONLINE' | 'HYBRID'`, `term_id: string | null`,
  `meeting_no: number | null`.
- Produces (`DataContext`): `committeeTerms: CommitteeTerm[]`,
  `committeeMemberships: CommitteeMembership[]`, `externalMembers: ExternalMember[]`,
  `myCommitteeSeats: Record<string, CommitteeSeat>` (committee id → seat).
- Produces (`seats.ts`): `SEAT_LABELS: Record<CommitteeSeat, string>` (`'Chairperson'`,
  `'Member-Secretary'`, `'Convener'`, `'Member'`, `'External expert'`, `'Nominee'`,
  `'Invitee'`); `SEAT_ORDER: CommitteeSeat[]` in that order;
  `canRunSeat(seat: CommitteeSeat | null | undefined): boolean` — true for the first three;
  `activeTerm(terms: CommitteeTerm[], committeeId: string): CommitteeTerm | undefined`;
  `openSeats(memberships: CommitteeMembership[], termId: string): CommitteeMembership[]`
  sorted by `SEAT_ORDER`.
- Produces (`permissions.ts`, changed signatures):
  `canScheduleMeeting(user: UserAccount, seat: CommitteeSeat | null | undefined): boolean` and
  `canWriteMinutes(user: UserAccount, seat: CommitteeSeat | null | undefined): boolean` —
  admin role, or `canRunSeat(seat)`. The `Committee` parameter is removed.
  `canUploadDocuments(user, seat)` — same rule (matches the new storage policy).

- [ ] **Step 1: Write the failing unit tests**

`seats.test.ts`:

```ts
it('canRunSeat', () => {
  expect(canRunSeat('CHAIRPERSON')).toBe(true);
  expect(canRunSeat('MEMBER_SECRETARY')).toBe(true);
  expect(canRunSeat('CONVENER')).toBe(true);
  expect(canRunSeat('MEMBER')).toBe(false);
  expect(canRunSeat(null)).toBe(false);
});
it('openSeats drops closed seats and orders chair first', () => { /* 4 rows in, one closed -> 3 out, [CHAIRPERSON, MEMBER_SECRETARY, MEMBER] */ });
it('activeTerm picks the ACTIVE term of that committee only', () => {});
```

`permissions.test.ts` — replace the id-comparison cases:

```ts
const sci = { id: 'u1', email: '', roles: ['Scientist'], activeRole: 'Scientist', divisionCode: null, mustChangePassword: false } as UserAccount;
it('a Scientist seated as member-secretary may schedule and write minutes', () => {
  expect(canScheduleMeeting(sci, 'MEMBER_SECRETARY')).toBe(true);
  expect(canWriteMinutes(sci, 'CHAIRPERSON')).toBe(true);
});
it('a plain member and a non-member may not', () => {
  expect(canScheduleMeeting(sci, 'MEMBER')).toBe(false);
  expect(canScheduleMeeting(sci, undefined)).toBe(false);
});
it('a Director may, with no seat', () => {
  expect(canScheduleMeeting({ ...sci, activeRole: 'Director' }, null)).toBe(true);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/lib/committees`
Expected: FAIL — `seats` module not found; `permissions` cases fail.

- [ ] **Step 3: Implement `seats.ts`, change `permissions.ts`, add types and mappers**

Mappers `mapCommitteeTermRow`, `mapCommitteeMembershipRow`, `mapExternalMemberRow` in
`dataMapper.ts`; extend `mapCommitteeRow` (default `confidentiality` `'institute'`,
`sign_policy` `'CHAIR_SECRETARY'`) and `mapMeetingRow` (default `stage` `'PLANNED'`,
`mode` `'IN_PERSON'`).

- [ ] **Step 4: Load the new data in `DataContext.tsx`**

Three `fetchAll(...)` calls beside the committee loads, one `supabase.rpc('my_committee_seats')`
folded into `myCommitteeSeats`. A failed seat call falls back to `{}` with `console.error`
(the project's error rule). Add the four fields to the context type and to both memo
dependency lists (about lines 479 and 491).

- [ ] **Step 5: Update the three callers**

Each reads `const { myCommitteeSeats } = useData()` and passes
`myCommitteeSeats[committee.id]`.

- [ ] **Step 6: Run the checks**

Run: `npx vitest run src/lib/committees src/contexts` then `npm run build`
Expected: tests pass; build has no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/utils/dataMapper.ts src/contexts/DataContext.tsx src/lib/committees src/pages/committees/CommitteeDetail.tsx src/pages/committees/MeetingDetail.tsx src/components/committees/MinutesEditor.tsx
git commit -m "CM0: committee permissions decided by seat; terms and seats loaded"
```

---

### Task 6: Committee form and the two detail pages

**Files:**
- Modify: `src/components/committees/CommitteeFormModal.tsx` (direct writes at about lines 118–170)
- Modify: `src/components/committees/MemberPicker.tsx`
- Modify: `src/pages/committees/CommitteeDetail.tsx`, `src/pages/committees/MeetingDetail.tsx`
- Create: `src/lib/committees/savePayload.ts`, `src/lib/committees/savePayload.test.ts`

**Interfaces:**
- Consumes: `committee_save` (Task 3); `SEAT_LABELS`, `SEAT_ORDER`, `activeTerm`,
  `openSeats` (Task 5).
- Produces: `buildCommitteeSavePayload(form: CommitteeFormState): { committee: {...}; members: Array<{ staff_id: string; seat: CommitteeSeat }> }`
  and `validateCommitteeForm(form: CommitteeFormState): string | null`, where
  `CommitteeFormState = { name: string; committeeType: Committee['committee_type']; mandate: string; status: Committee['status']; confidentiality: CommitteeConfidentiality; chairpersonId: string; secretaryId: string; members: Array<{ staffId: string; seat: CommitteeSeat }> }`.
  Messages, exact: `'Choose a chairperson.'`, `'Choose a member-secretary.'`,
  `'The chairperson and the member-secretary must be different people.'`,
  `'<Name> is listed twice.'`.

- [ ] **Step 1: Write the failing tests** (`savePayload.test.ts`)

```ts
it('puts chair and secretary first and maps the rest by seat', () => {
  const p = buildCommitteeSavePayload({ ...form, chairpersonId: 'A', secretaryId: 'B', members: [{ staffId: 'C', seat: 'CONVENER' }] });
  expect(p.members).toEqual([
    { staff_id: 'A', seat: 'CHAIRPERSON' }, { staff_id: 'B', seat: 'MEMBER_SECRETARY' }, { staff_id: 'C', seat: 'CONVENER' }]);
});
it('drops a member row that repeats the chair or secretary', () => {});
it('validate: missing chair, missing secretary, same person, duplicate member', () => {});
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/lib/committees/savePayload.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `savePayload.ts`; rewire `CommitteeFormModal.tsx`**

The modal: one `supabase.rpc('committee_save', { p_committee_id, p_committee, p_members })`
replaces the insert / update / delete-and-reinsert block. Delete stays a direct
`delete` (MasterAdmin only, as the policy allows). Add a **Who can read** select with the
three options and this help text, exact:
`institute` — "All verified staff can read final records." ·
`members` — "Only members and the Director's office." ·
`confidential` — "Only members and the Director's office. Never searchable."
`MemberPicker` gains a seat select per row limited to `CONVENER`, `MEMBER`, `NOMINEE`,
`INVITEE` (staff only in CM0). On a server error, show the RPC's message in the form's
error line.

- [ ] **Step 4: Show term and seats on `CommitteeDetail.tsx`; stage on `MeetingDetail.tsx`**

`CommitteeDetail`: under the header, "Term <n> · from <date>" and the confidentiality
badge; the members list reads `openSeats(...)` with `SEAT_LABELS`, and a collapsed
"Former members" list of closed seats with the end date. `MeetingDetail`: a stage chip
beside the title using these labels, exact: Planned · Notice issued · Agenda circulated ·
Held · Minutes in draft · Minutes circulated · Minutes signed · Confirmed · Postponed ·
Cancelled · Adjourned (put the map in `seats.ts` as `STAGE_LABELS: Record<MeetingStage, string>`).
All derived lists in `useMemo`. Tokens from `DESIGN.md` only.

- [ ] **Step 5: Run the checks**

Run: `npm run build` · `npm run lint` · `npm test`
Expected: all pass.

- [ ] **Step 6: Check in the running app**

Start the dev server through the preview tool. As an authority user: create a committee
with chair, secretary and one convener; reopen it and save unchanged; remove the convener.
Expected: the convener appears under "Former members" with today's date; the committee
page shows "Term 1". As the member-secretary (a `Scientist` login): the **Schedule meeting**
button is present and a meeting saves. As an unrelated `Scientist`: a `members` committee is
absent from the list. Take one screenshot of each.

- [ ] **Step 7: Commit**

```bash
git add src/components/committees src/pages/committees src/lib/committees
git commit -m "CM0: committee form saves through committee_save; term, seats and stage shown"
```

---

### Task 7: Documents and the full gate

**Files:**
- Modify: `docs/engineering/database_design.md`, `api_spec.md`, `system_design.md`,
  `FEATURES.md` (Committees section), `access_matrix.md` (regenerate with
  `scripts/access_matrix.mts` only if a route or role changed — none does in CM0)
- Modify: `docs/roadmap/sources/COMMITTEE-MODULE-PLAN.md` — mark `CM0` shipped in the §7
  table with the date and the four migration timestamps, in the style of
  `PROJECT-LIFECYCLE-PLAN.md` §9

- [ ] **Step 1: Write the documents**

`database_design.md`: the four new tables, the new columns, the helper functions.
`api_spec.md`: `committee_save`, `external_member_save`, `my_committee_seats`,
`committee_seat`, `committee_can_read`, `committee_can_run`. `system_design.md`: the meeting
stage list and the stage ↔ status rule. `FEATURES.md`: who can read and who can run a
committee; the confidentiality options. State plainly that minutes, attendance and
signatures are unchanged in CM0.

- [ ] **Step 2: Run every gate**

Run: `npm run build` · `npm run lint` · `npm test` · `python scripts/check_security_definer.py`
Expected: all pass. Record the test count in the PR description.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "CM0: engineering docs for committee terms, seats and access"
```

---

## Not in CM0

- Constitution order, terms of reference screen, reconstitution, cadence — `CM1`.
- Rooms, refreshments — `CM1`.
- Agenda types, circulation, RSVP — `CM2`. Attendance and quorum — `CM3`.
- Minutes versions, immutability, withdrawal of `unlock_meeting_minutes` — `CM4`.
- Signatures — `CM5`. Task updates and verification — `CM6`.
- Moving `MeetingFormModal`, `MinutesEditor`, `KanbanCard`, `ActionItemModal` and
  `DocumentUploader` off direct table writes — each in the phase that rebuilds it.
- External members holding the chair or secretary seat; a login for external members.

## Self-review

- **Spec coverage (`CM0` row of the spec):** terms ✔ T1 · memberships ✔ T1 · external
  members ✔ T1, T3 · confidentiality ✔ T1, T2, T6 · SQL access helpers and narrowed read
  policies ✔ T2 · `meetings.stage` with status trigger ✔ T4 · date-and-time columns ✔ T4 ·
  `committee_events` ✔ T1, T3 · backfill ✔ T1, T4 · "non-member cannot read a `members`
  committee (DB test)" ✔ T2 · "existing links still open" ✔ T2 step 6, T4 step 4.
- **Added beyond the spec row, on purpose:** `committee_save` (the spec puts constitute in
  `CM1`; without one RPC now, the old form would erase seat history on every save);
  `my_committee_seats` and the `permissions.ts` fix (finding 3); the storage read policy
  (finding 5 — a confidential committee's files were otherwise still open).
- **Names checked across tasks:** `committee_seat` · `committee_can_read` ·
  `committee_can_run` · `committee_is_authority` · `committee_save(uuid, jsonb, jsonb)` ·
  `my_committee_seats()` · `committee_log_event` · `meeting_status_for_stage` ·
  `CommitteeSeat` · `MeetingStage` · `canRunSeat` · `openSeats` · `activeTerm` ·
  `STAGE_LABELS` · `myCommitteeSeats`.
- **Not verified, check when you reach it:** whether the PGlite harness shims
  `storage.objects` and `storage.foldername` (Task 2 — if not, keep the storage policy in
  the migration and test it only in `supabase/tests`); the exact name of the
  `project_events` writer to copy (Task 1).
