# Operating Model Phase 1 — Contribution Requests & Data Stewards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn missing or stale data into a small, owned request that the right person completes from one inbox, with delegate / not-mine / clarify / confirm paths and a full audit trail.

**Architecture:** One migration adds `data_stewards`, `contribution_requests` and `contribution_request_events`, with status moved only by two `SECURITY DEFINER` RPCs and a daily cron sweep that raises "refresh" requests for stale domains. The client loads both tables through `DataContext`, shows requests in the existing My Actions card and a new `/work` page, and applies accepted field changes through the same RLS-gated write the edit modal already uses.

**Tech Stack:** Supabase Postgres (plpgsql, RLS, pg_cron) · React 19 + TypeScript strict · Tailwind 4 tokens · Vitest + PGlite harness.

**Spec:** [docs/roadmap/SURYA-OPERATING-MODEL-OVERHAUL-PLAN.md](../../roadmap/SURYA-OPERATING-MODEL-OVERHAUL-PLAN.md) §4 A–C, §5 Phase 1. Programme map: [2026-11-01-operating-model-overhaul-index.md](2026-11-01-operating-model-overhaul-index.md).

## Global Constraints

- Domains are exactly the `FileType` keys: `divisions`, `staff`, `projects`, `projectStaff`, `phd`, `equipment`, `contractStaff`.
- "Workspace personalization must never grant access." Every read goes through RLS; no client role check is the gate.
- "Existing RLS remains authoritative." Requests never write canonical tables server-side (index decision 2).
- Never patch `contribution_requests.status` from the client. Only the RPCs move it.
- Every `SECURITY DEFINER` function opens with an authorization block; nullable operands in `IF NOT (...)` are wrapped in `COALESCE(..., false)` (`supabase/CLAUDE.md`).
- No blanket `GRANT ALL`. Tables: `SELECT` only to `authenticated`. Internal helpers: `EXECUTE` revoked from `PUBLIC, anon, authenticated`.
- `link` values must start with `/` and not `//` (open-redirect guard, same reason as `notifications`).
- Semantic Tailwind tokens only (`bg-surface`, `text-text-muted`, …). Read `DESIGN.md` and `.claude/skills/ui-design-system/SKILL.md` before Task 6.
- Typecheck with `npm run build`, not `npx tsc --noEmit`.
- No punitive views: no per-person lateness ranking anywhere (spec §4 G, §9).

## Review Focus

1. **Unassigned request + `IF NOT (assignee = auth.uid())` guard** → must deny, not allow. Test: `stranger cannot act on an unowned request` (Task 1).
2. **`not_mine` when the caller is the domain's only steward** → request becomes unowned (assignee null) and shows in the Unowned tab; it must not bounce back to the same person. Test: `not_mine by the steward leaves the request unowned` (Task 1).
3. **Accept when the canonical write fails under RLS** (reviewer lacks edit rights on that row) → request stays `submitted`, error shown, no `done`. Test: `accept does not resolve when the record write fails` (Task 6).
4. **Sweep re-run on the same day / after a fresh import** → no duplicate request same day; a new request only after a newer stale period. Test: `sweep is idempotent and re-arms after a new import` (Task 1).
5. **Prefill value is `null` and the user leaves it blank** → not reported as a change. Test: `changedFields ignores null→empty` (Task 3).

---

### Task 1: Schema, RPCs and sweep

**Files:**
- Create: `supabase/migrations/20261101000001_contribution_requests.sql`
- Create: `scripts/db/contributions.db.test.ts`
- Modify: `scripts/check_security_definer.py` (`EXEMPT` map)

