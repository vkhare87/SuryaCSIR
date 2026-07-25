# Architecture Remediation Plan

**Origin:** full-application security + design audit, 2026-07-25.
**Status of this document:** the bug-fix pass (migrations `20260725000001`,
`20260725000002` and the accompanying app changes) is **done**. Everything
below is what those fixes exposed but deliberately did *not* attempt, ordered
by how much risk each one retires per unit of work.

The audit's central finding was not any single bug. It was that **SURYA has
three parallel authorization systems that do not agree with each other**:

| Layer | Enforces | Consulted by |
|---|---|---|
| `ACCESS_MAP` + `ProtectedRoute` | which pages a role may open | the browser only |
| RLS policies | which rows a role may read/write | Postgres, always |
| `SECURITY DEFINER` RPCs | nothing, in 3 of 4 helpdesk cases | Postgres, always — **bypassing RLS** |

Every HIGH finding was a place where those three disagreed. The work below is
about collapsing them toward one.

---

## A1 — Make the RPC layer an authorization boundary, not a hole

**Why.** `SECURITY DEFINER` runs as the function owner, so RLS does not apply.
That is the correct tool for atomic state transitions, and SURYA uses it
correctly for PMS. But `helpdesk_update_status`, `helpdesk_assign_ticket` and
`helpdesk_create_ticket` shipped with *no* authorization check and a
client-supplied actor id, while `helpdesk_add_response` — same file, same
migration — had the right check. That is not a design stance, it is an
omission that nothing could catch.

**Done in this pass:** all three now pin the actor to `auth.uid()` and port
the rules from `src/lib/helpdesk/permissions.ts` into SQL.

**Still to do.**
1. Audit the remaining `SECURITY DEFINER` surface the same way. `grep -c
   'SECURITY DEFINER' supabase/migrations/*.sql` is ~40 functions; PMS and
   proposals were spot-checked and look correct, but "looks correct" is what
   was said about helpdesk.
2. Add a CI grep that fails when a `SECURITY DEFINER` function body contains
   no reference to `auth.uid()`, `user_has_role`, `caller_is_`, or
   `proposals_caller_`. Crude, but it makes the omission class impossible to
   reintroduce silently.
3. Establish the convention in `CLAUDE.md`: **every SECURITY DEFINER function
   opens with an authz block. No exceptions, no "the UI gates it".**

**Effort:** 1–2 days for the audit, an hour for the CI check.

---

## A2 — Stop composing the whole institute in the browser

**Why.** `DataContext.tsx` issues **28 unbounded `select('*')` queries on
every login, for every role**, then every page filters and aggregates in
`useMemo`. Three consequences, in increasing order of severity:

- **Silent truncation.** There is no `.limit()`, no `.range()`, and no count
  check anywhere in the file. When any table crosses PostgREST's `db-max-rows`,
  analytics quietly go wrong — no error, just smaller numbers.
- **Load time scales with institute size**, not with what the page shows.
- **RLS becomes the only thing between a `Guest` and 28 full tables.** That is
  a fine invariant when RLS is correct. HIGH-3 and MED-10 are what it costs
  when RLS is not: the client asked for everything, and got it.

**Direction.** Push aggregation into Postgres. Per-page fetches instead of a
god-context. Concretely:

1. Start with the dashboards — they are the heaviest consumers and the most
   aggregate-shaped. One `SECURITY INVOKER` view or RPC per dashboard section,
   returning the numbers the cards actually render. RLS still applies, so the
   security model is unchanged.
2. Then the analytics pages (`/staff/analytics`, `/intelligence`,
   `DivisionsAnalytics`, `FacilitiesAnalytics`).
3. `DataContext` shrinks to genuinely cross-cutting reference data
   (divisions, the staff roster used by pickers) with explicit limits.

**Do not** do this as one big-bang refactor. Page at a time, behind the
existing `useData()` interface where possible.

**Effort:** large — several weeks, incremental. Highest performance payoff of
anything here.

---

## A3 — One identity, one namespace

**Why.** The schema had three interchangeable notions of "who": `staff."ID"`
(text), `auth.users.id` (uuid), and `divisions."divHoDID"` (text referencing
staff). None were FK-constrained. `route_ticket` returned two of them into the
same column (B1). Every self-scoping RLS predicate resolved the caller by
matching an unconstrained, HRAdmin-editable email column and then comparing
**display names**, so two staff sharing a name saw each other's rows (MED-9).

