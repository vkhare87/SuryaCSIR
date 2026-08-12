# SURYA — Development Guide

_How to set up, build, test, review, and ship changes to SURYA. This document also serves
as the project's contributing guide. Current as of 2026-08-08._

Read alongside [CLAUDE.md](../../CLAUDE.md) (project rules), [DESIGN.md](../../DESIGN.md) (read
before any visual change), and [coding_standards.md](coding_standards.md).

---

## 1. Project setup

### 1.1 Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 22 LTS or newer (CI uses 22) | SPA |
| npm | bundled | SPA |
| Python | **3.12 exactly** | `rag/` — PyMuPDF ships no 3.14 wheel |
| Supabase CLI | latest | migrations, local stack |
| Docker | current | only for `supabase start` |
| Ollama | current | only for real LLM/OCR; tests use fakes |
| Tesseract | any | only for `OCR_BACKEND=tesseract` |

> **Windows note.** A bare `python` or `py` on a dev machine often resolves to 3.14. Create
> the RAG venv with `py -3.12` explicitly. If Smart App Control / WDAC is enabled,
> PyMuPDF's `_mupdf.pyd` and `pydantic-core` are blocked and `rag/` will not import — allow
> them, or run those tests in CI only. This is an environment policy, not a code problem.

### 1.2 SPA

```bash
npm install
cp .env.example .env      # fill in the three VITE_ variables
npm run dev               # http://localhost:5173
```