**Interfaces:**
- Produces (SQL):
  - `data_stewards(id uuid pk, domain text, division_code text null, user_id uuid → auth.users, kind text CHECK ('accountable','steward') default 'steward', cadence_days int > 0 default 90, created_at)`, `UNIQUE NULLS NOT DISTINCT (domain, division_code, user_id)`.
  - `contribution_requests(id uuid pk, domain text, record_ref text null, division_code text null, title text, reason text, link text null, requested_by uuid null, assignee_id uuid null, delegate_id uuid null, status text, due_date date null, prefill jsonb default '{}', response jsonb null, dedupe_key text UNIQUE null, created_at, updated_at, resolved_at timestamptz null)`. `requested_by IS NULL` means the sweep raised it.
  - `status CHECK IN ('open','prepared','submitted','needs_clarification','blocked','done','declined')`.
  - `contribution_request_events(id, request_id → contribution_requests ON DELETE CASCADE, actor_id uuid null, action text, from_status text null, to_status text, note text null, payload jsonb, created_at)`.
  - `contribution_steward_for(p_domain text, p_division text) RETURNS uuid` — internal. Division row first, then domain-wide (`division_code IS NULL`); `kind='steward'` before `'accountable'`; then oldest.
  - `contribution_is_reviewer(r contribution_requests) RETURNS boolean` — `r.requested_by = auth.uid()` OR `caller_is_admin()` OR caller has a `data_stewards` row for `r.domain` with `division_code IS NULL OR = r.division_code`.
  - `contribution_request_create(p_domain text, p_record_ref text, p_division text, p_title text, p_reason text, p_link text, p_due date, p_prefill jsonb, p_assignee uuid) RETURNS uuid`
  - `contribution_request_act(p_id uuid, p_action text, p_note text, p_target uuid, p_response jsonb) RETURNS text` (new status)
  - `data_steward_set(p_domain text, p_division text, p_user uuid, p_kind text, p_cadence int) RETURNS uuid` (upsert), `data_steward_remove(p_id uuid) RETURNS void` — admin only.
  - `contribution_requests_sweep() RETURNS integer` — cron-only, scheduled `'45 1 * * *'` as job `contribution-requests-sweep`.

**Transition table** (`contribution_request_act`; any other pair raises `invalid_action: <action> from <status>`):

| action | allowed caller | from | to | side effect |
|---|---|---|---|---|
| `delegate` | assignee | open | open | `delegate_id := p_target` (required, ≠ assignee); notify delegate |
| `submit` | assignee or delegate | open, needs_clarification | delegate → `prepared`; assignee → `submitted` | `response := p_response` (required, object) |
| `confirm` | assignee | prepared | submitted | — |
| `confirm_unchanged` | assignee | open | done | `response := '{}'`, `resolved_at := now()` |
| `clarify` | assignee or delegate | open, prepared | needs_clarification | note required; notify requester (skip if null) |
| `answer` | reviewer | needs_clarification | open | note required; notify assignee |
| `not_mine` | assignee | open, needs_clarification | open | `assignee := contribution_steward_for(...)`, set to NULL if that equals caller; `delegate := NULL`; notify new assignee |
| `cannot_provide` | assignee | open, needs_clarification | blocked | note required; notify requester |
| `accept` | reviewer | submitted | done | `resolved_at`; notify assignee "Your update was accepted" |
| `return` | reviewer | submitted | open | note required; notify assignee |
| `withdraw` | reviewer | any except done, declined | declined | note required |
| `claim` | admin or domain steward | open with assignee NULL | open | `assignee := coalesce(p_target, auth.uid())` |

Every successful action inserts one `contribution_request_events` row (`actor_id = auth.uid()`, `from_status`, `to_status`, `note`, `payload = p_response`).
Notifications: insert into `public.notifications` with `kind='contribution'`, `link='/work?r=' || id`, `dedupe_key = 'contribution:' || id || ':' || <event id>`.

- [ ] **Step 1: Write the failing DB test** `scripts/db/contributions.db.test.ts`, copying the fixture style of `scripts/db/awp.db.test.ts` (`migratedDb`, `as`, `rpc`, `one`). Users: `admin` (MasterAdmin), `steward` (steward of `equipment`, domain-wide, cadence 30), `hod` (HOD of `IMD`, staff row in `IMD`), `owner`, `deleg`, `stranger`. Tests:

