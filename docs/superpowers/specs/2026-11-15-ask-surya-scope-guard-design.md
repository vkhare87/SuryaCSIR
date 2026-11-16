# Ask SURYA — scope guard, depth and history (design)

Date: 2026-11-15 · Status: draft for approval · Roadmap home: WP-7 (Ask SURYA experience)

Lines marked **(decided)** are the owner's words. Lines marked **(my call)** are the
author's defaults; the owner has not confirmed them.

## 1. Intent

Ask SURYA answers free-text questions. Today the database (RLS, through the caller's
JWT) is the only lock. It works, but nothing looks at the question itself, a refused
person gets the same "no grounded answer" text as an honest miss, and nobody learns
about repeated probing.

The owner wants an orchestrator, named **SURYA**, that reads every question first and
decides whether it is inside the caller's scope. The role decides most of it.
Sensitive areas named by the owner: **PMS scores, personal details, proposals**.

## 2. Goals

1. Every question passes the guard before any retrieval or analytics. **(decided)**
2. Out of scope → one fixed line: *"This information cannot be retrieved for you."*
   No hint about what exists. **(decided)**
3. Depth follows role: full detail inside your scope, totals only outside it.
   Director: whole lab. Scientist: own work in detail, totals for the rest. **(decided)**
4. More than 5 out-of-scope questions by one person in one day → HRAdmin is notified.
   Nothing else happens to the person. **(decided)**
5. A person can get back to their recent questions, their saved questions and their
   most-used questions. Full transcript saving is not needed. **(decided)**
6. One lab now (AMPRI). The scope carries a `lab` field so WP-17 (multi-lab,
   Headquarters) can fill it later without a redesign. **(decided: option 1)**

## 3. Non-goals

- Multi-lab data, a Headquarters role, cross-lab access. That is WP-17.
- Blocking, locking out or rate-limiting a person. **(decided: "nothing")**
- New data access. The guard only narrows; it never shows what RLS hides.
- A second LLM call per question (see §5.1).

## 4. Anti-goals

- **The guard becoming the security boundary.** RLS stays the lock. The guard is the
  polite front door, the deterrent and the record. A fooled classifier must still
  hit RLS and get nothing.
- **Innocent people reported to HR.** A model mistake must not create a strike.
- **Refusing what RLS allows.** Then the page says "no" to a person who is entitled.

## 5. How it works

### 5.1 Classify — inside the existing router call

`rag/router.py decide()` already makes one LLM call per question and returns
`{route, function, params}`. Extend that same reply with two fields. No extra call:
the CPU host measured 3–4 minutes per question, so a second call is not affordable.

- `topic` — one of a fixed list: `pms_scores`, `personal_details`, `proposals`,
  `projects`, `staff_directory`, `equipment`, `outputs_ip`, `documents`, `general`.
- `subject` — one of: `self`, `other_person`, `division`, `lab`; plus an optional
  `subject_division` code. Code, not the model, compares that code with the
  caller's division.

Validation is the same pattern as today's route check: a value outside the list
becomes `unknown`. The classifier sees the current question, the entity preamble and the
earlier history **questions**. It does not see client-sent history answers (free text an
asker could forge). **(as built — follow-ups like "and for 2024?" need the earlier
questions to route at all.)**

### 5.2 Decide — in code, not in the model

New module `rag/scope.py` (pure, no FastAPI, same reason as `query_service.py`):

```
scope_of(client) -> {roles: set, staff_id, division, lab: "AMPRI"}
verdict(scope, topic, subject) -> "full" | "totals" | "refuse"
```

- `scope_of` reads the caller's held roles, staff link and division through the
  caller's scoped client (existing helpers, e.g. `proposals_caller_division()`).
- **(my call)** Scope is the union of all **held** roles, not only `active_role`.
  RLS already works on held roles; using `active_role` would refuse things RLS
  allows (anti-goal 3).
- `verdict` is a lookup in one table (§6). The table is data in `scope.py`, with one
  unit test per row.