**Done in this pass:** `staff.user_id uuid REFERENCES auth.users(id)` with a
conservative backfill (unambiguous email matches only — deliberately leaving
duplicates NULL for HR rather than guessing). `caller_staff_name()` resolves
through the verified link first. `staff_select` self-scopes on `user_id`, not
a name string. All ticket actor columns normalised to auth uuids, with the
convention recorded in `COMMENT ON COLUMN`.

**Still to do (A3b).** The *relational* predicates still compare names,
because the target columns store names:

```sql
"PrincipalInvestigator" = public.caller_staff_name()
"SupervisorName"        = public.caller_staff_name()
ps."StaffName"          = public.caller_staff_name()
```

No amount of caller-side work fixes this — the columns themselves need to
become FKs to `staff."ID"`. That is a coordinated migration + `dataMapper` +
`dataMigration` change, and it collides with the "HR column casing mirrors
source Excel" debt already recorded in `CLAUDE.md`. Sequence it with that.

**Also pending:** an HR reconciliation UI for `staff` rows the backfill left
`user_id IS NULL` (duplicate or missing emails). Until then those users fall
back to the old email match — same behaviour as before, no regression, but
the leak is not fully closed for them.

**Effort:** A3b is 3–5 days and needs a data-quality pass first.

---

## A4 — Foreign keys instead of conventions

**Why.** B1 was discoverable only by reading two functions and a client file
side by side. The database would have rejected it instantly if the columns
were typed.

**Direction.** `tickets.submitted_by`, `tickets.assigned_to`,
`ticket_responses.author_id`, `ticket_events.actor_id` are now documented as
auth uuids — convert them from `text` to `uuid REFERENCES auth.users(id)`.
`ticket_events.actor_id` needs the literal `'system'` sentinel replaced with
`NULL` first.

This is deferred rather than done because it is a type change on live columns
with a client-side type change to match, and it should land after the data has
been observed clean post-`20260725000002`.

**Effort:** 1 day, once the normalised data has been verified in staging.

---

## A5 — The RAG corpus is a curated store, not an open inbox

**Why.** HIGH-4 and HIGH-5 were the same defect approached from two
directions: anything reaching `documents` with `ingest_status='pending'`
became authoritative institute knowledge with no review gate. From inside,
`documents_insert` let any authenticated user pick their own `access_tier`.
From outside, the mail-in worker landed unmapped senders' attachments at
`'institute'` under the service-role key.

**Done in this pass:** non-admins may only self-register at `owner` /
`confidential`; tier promotion is an audited admin RPC
(`documents_set_access_tier`). The ingest worker fails closed on unmapped
senders and lands harvested files at `division`/`confidential`, never
`institute`.

**Still to do.**
1. **A review queue.** Right now an admin has to know a document exists to
   promote it. `/admin/rag` should list `access_tier IN ('owner','confidential')
   AND entity_type = 'harvested'` as a work queue.
2. **Attachment allowlist at the boundary.** `rag/parse.py` feeds
   attacker-influenced bytes to PyMuPDF and the OCR path. An extension + size
   allowlist in `ingest/classify.py` costs nothing and bounds what reaches
   native code.
3. **Mail-in ack-after-land**, already tracked in `TODOS.md` — `scan_mailbox`
   marks `\Seen` before `land_file` confirms, so an outage drops the mail.
   Worth doing at the same time as (2), same file.

**Effort:** 2–3 days.

---

## A6 — Make the design system enforceable

**Why.** `npx eslint src/` reports **0 errors and 1083 warnings**, all
`no-restricted-syntax` design-token violations across 88 files. The rule
exists, fires correctly, and is configured as `warn` — so CI never fails and
the drift is unbounded. A rule nobody can act on is not a rule.

Separately, `DESIGN.md` documents five adopted risks as decided; the code
implements roughly one and a half of them:

| Risk | Documented | Actual |
|---|---|---|
| R1 Fraunces display type | adopted | **not implemented** — no font link in `index.html`, no `Fraunces` in the codebase |
| R2 expanded ink palette | adopted | partial — `--color-archive-green` / `--color-turmeric` exist; `--color-iron-gall` never landed |
| R3 `<StatusSeal>` | adopted | **not implemented** — component does not exist |
| R5 sentence-first greeting | adopted | not verified |
| R6 ledger tables | adopted | partial |