```ts
it('hod creates a request routed to the domain steward when no assignee given', …)
  // create('equipment','UI-1','IMD','Confirm AMC date','AMC field empty','/facilities/UI-1',null,{AMCDate:null},null)
  // expect row.assignee_id === U.steward, row.status === 'open', one 'created' event, one notification for steward
it('stranger cannot create a request', …)            // rejects /not_authorized/
it('link must be a relative app path', …)             // p_link 'https://x' and '//x' reject /invalid_link/
it('stranger cannot read or act on a request', …)     // select returns 0 rows; act('confirm_unchanged') rejects /not_authorized/
it('stranger cannot act on an unowned request', …)    // assignee null; act by stranger rejects /not_authorized/
it('delegate submits → prepared; owner confirms → submitted; requester accepts → done', …)
  // events in order: created, delegate, submit, confirm, accept; final resolved_at not null
  // owner has a notification whose title is 'Your update was accepted'
it('confirm_unchanged closes without review', …)      // status 'done', response = {}
it('not_mine by the steward leaves the request unowned', …)  // assignee_id null, status 'open'
it('admin can claim an unowned request for a user', …)
it('clarify needs a note and returns via answer', …)  // clarify with '' rejects /note_required/
it('invalid transition is rejected', …)               // accept on 'open' rejects /invalid_action/
it('client cannot update status directly', …)         // UPDATE contribution_requests SET status='done' rejects (permission denied)
it('sweep is idempotent and re-arms after a new import', …)
  // no import_events for equipment → sweep() = 1, sweep() again = 0
  // insert import_events (equipment, uploaded_at = now() - 31 days) → sweep() = 1 (new dedupe key)
  // insert import_events (equipment, uploaded_at = now()) → sweep() = 0
```

Sweep `dedupe_key = 'stale:' || domain || ':' || coalesce(division_code,'*') || ':' || coalesce(<latest import id>::text,'none')`. A domain is stale when it has no import or the latest is older than `cadence_days`. Run it only for `kind='steward'` rows. Title `'Refresh ' || domain || ' data'`, link `'/data'`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run scripts/db/contributions.db.test.ts`
Expected: FAIL — `function public.contribution_request_create(...) does not exist`.

- [ ] **Step 3: Write the migration.** Section order, as in `20261020000001_notifications.sql`: tables + indexes (`(assignee_id, status)`, `(delegate_id, status)`, `(domain, division_code)`), `set_updated_at` trigger, RLS `SELECT` policies, grants, helpers, RPCs, sweep, `cron.schedule`, closing `DO $$` assert block.
  - `contribution_requests` `SELECT` policy: `requested_by = auth.uid() OR assignee_id = auth.uid() OR delegate_id = auth.uid() OR contribution_is_reviewer(contribution_requests) OR caller_is_director() OR (caller_is_div_manager() AND caller_in_division(division_code))`.
  - `contribution_request_events` `SELECT`: `EXISTS` the parent request is readable (sub-select on `contribution_requests`, which applies its RLS).
  - `data_stewards` `SELECT`: `true` for `authenticated` (ownership is non-PII operational metadata, same tier as `import_events`).
  - `contribution_request_create` authz: `caller_is_admin() OR caller_is_director() OR (caller_is_div_manager() AND caller_in_division(p_division)) OR EXISTS steward row for p_domain`. Validate `p_domain` in the domain list, `btrim(p_title) <> ''`, link rule.
  - Grants: `REVOKE ALL … FROM PUBLIC, anon, authenticated` on the three tables, `GRANT SELECT … TO authenticated`, `GRANT ALL … TO service_role`. Revoke `EXECUTE` on `contribution_steward_for` and `contribution_requests_sweep` from `PUBLIC, anon, authenticated`; grant sweep to `service_role`. Grant the four client RPCs to `authenticated` only.
  - Assert block raises if `authenticated` has `INSERT`/`UPDATE` on `contribution_requests`, or `EXECUTE` on the sweep.

- [ ] **Step 4: Add `EXEMPT` entries** in `scripts/check_security_definer.py`: `"contribution_steward_for": "internal resolver; EXECUTE revoked from client roles"`, `"contribution_requests_sweep": "cron-only; EXECUTE revoked from client roles"`.

- [ ] **Step 5: Run checks**

Run: `npx vitest run scripts/db/contributions.db.test.ts` → all PASS.
Run: `python scripts/check_security_definer.py` → exit 0.
Run: `npm test` → no new failures.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261101000001_contribution_requests.sql scripts/db/contributions.db.test.ts scripts/check_security_definer.py
git commit -m "feat(data-ops): contribution requests, data stewards and stale-domain sweep"
```