- `unknown` topic or subject → `full` verdict, proceed, RLS decides. **(my call)**
  This is what protects innocent people: only a confident classification can refuse.

### 5.3 Act

In `handle_query` and `stream_query`, right after `decide()`:

| Verdict | Action |
|---|---|
| `refuse` | Return `Answer(SCOPE_REFUSAL_TEXT, ...)`, no retrieval, no analytics. Log with `refusal_reason = 'out_of_scope'`. |
| `totals` | Only the structured route may run, and only catalog functions flagged `aggregate: True`. Document and hybrid routes are refused as above. |
| `full` | Today's behaviour, unchanged. |

`SCOPE_REFUSAL_TEXT = "This information cannot be retrieved for you."` — a new
constant, separate from the existing `REFUSAL_TEXT` (honest "not found").

**As built:** `analytics.AGGREGATE` holds four functions — `patent_pipeline_counts`,
`count_publications_by_division`, `mou_status_summary`, `tech_transfer_summary` — the
counts over tables whose read policy is `true`. Projects, staff, documents, PhD milestones
and the metric registry all count through RLS, so a Scientist's "how many projects" is
refused (`totals_only`, no strike) rather than answered with a partial number.

The builder must check each function in `analytics.CATALOG` before flagging it
`aggregate`: under RLS a count taken with the caller's JWT can be a count of only
the rows that caller may see. A function that would return a wrong total for a
Scientist is **not** flagged; the answer is then a refusal, not a wrong number.

### 5.4 Strikes and the HR notice

No new table. `query_log` already has one row per question with `refusal_reason`.

- A strike = a `query_log` row with `refusal_reason = 'out_of_scope'`. That reason is
  written only when the scope table itself says `refuse`. A `totals` verdict that
  cannot be served (for example "what is Dr. X working on" from a Scientist) shows
  the same fixed line but logs `refusal_reason = 'totals_only'`, which is **not** a
  strike. **(my call — an ordinary question must not report a person to HR.)**
- New cron-only function `ask_scope_sweep()` in a new migration, same pattern as
  `home_overdue_sweep()`: for each user with **more than 5** strikes on the previous
  IST calendar day, one `notifications` row per HRAdmin. `dedupe_key =
  'ask-scope:' || user_id || ':' || day`, so one notice per person per day.
- The sweep runs daily at 07:00 IST, so HR hears the next morning. **(my call —
  simplest; an instant notice needs a new RPC and is not asked for.)**
- **(my call)** The notice carries the person's name, the day and the count. It does
  **not** carry the question text. Question text stays readable by SystemAdmin and
  MasterAdmin only, as today.
- **(my call)** The Ask SURYA page shows one fixed line: "Out-of-scope requests are
  recorded." Fair warning, and a deterrent.

**Must fix in the same migration:** `query_log_owner_update` lets an owner update
their own row and no column grant narrows it. A person could blank their own
`refusal_reason` and erase strikes. Narrow `UPDATE` for `authenticated` to
`(feedback, pinned)` only, and assert it, the way `notifications` does.

### 5.5 History

No new table. `query_log` is already owner-readable.

- **Recent** — last 10 distinct questions of the caller, newest first, no date bound.
- **Most used** — top 5 questions of the caller by count, last 90 days.
- **Saved** — new column `query_log.pinned boolean NOT NULL DEFAULT false`. The
  person pins a past question. Limit 20 pins per person, enforced in the UI.
  `ponytail:` a column, not a shortcuts table; move to a table if labels or sharing
  are ever asked for.
- A click puts the question text back in the box and **asks it fresh**. The page
  never replays a stored answer. So a person who loses a role cannot read old
  answers from the history panel. **(my call)**
- Rows with `refusal_reason = 'out_of_scope'` do not appear in any of the three lists.
- Note for the owner: `query_log` does already store answers (for feedback and the
  admin RAG monitor). This design does not change that. It only keeps them out of
  the history panel.