**Direction.**
1. Flip the lint rule to `error` with a per-file allowlist seeded from today's
   88 files, and shrink the allowlist. Append-only-then-shrink, the same
   ratchet the migrations directory already uses.
2. Either implement R1/R3 or move them back to "proposed" in `DESIGN.md`. A
   design doc that overstates what shipped is worse than no design doc,
   because the next session reads it as ground truth.
3. Fix `src/index.css:28-29` — `--color-archive-green: var(--color-archive-green);`
   is a self-referential `@theme` alias that resolves only by cascade accident.

**Effort:** ratchet is half a day. R1 is a font link plus a CSS variable. R3
is a component plus its PDF fallback — 1–2 days.

---

## A7 — Test the policies, not just the pure functions

**Why.** 588 tests, 59 files, all green — and **not one of them could have
caught any finding in this audit**, because they cover pure TypeScript and
every bug lived in SQL or in the gap between SQL and the client.

**Done in this pass:** `supabase/tests/rls_negative.sql` — 12 negative-path
assertions, one per finding, each describing an attack that worked before the
fixes. See `supabase/tests/README.md`.

> **Caveat, stated plainly:** this script has **not been executed**. Neither
> the Supabase CLI nor Docker is available in the environment it was written
> in, and the migrations have not been pushed to any database. It is written
> against the documented behaviour of the schema, not verified against a
> running one. **Run it before trusting it**, and expect to fix syntax on the
> first pass.

**Still to do.**
1. Run it. Fix whatever it gets wrong.
2. Add a `db` job to `.github/workflows/ci.yml`: `postgres` service container,
   apply `supabase/migrations/*` in order, apply `supabase/seed/*`, run the
   script with `-v ON_ERROR_STOP=1`. This is the single highest-leverage
   addition for enterprise readiness — it converts the entire class of bug
   found here from "discovered by audit" to "discovered by CI".
3. Add a positive-path counterpart so a policy tightened too far is caught
   too: the assigned handler *can* progress their ticket, an evaluator *can*
   read their assigned report.

**Effort:** 2–3 days including CI wiring.

---

## A8 — Auth controls that live in the Supabase dashboard, not in code

Three settings that no migration can set and that the audit's fixes depend on:

1. **Require current password for password update.** MED-6 was fixed
   client-side (`ChangePassword.tsx` now demands the current password
   unconditionally and re-authenticates before calling `updateUser`). But
   `supabase.auth.updateUser({password})` does not require reauth server-side
   by default — a stolen JWT can still call it directly, bypassing the form.
   Enable GoTrue's secure-password-change setting to close it properly.
   **This is the one item on this list that leaves a live hole until done.**
2. **Leaked-password protection** (HaveIBeenPwned check) and a password
   minimum above the current client-side 8 characters.
3. **Confirm the RLS scoping migration is actually applied.** A prior session
   recorded that `20260718000001_rls_scope_reads.sql` was written but never
   `db push`ed to the live project. If that is still true, every HR read is
   globally open in production and several findings above are moot because
   nothing is scoped at all. Run `supabase migration list` against the live
   project before anything else.

**Effort:** an hour, mostly clicking. Do it first.

---

## Suggested sequence

| Order | Item | Status |
|---|---|---|
| 1 | **A8.3** — verify migrations applied | ⚠️ **operator only** — needs the live project |
| 2 | **A8.1** — GoTrue secure password change | ✅ codified in `supabase/config.toml`; needs `supabase config push` |
| 3 | **A7.1–2** — run the RLS tests, wire CI | ✅ CI `db` job added · ⚠️ never executed |
| 4 | **A5.1–2** — RAG review queue + allowlist | ✅ done |
| 5 | **A1.2–3** — SECURITY DEFINER audit + CI grep | ✅ done — found and fixed 3 |
| 6 | **A6.1** — lint ratchet | ✅ done |
| 7 | **A4** — FK conversion | ✅ migration written, guarded · ⚠️ unapplied |
| 8 | **A3b** — name columns → FKs | ✅ done (fallback until `staff_link_gaps` is empty) |
| 9 | **A2** — data layer | ◐ truncation fixed; aggregate pushdown ongoing |
| 10 | **A6.2** — reconcile DESIGN.md with reality | ✅ done |

---

## What the 2026-07-25 implementation pass changed