---

### Task 2: Types, mappers, client API, shared record write

**Files:**
- Modify: `src/types/index.ts`, `src/utils/dataMapper.ts`, `src/components/EntityEditModal.tsx`
- Create: `src/lib/contributions/api.ts`, `src/lib/data/entityWrite.ts`
- Test: `src/utils/dataMapper.test.ts` (add cases; create the file if absent)

**Interfaces:**
- Consumes: Task 1 SQL names.
- Produces:
  ```ts
  export type ContributionStatus = 'open'|'prepared'|'submitted'|'needs_clarification'|'blocked'|'done'|'declined';
  export type ContributionAction = 'delegate'|'submit'|'confirm'|'confirm_unchanged'|'clarify'|'answer'
    |'not_mine'|'cannot_provide'|'accept'|'return'|'withdraw'|'claim';
  export interface ContributionRequest { id: string; domain: FileType; recordRef: string|null; divisionCode: string|null;
    title: string; reason: string; link: string|null; requestedBy: string|null; assigneeId: string|null;
    delegateId: string|null; status: ContributionStatus; dueDate: string|null;
    prefill: Record<string, unknown>; response: Record<string, unknown>|null; createdAt: string; resolvedAt: string|null; }
  export interface DataSteward { id: string; domain: FileType; divisionCode: string|null; userId: string;
    kind: 'accountable'|'steward'; cadenceDays: number; }
  ```
  - `mapContributionRow(row: any): ContributionRequest`, `mapStewardRow(row: any): DataSteward` in `dataMapper.ts`.
  - `api.ts` (pattern of `src/lib/partnerships/write.ts`, `WriteResult`):
    `createContributionRequest(input: { domain; recordRef; divisionCode; title; reason; link; dueDate; prefill; assigneeId }): Promise<WriteResult & { id?: string }>`,
    `actOnContributionRequest(id: string, action: ContributionAction, opts?: { note?: string; target?: string; response?: Record<string, unknown> }): Promise<WriteResult>`,
    `setDataSteward(domain: FileType, divisionCode: string|null, userId: string, kind: DataSteward['kind'], cadenceDays: number): Promise<WriteResult>`,
    `removeDataSteward(id: string): Promise<WriteResult>`.
  - `entityWrite.ts`: `updateEntityRecord(type: FileType, pkValue: unknown, patch: Record<string, unknown>): Promise<WriteResult>` — `supabase.from(TABLE_NAMES[type]).update(patch).eq(PK_FIELD[type], pkValue)`. Move `PK_FIELD` here and re-export from `EntityEditModal.tsx` so existing imports keep working.

- [ ] **Step 1: Write the failing mapper test**: `mapContributionRow` maps `record_ref → recordRef`, `null prefill → {}`, keeps `response: null`; `mapStewardRow` maps `cadence_days → cadenceDays`.
- [ ] **Step 2: Run** `npx vitest run src/utils/dataMapper.test.ts` → FAIL (not exported).
- [ ] **Step 3: Implement** types, mappers, `api.ts`, `entityWrite.ts`; switch the update branch in `EntityEditModal.handleSave` to `updateEntityRecord` (throw on `ok: false` to keep its current error flow).
- [ ] **Step 4: Run** `npx vitest run src/utils/dataMapper.test.ts` → PASS; `npm run build` → exit 0.
- [ ] **Step 5: Commit** `feat(data-ops): contribution request types, mappers and client API`.

---

### Task 3: Pure request logic

**Files:**
- Create: `src/lib/contributions/state.ts`, `src/lib/contributions/state.test.ts`