UI: a side panel on `src/pages/AskSurya.tsx`, three short lists. Data through
`src/lib/ask/client.ts`, where `sendFeedback` and `scheduleBrief` already live (the
page itself makes no Supabase call). Read `DESIGN.md`
and the `ui-design-system` skill first.

## 6. The scope table — DRAFT, the owner must check this

`full` = named detail. `totals` = counts and sums only. `refuse` = the fixed line.
`self` questions on one's own records are always `full` for every verified role.

**Staff directory** (name, designation, division) is `full` for every verified role.
**(decided)** It is not "personal details". Personal details = everything else on a
staff record (date of birth, contact, pay, category, service history).

| Role group | PMS scores (others) | Personal details (others) | Proposals (others) | Projects, equipment, outputs |
|---|---|---|---|---|
| Director, MasterAdmin | full, whole lab | full, whole lab | full, whole lab | full, whole lab |
| EmpoweredCommittee | full, whole lab | refuse | refuse | totals |
| HRAdmin | refuse | full, whole lab | refuse | full, whole lab |
| PME | refuse | refuse | full, whole lab | full, whole lab |
| FinanceAdmin | refuse | refuse | totals | full, whole lab |
| DivisionHead, HOD | refuse | refuse | full in own division, else refuse | full in own division, totals elsewhere |
| Scientist, Technician, ProjectStaff, Student | refuse | refuse | refuse | totals |
| SystemAdmin | refuse | refuse | refuse | totals |
| Guest, DefaultUser | no access to Ask SURYA at all (today's gate, unchanged) |

**As built (after review):** for `subject = other_person` the guard takes the caller's
best cell across own division and elsewhere, because it cannot know which division the
named person sits in; RLS narrows the rest. So a DivisionHead / HOD asking about one
person gets `full` (not a strike), and a Scientist still gets `refuse` for the three
sensitive topics. `subject = division` with no code named means the caller's own
division; codes compare case-insensitively. The verdict comes from the role table only. A refused question
that names the asker or uses first-person wording ("my", "me", "I", "myself") is still
refused, but logged `self_unsure`, not a strike: "What is my PMS score?" mislabelled
`other_person` is a model slip. These hints never widen access. A failed role read refuses
every question; a failed name read refuses without a strike (both `scope_unavailable`).

Rule for the builder: before shipping, compare every `full` cell with the RLS
policies. Where RLS is narrower than the cell, narrow the cell. Where RLS is wider,
keep the cell (the guard may be stricter than RLS on these three sensitive topics;
that is the point of the feature).

The `lab` field: every row above means "within `scope.lab`". WP-17 adds rows for a
Headquarters role and a set of labs. Nothing else changes.

## 7. Constraints

- Python logic stays out of `api.py` (WDAC blocks FastAPI wheels on the dev laptop).
- New migration after the latest timestamp; RLS and grants per `supabase/CLAUDE.md`.
- `ask_scope_sweep()` is `SECURITY DEFINER` and cron-only: `EXECUTE` revoked from
  every client role, and listed in the `EXEMPT` map of
  `scripts/check_security_definer.py` with that reason.
- Update `docs/engineering/api_spec.md`, `database_design.md` and `system_design.md`
  in the same change. Add one line under WP-7 in `docs/roadmap/ROADMAP.md`.

## 8. Checks that must exist

- `rag/tests`: one test per row of the scope table; `unknown` never refuses;
  a refused question runs no retrieval and no analytics; history answers never
  reach the classifier.
- `scripts/db`: an owner cannot update `refusal_reason`; the sweep writes exactly
  one notice per HRAdmin for 6 strikes and none for 5.
- `src/pages/AskSurya.test.tsx`: refused rows are absent from history; a click
  re-asks instead of showing a stored answer.

## 9. Left to the builder

- Exact prompt wording for `topic` / `subject` and the few-shot examples.
- Which catalog functions earn the `aggregate` flag (§5.3).
- Panel layout inside `AskSurya.tsx`.
- Whether `/similar` needs the guard. Default: no; it returns titles RLS already allows.