Migrations `20260725000003`–`20260725000005`, plus app/tooling changes.
**None of the migrations have been applied to any database** — see the
caveats at the end.

- **A8** — `supabase/config.toml` now exists. GoTrue settings (`secure_password_change`,
  `minimum_password_length = 12`, `password_requirements`, signup policy,
  token lifetimes) were dashboard-only clicks; they are version-controlled and
  reviewable now. `src/lib/auth/passwordPolicy.ts` mirrors them client-side so
  the UI can name the failing rule. `supabase/ops/README.md` documents that
  `supabase db push` does **not** apply `[auth]` — `config push` is separate.
- **A7** — CI `db` job boots the Supabase stack, applies migrations + seed, and
  runs both SQL suites plus the SECURITY DEFINER guard. Added
  `supabase/tests/rls_positive.sql` (15 assertions) as the counterweight to the
  negative suite — otherwise the cheapest way to pass every negative test is to
  deny everything.
- **A5** — harvested-document review queue on `/admin/rag` with an audited
  promote action; extension + size allowlist in `ingest/classify.py` before
  bytes reach PyMuPDF/OCR (double extensions refused); `scan_mailbox` restructured
  into a `Mailbox` context manager so `\Seen` is set only when nothing about a
  message is worth retrying — a Storage outage no longer consumes the mail.
- **A1** — `scripts/check_security_definer.py`. Its first run flagged 5 of 47
  functions; 2 were legitimately triggers, and **3 were real**:
  `route_ticket`, `pms_committee_panel_valid`, `pms_empowered_committee_valid`
  were directly callable by any authenticated user with RLS bypassed.
  `route_ticket` in particular let anyone enumerate which account holds
  HRAdmin or SystemAdmin. `20260725000003` revokes EXECUTE. Two of the five
  were in code written earlier the same day — the guard works.
- **A6.1** — design rules are `error` outside `eslint.design-debt.json` (107
  files). `scripts/update-design-debt.mjs` refuses to grow the list.
- **A4** — `20260725000004` converts the four ticket actor columns to
  `uuid REFERENCES auth.users(id)` and retires the `'system'` sentinel to NULL.
  **It aborts rather than converting on dirty data** — nulling unconvertible
  values would erase who raised or answered a grievance.
- **A3b** — `20260725000005` adds staff-keyed columns beside each name column,
  backfills only unambiguous matches, and rewrites the policies to prefer the
  key with a name fallback where the key is NULL. `staff_link_gaps` reports
  what HR still has to reconcile; **the leak is fully closed only when that
  view is empty**. A trigger keys new imports automatically so an upload does
  not reopen the gap.
- **A2** — `src/lib/data/fetchAll.ts` pages every `DataContext` read. The
  28 unbounded `select('*')` calls were capped at `db-max-rows` silently, so
  analytics would quietly under-report once any table outgrew the cap. Each
  query now carries a stable `.order()` — without one, paging can duplicate
  *and* drop rows.
- **A6.2** — R1 (Fraunces) and R3 (`StatusSeal`) built; `--color-iron-gall`
  added. No font was previously loaded at all, so `'Inter'` and the serif stack
  both rendered as `system-ui`. DESIGN.md now carries an honest status table.

### Corrections to the original audit

- **`--color-archive-green: var(--color-archive-green)` is not a bug.** The
  audit called it a fragile copy-paste slip. It is Tailwind 4's `@theme`
  pass-through idiom, identical to `--color-surface` directly below it, and it
  is how the per-theme light/dark values resolve. Left as-is.

### Caveats — read before trusting any of this

1. **No migration here has been applied.** Neither the Supabase CLI nor Docker
   was available. `20260725000001`–`20260725000005` are written against the
   documented schema, not executed against a running one.
2. **`rls_negative.sql` / `rls_positive.sql` have never run.** Expect to fix
   syntax on the first pass. They are the CI job's whole point, so run them
   before relying on the job being meaningful.
3. **Verified instead:** `npm run build`, `npx eslint src/` (0 errors),
   621 vitest tests, 41 ingest tests, 170 rag tests, the SECURITY DEFINER
   guard, the design-debt ratchet, and a live probe confirming all 28
   `DataContext` order columns resolve against the real schema — that probe
   caught a genuine regression (`equipment` ordered by a non-existent `id`;
   its PK is `"UInsID"`).