**Interfaces:**
- Consumes: Task 2 types.
- Produces:
  - `isReviewer(r: ContributionRequest, userId: string, roles: Role[], stewards: DataSteward[]): boolean` — mirrors SQL `contribution_is_reviewer` (admin = any of `HRAdmin`, `SystemAdmin`, `MasterAdmin`, matching `DATA_ADMINS`).
  - `availableActions(r: ContributionRequest, userId: string, reviewer: boolean, canClaim: boolean): ContributionAction[]` — mirrors the Task 1 transition table exactly. UI hint only; the server is the gate.
  - `changedFields(prefill: Record<string, unknown>, response: Record<string, unknown>): { field: string; from: unknown; to: unknown }[]` — `null`, `undefined` and `''` count as equal; values compared as trimmed strings.
  - `inboxBucket(r: ContributionRequest, userId: string, reviewer: boolean): 'todo'|'review'|'unowned'|'done'|null`.

- [ ] **Step 1: Write failing tests**:
  ```ts
  it('assignee on open sees delegate, submit, confirm_unchanged, clarify, not_mine, cannot_provide')
  it('delegate on open sees submit and clarify only')
  it('reviewer on submitted sees accept, return, withdraw')
  it('stranger sees nothing')
  it('canClaim shows claim only when assignee is null')
  it('changedFields ignores null→empty')        // ({AMCDate:null},{AMCDate:''}) → []
  it('changedFields reports a real edit')       // ({Status:'Working'},{Status:'Down'}) → [{field:'Status',from:'Working',to:'Down'}]
  it('inboxBucket: done and declined → done; submitted for reviewer → review; null assignee → unowned')
  ```
- [ ] **Step 2: Run** `npx vitest run src/lib/contributions/state.test.ts` → FAIL.
- [ ] **Step 3: Implement** the four functions.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(data-ops): pure contribution request rules`.

---

### Task 4: Load into DataContext and surface in My Actions

**Files:**
- Modify: `src/contexts/DataContext.tsx`, `src/lib/dashboard/myActions.ts`, `src/lib/dashboard/myActions.test.ts`, `src/components/MyActions.tsx`

**Interfaces:**
- Consumes: Task 2 mappers.
- Produces: `useData()` gains `contributionRequests: ContributionRequest[]`, `dataStewards: DataSteward[]`, `refreshContributions(): Promise<void>`. `MyAction.kind` gains `'contribution'`; `MyActionsInput` gains `contributions: ContributionRequest[]`.

- [ ] **Step 1: Write failing tests** in `myActions.test.ts`:
  ```ts
  it('lists an open request assigned to me with link /work?r=<id> and its due date')
  it('lists a request where I am the delegate')
  it('lists a submitted request I requested as "Update awaiting your review"')
  it('omits done, declined and blocked requests')
  ```
- [ ] **Step 2: Run** `npx vitest run src/lib/dashboard/myActions.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Labels: assignee/delegate → `'Data request'`, detail = `title`; requester with `submitted` → `'Update awaiting your review'`. In `DataContext` add both tables to the `Promise.all` loader (always loaded; RLS scopes rows) and to the per-table error check. `refreshContributions` re-fetches only these two tables. Add `contribution: { label: 'Request', variant: 'info' }` to `KIND_BADGE`.
- [ ] **Step 4: Run** the test → PASS; `npm run build` → exit 0.
- [ ] **Step 5: Commit** `feat(data-ops): contribution requests in My Actions`.

---

### Task 5: Request-update button on record pages

**Files:**
- Create: `src/components/RequestUpdateButton.tsx`, `src/components/RequestUpdateButton.test.tsx`
- Modify: `src/pages/ProjectDetail.tsx`, `src/pages/InstrumentDetail.tsx`

**Interfaces:**
- Consumes: `createContributionRequest`, `FIELD_META` from `src/utils/dataMigration.ts`, `useDialog`.
- Produces: `RequestUpdateButton({ domain: FileType; recordRef: string; divisionCode: string | null; record: Record<string, unknown>; defaultTitle: string })`.