`.env`:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_RAG_URL=http://localhost:8000     # or /rag behind nginx in production
```

**With no credentials the app still runs** — `isProvisioned()` returns false and
`DataProvider` serves `src/utils/mockData.ts`. That is the intended path for UI work.

### 1.3 Database

```bash
supabase link --project-ref <ref>
supabase db push          # applies every unapplied migration, in order
supabase config push      # applies the [auth] block from supabase/config.toml
```

Then bootstrap: run `supabase/seed/*.sql`, create the first user via Dashboard →
Authentication → Users, and promote them per `supabase/ops/README.md`.

For a full local stack:

```bash
supabase start -x realtime,imgproxy,studio,edge-runtime,logflare,vector
supabase db reset         # rebuild from migrations + seed
```

Demo data (`supabase/mock/*.sql`) is **development only**. A mock helpdesk fixture once
reached production and had to be removed by hand.

### 1.4 RAG service

```bash
cd rag
py -3.12 -m venv .venv
.venv/Scripts/activate          # source .venv/bin/activate on *nix
pip install -r requirements.txt
cp .env.example .env

python -m pytest                # all offline: FakeLLM + NullOCR, no network
python worker.py --once         # single ingestion pass
uvicorn api:app --port 8000     # the query API
```

`LLM_BACKEND=fake` and `OCR_BACKEND=null` give a fully working stack with no model —
deterministic, fast, and what the tests use. Switch to `LLM_BACKEND=openllm` +
`LLM_PROVIDER=ollama` for real answers.

Step-by-step walkthrough from zero to a cited answer:
[RAG-SETUP-TUTORIAL.md](../operations/RAG-SETUP-TUTORIAL.md).

### 1.5 Capture worker (optional)

```bash
cd ingest
py -3.12 -m venv .venv
.venv/Scripts/pip install -r requirements.txt
python worker.py --once
```

Pure stdlib + `supabase-py`, no native dependencies. Leave `WATCH_ROOT` and/or `IMAP_*`
unset to disable a source.

### 1.6 Scripts

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | `tsc -b && vite build` → `dist/`. **This is the real typecheck** |
| `npm run lint` | ESLint over the whole repo |
| `npm test` | `vitest run` — 66 files, 652 tests, ~27 s |
| `npm run test:watch` | Vitest watch mode |
| `npm run preview` | Serve the production build |
| `npm run sync:irins` | `tsx scripts/irins/sync.ts` |
| `python -m pytest` (in `rag/` or `ingest/`) | Python suites |
| `python scripts/check_security_definer.py` | Authorization-block audit over all migrations |

> **`npx tsc --noEmit` passes vacuously** on this repo because of the project-references
> layout. Use `npm run build` when you need a genuine typecheck.

---

## 2. Branching

`main` is the only long-lived branch and is always releasable.

```
main
 └── <type>/<short-kebab-description>
```

Observed and expected prefixes: `feature/`, `fix/`, `security/`, `chore/`, `docs/`.
Examples from history: `feature/pms-senior-track`,
`fix/real-data-defects-and-eval-harness`, `security/audit-remediation-2026-07-25`.

Rules:
- Branch from current `main`. Rebase or merge `main` in before opening a PR.
- **Never commit directly to `main`** — CI runs on `main` and `feature/**` pushes and on
  every PR into `main`.
- One concern per branch. A branch that fixes a bug and refactors an unrelated module is
  two branches.
- Migration timestamps collide across concurrent branches. If yours does, **renumber the
  unapplied one** — this has happened before and is a normal resolution.

---

## 3. Coding and testing workflow

The loop, in order. Skipping steps is how the 2026-07-25 audit findings got in.

```
1. Read the rules      → CLAUDE.md; DESIGN.md if anything is visual;
                         .claude/skills/* for PMS, RLS, or new UI primitives
2. Write the test      → the failing test comes first for pure logic
3. Implement           → smallest change that passes
4. npm test            → all 652 green
5. npm run lint        → zero errors (design-token rules are errors outside the debt list)
6. npm run build       → the real typecheck
7. Verify in the app   → npm run dev, exercise the actual path
8. Commit              → conventional commit, one logical change
```

### 3.1 What to test where

| Kind of code | Test it | Why |
|---|---|---|
| `src/lib/**` domain logic | **Always.** Co-located `*.test.ts` | Pure, fast, no mocks needed. This is where the coverage lives |
| `src/utils/*.ts` helpers | Always | Same |
| UI primitives (`components/ui/`) | Yes — `@testing-library/react` + jsdom | `DataTable`, `EmptyState`, `Tabs`, `SpecSection`, `StatusSeal` are covered |
| Pages | Rarely | Thin by design; logic belongs in `lib/` where it can be tested properly |
| RPCs and RLS policies | `supabase/tests/rls_{positive,negative}.sql`, run by CI's `db` job | A 652-test TypeScript suite cannot catch three lines of bad SQL. That is not hypothetical — a full privilege-escalation path shipped exactly that way |
| `rag/` modules | `rag/tests/test_*.py`, against `FakeLLM` / `NullOCR` / `FakeDB` | Offline, no network, no model |
| Retrieval quality | `rag/eval/run_eval.py` against `gold.jsonl`; `rag/eval/bench_local.py` for model comparison | Behavioural, not unit — run before changing a model or a prompt |

**If you touch a `SECURITY DEFINER` function or an RLS policy, add a case to the RLS
suite.** Both a positive (the right person can) and a negative (the wrong person cannot).

### 3.2 Adding common things

| Task | Steps |
|---|---|
| **Page/route** | `src/pages/<Page>.tsx` → lazy import + `<Route>` in `App.tsx` → `ACCESS_MAP` + `FEATURE_LABELS` in `src/constants/access.ts` → nav entry in `Sidebar`. `/add-page` scaffolds this |
| **Domain entity** | Type → mock → mapper → `DataContext` → `dataMigration.ts` mapping, plus a migration with RLS and a grant |
| **Migration** | `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`. RLS enabled, explicit policies, explicit grant, authorization block in any `SECURITY DEFINER` function. `/new-migration` scaffolds it |
| **Workflow transition** | New RPC — never `UPDATE` a status column from the client |
| **Structured AI question** | Function in `rag/analytics.py` + entry in `_FUNCTIONS` + description in `CATALOG`. The description **is** the routing prompt |
| **UI primitive** | `src/components/ui/<Name>.tsx`, named export, semantic tokens only |

---

## 4. Commit conventions

Conventional Commits with a scope. The scope is the module, not the file.

```
<type>(<scope>): <imperative summary, lowercase, no trailing period>

<body — why, not what. Wrap at 72.>
```

**Types:** `feat` · `fix` · `chore` · `docs` · `test` · `refactor` · `security` · `ops` · `ci`
**Scopes in use:** `pms` · `db` · `rag` · `import` · `analytics` · `worker` · `eval` ·
`deploy` · `ci` · `mock` · `ops` · `tests`

Real examples from this repo:

```
fix(db): COALESCE the add_response guard — NULL assigned_to authorized everyone
fix(db): grant table privileges, without which every RLS policy is dead code
feat(pms): pen-picture appraisal and score-free finalization
fix(rag): make retrieval work against real documents, not just fixtures
chore: remove dead viz components and unused PMS validation schemas
```

Note the house style: the summary states the **consequence**, not the mechanism. "grant
table privileges, without which every RLS policy is dead code" tells a future reader why
the commit mattered; "add grants" does not. Match it.

One logical change per commit. A migration and the code that calls it belong together; a
migration and an unrelated UI tweak do not.

---

## 5. Pull request review checklist

Before requesting review, and again as the reviewer:

**Correctness**
- [ ] `npm test`, `npm run lint`, `npm run build` all pass locally
- [ ] The change was exercised in a running app, not only in tests
- [ ] Edge cases named in the description are covered by tests

**Security — non-negotiable**
- [ ] Every new table has RLS enabled, explicit policies, **and** a grant
- [ ] Every new `SECURITY DEFINER` function opens with an authorization block, or is listed
      in `scripts/check_security_definer.py`'s `EXEMPT` map **with a stated reason**
- [ ] Any `p_actor_id` / `p_author_id` / `p_submitted_by` parameter is asserted equal to
      `auth.uid()`
- [ ] Every plpgsql `IF NOT (...)` guard touching a nullable column is wrapped in
      `COALESCE(..., false)`
- [ ] No status column is written directly from the client
- [ ] No blanket `GRANT ALL` was added
- [ ] The service key appears in no code path reachable from user input

**Data**
- [ ] No shipped migration file was edited; new work is a new timestamped file
- [ ] Migration timestamp sorts after everything already applied
- [ ] Any new paged read uses `fetchAll`, not a bare `.select()`

**Frontend**
- [ ] Pages use `useData()`; no direct Supabase calls outside `src/lib/*/` write paths
- [ ] All derived data is in `useMemo`
- [ ] Semantic Tailwind tokens only — no raw `bg-white` / `text-gray-500` / `[#hex]`
- [ ] New route is in `ACCESS_MAP`, `FEATURE_LABELS`, and `Sidebar`
- [ ] Type-only imports use `import type`
- [ ] Loading and empty states exist; error path renders `EmptyState` with `error`

**Python**
- [ ] New logic sits outside `api.py` so it is testable without FastAPI
- [ ] Tests run offline against `FakeLLM` / `NullOCR` / `FakeDB`
- [ ] Any new answer path preserves the refusal invariant: no citations → refusal

**Housekeeping**
- [ ] Docs updated when behaviour changed (this suite, `CLAUDE.md`, module READMEs)
- [ ] Imports/variables orphaned **by this change** removed; unrelated dead code left alone
      and mentioned instead

---

## 6. Definition of Done

A change is done when **all** of the following hold. Not "mostly".

1. It does what was asked — the whole scope, not the easy part.
2. `npm test` · `npm run lint` · `npm run build` are green locally and in CI (all four CI
   jobs: `spa`, `rag`, `ingest`, `db`).
3. New logic has a test that fails without the change.
4. Security items on the checklist above are satisfied, and RLS/RPC changes have both a
   positive and a negative case in `supabase/tests/`.
5. The behaviour was verified in a running app against realistic data.
6. Schema changes are a new timestamped migration, pushed with `supabase db push`.
7. Documentation that is now wrong has been corrected.
8. The commit history tells a reviewable story — no "wip", no "fix fix".
9. Anything deliberately left out is stated explicitly in the PR description.

---

## 7. Debugging

### 7.1 Frontend

| Symptom | Look at |
|---|---|
| Page shows no data, no error | RLS. You are authenticated but not entitled — a blocked read returns `[]`, not an error. Check the policy and the caller's `active_role` / `division_code` |
| Data truncates at exactly 1000 rows | `fetchAll` paging vs `max_rows` in `supabase/config.toml`. They must be equal |
| Redirect loop on login | `mustChangePassword`, or `active_role` not in the user's `user_roles` (`user_profiles_validate_active_role`) |
| Nav item missing | `ACCESS_MAP` entry, or a MasterAdmin kill-switch at `/admin/features` |
| Route 404s to `/` | Route not registered in `App.tsx`, or a parameterized route declared before its specific sibling |
| Credential change had no effect | `supabaseClient` is a module-level singleton — reload the page |
| Wrong theme/density | `localStorage` `surya_theme` / `surya_density`; class and `data-density` sit on `<html>` |
| Chart renders blank | Check the semantic token — a raw color class may be a no-op. `src/components/viz/palette.ts` is the source |

### 7.2 Database

```sql
-- Whoami, as Postgres sees it
select auth.uid(), caller_active_role(), caller_division(), caller_staff_id();

-- Does a policy actually let me read this?
select * from pms_reports where id = '...';   -- [] means "not yours"

-- Is a cycle locked?
select pms_cycle_locked('<cycle_id>'), pms_deadline('<cycle_id>', 'SYSTEM_LOCK');

-- Why did an ingest fail?
select id, title, ingest_status, ingest_attempts, ingest_error
from documents where ingest_status = 'failed';
```

An RPC that raises surfaces as HTTP 400 with the `RAISE EXCEPTION` message in
`error.message` — read it; the authorization blocks are written to say what was wrong.

### 7.3 RAG

| Symptom | Likely cause |
|---|---|
| Everything answers "Not found in institute documents." | No indexed documents, or the caller cannot read any (`documents_can_read`). Check `/admin/rag` |
| Structured questions route to documents | The `CATALOG` description does not read like the question a user asks. It is the routing prompt — rewrite it |
| Every query times out | `RAG_*_TIMEOUT_S` defaults assume a GPU. `ollama ps` showing `100% CPU` predicts your latency. Raise the timeouts or get GPU offload |
| Import fails / worker will not start | WDAC blocking `_mupdf.pyd` or `pydantic-core`; or Python 3.14 instead of 3.12 |
| Config error at startup | `config.load_config` fails fast and names the missing key |
| Unsure the environment is right | `python preflight.py --worker` / `--api` — each `[FAIL]` names the migration or action needed |
| Answer quality regressed | `python rag/eval/run_eval.py` against `gold.jsonl`; `bench_local.py --model <name> --cases 5` for a model comparison. Never change models on vibes |

Every answer is logged to `query_log` with `route`, `function_name`, `function_params`,
`latency_ms`, `refusal_reason`, and `catalog_version`. That row is usually the fastest way
to see what the system actually decided.

### 7.4 CI

Four jobs: `spa` (lint + test + build), `rag` (full pytest including the native-DLL tests
a Windows dev box cannot run), `ingest` (pytest), `db` (real Supabase stack + migrations +
seeds + RLS suites). A failure in `db` that reproduces nowhere locally usually means a
migration is order-dependent — check its timestamp against what is already applied.