Behaviour: a `Button` opening the existing `Modal` (`src/components/ui/Modal.tsx`) with Title (prefilled `defaultTitle`), Reason (required), Due date (`<input type="date">`), Assign to (existing `UserPicker` from `src/components/ui/UserPicker.tsx`; empty = "Route to data steward"). On submit: `prefill` = the record's `FIELD_META[domain]` columns; `link` = current hash path. On success: toast "Request sent", `refreshContributions()`. Shown only when the user's roles include `Director`, `DivisionHead`, `HOD`, an admin role, or a steward row for the domain (hint only; the RPC decides).

- [ ] **Step 1: Write failing test** (React Testing Library, mock `api.ts`): submitting calls `createContributionRequest` with `domain: 'equipment'`, the record ref, `assigneeId: null`, and `prefill` holding exactly the `FIELD_META.equipment` columns; empty Reason blocks submit with "Reason is required".
- [ ] **Step 2: Run** `npx vitest run src/components/RequestUpdateButton.test.tsx` → FAIL.
- [ ] **Step 3: Implement**; place it in the header action row of `ProjectDetail` (domain `projects`, ref `ProjectID`) and `InstrumentDetail` (domain `equipment`, ref `UInsID`).
- [ ] **Step 4: Run** → PASS; `npm run build` → exit 0.
- [ ] **Step 5: Commit** `feat(data-ops): request an update from project and instrument pages`.

---

### Task 6: My Work page

**Files:**
- Create: `src/pages/MyWork.tsx`, `src/pages/MyWork.test.tsx`
- Modify: `src/App.tsx`, `src/constants/access.ts`, `src/constants/access.test.ts`, `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `useData()` (Task 4), `availableActions`, `inboxBucket`, `isReviewer`, `changedFields` (Task 3), `actOnContributionRequest`, `updateEntityRecord` (Task 2), `FIELD_META`.
- Produces: route `/work`; `ACCESS_MAP['/work'] = VERIFIED`; Sidebar Overview item `{ path: '/work', label: 'My Work', icon: Inbox }` after Dashboard.

Layout (DESIGN.md tokens; mobile = list, then panel full width):
- Tabs (existing `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` from `src/components/ui/Tabs.tsx`): **To do**, **To review**, **Unowned** (only when the user is admin or a steward), **Done**. Counts on each. Empty state uses `<EmptyState>`. Person pickers use `UserPicker`.
- Selected request from `?r=<id>` (HashRouter query). Not found → inline "Request not found or not shared with you" + back link.
- Panel: title, reason, who asked ("SURYA data check" when `requestedBy` is null), due, "Open record" link, event history (fetch `contribution_request_events` for this id via a function in `api.ts`: `listRequestEvents(id): Promise<ContributionEvent[]>`).
- **Update form** for `submit`: one row per prefill field — label from `FIELD_META`, "Current" value (+ "as of" = request `createdAt`), editable "New" input. Before/after summary from `changedFields` shown before sending.
- **Review view** for `accept`: table of `changedFields(prefill, response)`. Accept → if changes and `recordRef`: `updateEntityRecord(domain, recordRef, patch)` first; on `ok: false` show its error and stop; then `actOnContributionRequest(id,'accept')`.
- Note box shown for actions that need a note (`clarify`, `answer`, `cannot_provide`, `return`, `withdraw`); `delegate`/`claim` show a person picker (linked staff).
- After any action: `refreshContributions()` and toast.

- [ ] **Step 1: Write failing tests** (mock `useData`, `api.ts`, `entityWrite.ts`):
  ```ts
  it('shows only To do items for an assignee and opens ?r=<id>')
  it('submit sends only changed fields as response')               // response = {Status:'Down'}
  it('accept writes the record then resolves the request')        // updateEntityRecord called before act('accept')
  it('accept does not resolve when the record write fails')       // updateEntityRecord → {ok:false,error:'permission denied'}; act not called; error text shown
  it('hides the Unowned tab for a plain scientist')
  ```
  And in `access.test.ts`: `'/work'` is reachable by every `VERIFIED` role and not by `DefaultUser`.
- [ ] **Step 2: Run** `npx vitest run src/pages/MyWork.test.tsx src/constants/access.test.ts` → FAIL.
- [ ] **Step 3: Implement** page, route (`<ProtectedRoute accessPath="/work">`), access entry, nav item. Point the `MyActions` "see all" footer link to `/work` when there are more than 8 actions.
- [ ] **Step 4: Run** → PASS; `npm run build` and `npm run lint` → exit 0.
- [ ] **Step 5: Commit** `feat(data-ops): My Work inbox for contribution requests`.

---

### Task 7: Stewardship on the Data Management ledger

**Files:**
- Modify: `src/components/DataFreshnessLedger.tsx`, `src/components/DataHealthDigest.tsx`, `src/lib/divisions/uploadFreshness.ts`, `src/lib/divisions/uploadFreshness.test.ts`

**Interfaces:**
- Consumes: `dataStewards`, `staff`, `setDataSteward`, `removeDataSteward`, `contributionRequests`.
- Produces: `DomainUpload` gains `owners: DataSteward[]` and `ownerStatus: 'owned' | 'no-owner'`; `domainUploadLedger(events, stewards, now?)` — `cadenceDays` = smallest `cadenceDays` among that domain's steward rows, else the existing `CADENCE_DAYS` default.

UI: new "Owner" column. Owner names from `staff.find(s => s.user_id === steward.userId)?.Name ?? 'Unlinked login'`. **"No owner"** badge is a separate visual from the Fresh/Stale/Urgent status (spec §4 C: missing owner ≠ missing data). Admins (`DATA_ADMINS`) see "Assign owner" (person picker over linked staff + kind + cadence) and remove. Below the table: "Unowned requests: N" linking to `/work` Unowned tab.

- [ ] **Step 1: Write failing tests** in `uploadFreshness.test.ts`:
  ```ts
  it('marks a domain with no steward rows as no-owner')
  it('uses the steward cadence over the default')   // equipment steward cadence 30, last upload 40 days ago → 'stale'
  ```
- [ ] **Step 2: Run** `npx vitest run src/lib/divisions/uploadFreshness.test.ts` → FAIL.
- [ ] **Step 3: Implement**; update both existing callers to pass `dataStewards`: `src/components/DataFreshnessLedger.tsx:42` and `src/components/DataHealthDigest.tsx:32`. Person picker = `UserPicker`.
- [ ] **Step 4: Run** → PASS; `npm test`, `npm run build`, `npm run lint` → exit 0.
- [ ] **Step 5: Commit** `feat(data-ops): data stewards on the freshness ledger`.

---

### Task 8: Docs and live apply

**Files:**
- Modify: `docs/engineering/database_design.md` (3 tables), `docs/engineering/api_spec.md` (4 RPCs), `docs/engineering/system_design.md` (request state machine = Task 1 table), `docs/engineering/FEATURES.md`, `docs/engineering/access_matrix.md` (`/work`), `docs/roadmap/ROADMAP.md` (mark WP-5 C as covered by this plan), `CLAUDE.md` Health Stack test count.

- [ ] **Step 1: Update the docs** listed above.
- [ ] **Step 2: Run** `npm test` and note the new file/test count in `CLAUDE.md`.
- [ ] **Step 3: Apply to the live project** — only with the user's go-ahead: `supabase db push`. Expected: `20261101000001_contribution_requests` applied. (Free project may be paused; resume it in the Dashboard first.)
- [ ] **Step 4: Smoke-test in the app**: as an HOD, open an instrument → Request update → sign in as the steward → `/work` shows it → submit a change → as HOD accept → instrument shows the new value and the steward's bell says "Your update was accepted".
- [ ] **Step 5: Commit** `docs(data-ops): contribution requests across the engineering suite`.

---

## Deliberately skipped (add when the pilot asks)

- Snooze-with-reason (spec §4 B) — `blocked` + `cannot_provide` covers "not now" for the pilot.
- Batch review of many rows in one session (§4 B) — add after Phase 0 names a steward with real bulk volume.
- Effort estimate per request — no data to estimate from yet.
- Request generators beyond stale-domain (missing evidence, report dates) — Phase 2 business cases raise evidence requests; report dues already notify via `notifications_sweep()`.
- Email delivery — WP-2 D1 reads `notifications`, so requests get email for free when D1 ships.
