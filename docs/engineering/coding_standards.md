# SURYA — Coding Standards

_The canonical, expanded version of the coding rules summarized in
[CLAUDE.md](../../CLAUDE.md). Covers TypeScript/React, Python, and SQL. Current as of
2026-08-08._

A rule here is descriptive of the codebase unless marked **(aspirational)**. Where an
existing file disagrees with a rule, the rule wins for new code and the file is fixed when
next touched — not in a separate refactor.

---

## 1. Class vs function

**Default to functions.** The codebase contains almost no classes, and that is deliberate.

### TypeScript

| Construct | Use |
|---|---|
| **Function components only** | No class components anywhere. `ErrorBoundary` is the single exception, because React error boundaries have no hook API — that is the whole justification |
| **Plain functions** for logic | Everything in `src/lib/**` and `src/utils/*.ts` |
| **`interface`** for object shapes | Entities, props, context types |
| **`type`** for unions and aliases | `type Role = 'Director' \| …`, `type ReportStatus = …` |
| **No service classes, no repository classes** | A "repository" here is a module of exported functions (`src/lib/phd/write.ts`, `src/lib/proposals/api.ts`). There is no base class and no interface with one implementation |

### Python

Classes appear in exactly two shapes, both justified:

1. **Adapters with swappable implementations** — `NullOCR` / `TesseractOCR` / `OllamaOCR`,
   `FakeLLM` / `OpenLLM`, `SupabaseDB` / `FakeDB`. Each pair exists because tests need a
   real substitute, not because the domain has objects.
2. **`@dataclass` for data** — `Answer`, `Citation`, `Config`. Frozen where immutable
   (`Config`).

Everything else is a module-level function. `analytics.py` holds 17 query functions and no
class.

**Do not add:** a class with one implementation and no test double; a factory for a single
product; an abstract base for two concrete types that share no call site.

---

## 2. Async vs sync

### TypeScript — async everywhere I/O happens

- All Supabase calls are `async`/`await`. Never `.then()` chains.
- **Parallelize independent reads.** `fetchAll` issues entity fetches concurrently; a
  sequential waterfall of independent `await`s is a defect.
  ```ts
  const [staff, projects] = await Promise.all([fetchStaff(), fetchProjects()]);
  ```
- Never `await` inside a render. Fetch in `useEffect` and set state.
- `useEffect` that starts async work cleans up (abort flag or listener removal) so a
  late resolve cannot set state on an unmounted component.
- Pure domain functions in `src/lib/**` are **synchronous**. If a function in `lib/` needs
  `await`, it is doing I/O and belongs in a `write.ts` / `api.ts` module instead.

### Python — synchronous by default

This is the rule most likely to surprise: **`rag/` is synchronous throughout**, including
the FastAPI endpoints.

```python
@app.post("/query")
def query(body: QueryIn, authorization: str | None = Header(default=None)):
```

`def`, not `async def`. FastAPI runs sync endpoints in a threadpool, which is correct here:
the work is one blocking `urllib` call to Ollama plus a few blocking PostgREST calls, and
the concurrency is one institute's traffic. Making it `async` would require an async
Supabase client and an async LLM client and would buy nothing measurable.

Workers are plain poll loops with `time.sleep`. Do not convert them to asyncio.

**Change this only with a measurement.** If concurrency ever becomes the bottleneck, the
place to look is the model host, not the event loop.

---

## 3. Naming

### 3.1 Files

| Kind | Convention | Example |
|---|---|---|
| Page | `PascalCase.tsx` | `HumanCapital.tsx` |
| Component | `PascalCase.tsx` | `ReportWizard.tsx` |
| Context | `PascalCaseContext.tsx` | `DataContext.tsx` |
| Hook | `usePascalCase.ts` | `useUserDirectory.ts` |
| Domain module | `camelCase.ts` in `src/lib/<domain>/` | `src/lib/pms/scoring.ts` |
| Utility | `camelCase.ts` | `dateUtils.ts` |
| Types barrel | `index.ts` | `src/types/index.ts` |
| Test | co-located `<name>.test.ts(x)` | `scoring.test.ts` |
| Python module | `snake_case.py` | `query_service.py` |
| Migration | `<YYYYMMDDHHMMSS>_<snake_case>.sql` | `20260726000004_baseline_grants.sql` |

### 3.2 Identifiers

| Kind | Convention | Example |
|---|---|---|
| Component, type, interface | `PascalCase` | `StaffMember`, `DataTable` |
| Hook | `use` + `PascalCase` | `useData`, `useFeatureControls` |
| Variable, function | `camelCase` (TS) / `snake_case` (Python) | `activeRole`, `handle_query` |
| Module constant | `SCREAMING_SNAKE_CASE` | `ACCESS_MAP`, `CONTEXT_BUDGET`, `MAX_DOCS_FLAT` |
| Python private module member | leading underscore | `_run_structured`, `_merge_hybrid` |
| Boolean | `is` / `has` / `can` prefix | `isProvisioned`, `hasPermission`, `canEdit` |

### 3.3 Domain-role naming

The requested categories map onto this codebase as follows. Use these names — inventing a
`FooService` or `FooRepository` will make your file the odd one out.

| Role | Convention | Lives in | Examples |
|---|---|---|---|
| **Entity / DTO** | Noun, `PascalCase` interface. No `Dto` suffix — the type *is* the DTO | `src/types/` | `StaffMember`, `PMSReport`, `Proposal` |
| **API request/response shape** | Noun + `In` (Python request models), or the plain noun (TS) | `rag/api.py`, `src/lib/ask/client.ts` | `QueryIn`, `SimilarIn`, `MapColumnsIn`, `AskAnswer`, `AskCitation` |
| **Read path ("repository")** | Module of verbs, `fetchX` / `readX` / `loadX` | `src/lib/data/`, `rag/query_service.py` | `fetchAll`, `read_docs`, `read_collections` |
| **Write path** | `write.ts` / `api.ts` module; verb functions | `src/lib/<domain>/` | `src/lib/phd/write.ts`, `src/lib/proposals/api.ts` |
| **Row mapper** | `map<Entity>Row` | `src/utils/dataMapper.ts` | `mapStaffRow`, `mapTicketRow` |
| **Permission predicate** | `can<Verb>` / `is<Noun>` | `src/lib/<domain>/permissions.ts` | `canEdit`, `pms_is_admin` |
| **Derived-analytics function** | Verb or noun phrase describing the answer | `src/lib/<domain>/`, `rag/analytics.py` | `successionRisk`, `_project_budget_variance` |
| **Adapter** | Implementation prefix + capability | `rag/ocr.py`, `rag/llm.py`, `rag/db.py` | `NullOCR`, `TesseractOCR`, `FakeLLM`, `FakeDB` |
| **Adapter factory** | `make_<capability>` | same | `make_ocr`, `make_llm` |
| **Database RPC** | `<domain>_<verb>[_<object>]`, snake_case | `supabase/migrations/` | `pms_submit_report`, `proposal_issue_om`, `helpdesk_add_response` |
| **RLS/identity helper** | `caller_*` for identity, `<domain>_can_*` for predicates | migrations | `caller_is_admin`, `documents_can_read` |
| **Trigger function** | `<domain>_<what_it_does>` | migrations | `pms_set_updated_at`, `pms_check_evaluation_complete` |
| **Event / audit record** | Past-tense or noun event type in a `*_events` / `*_history` / `*_log` table | migrations | `ticket_events.event_type = 'StatusChanged'`, `proposal_status_history` |

**Database column names.** HR tables use quoted CamelCase mirroring the source Excel
(`"divCode"`, `"DOJ"`); everything else is `snake_case`. This split is intentional — see
[database_design.md §1](database_design.md#1-conventions). Do not "fix" a CamelCase HR
column in passing.

---

## 4. Exception and error design

### 4.1 Principles

1. **Fail loudly at boundaries; degrade quietly in the middle.** Missing configuration
   throws at startup. A failed analytics call falls through to another path.
2. **Never let observability break the product.** `log_query` swallows every exception —
   an answer must not fail because logging did.
3. **Parsing never throws.** `parseFile` resolves `{ success: false, error }` rather than
   rejecting: a bad spreadsheet is an expected input, not an exceptional one.
4. **A refusal is not an error.** "Not found in institute documents." is a successful `200`.

### 4.2 TypeScript

```ts
// Async data loading: catch, log with context, degrade to empty.
try {
  const rows = await fetchAll(supabase.from('staff').select('*').order('ID'));
  setStaff(rows.map(mapStaffRow));
} catch (err) {
  logger.error('staff_load_failed', err, { role: activeRole });
  setStaff([]);
  setLoadError(true);   // renders <EmptyState variant="error">
}
```

- Catch where you can do something about it. A `catch` that only re-throws is noise.
- Load failures degrade to an empty array **plus** an error flag. Empty-without-flag is
  indistinguishable from "no rows", which is how silent failures ship.
- Form validation is `useState` + rendered JSX, not exceptions.
- Detail pages render an inline not-found with a back button when the route param misses.
- `ErrorBoundary` is the last resort for render-time errors, not a control-flow mechanism.

### 4.3 Python

- **Raise the specific type; let the boundary map it.** `auth.verify_token` raises
  `PermissionError`; `api.py` maps it to `401`. Domain modules never construct
  `HTTPException` — that would couple them to FastAPI, which is exactly what the
  `api.py` / `query_service.py` split exists to prevent.
- **Config fails fast.** `load_config` raises `ValueError` naming every missing key.
- **Broad `except Exception` is allowed in exactly two places**, both with a stated reason
  in a comment: per-document isolation in the ingestion loop (one bad PDF must not halt the
  queue), and best-effort side paths (`log_query`, `read_route_labels`, `_run_structured`).
  Anywhere else, catch the specific exception.
- Timeouts are explicit per stage (`ROUTE_TIMEOUT_S`, `PICK_TIMEOUT_S`, `ANSWER_TIMEOUT_S`,
  `SUMMARIZE_TIMEOUT_S`) and env-overridable, because the right value depends on whether
  the host has a GPU.

### 4.4 SQL

- Authorization failures `RAISE EXCEPTION` with a message that says what was wrong — the
  client surfaces it verbatim as a `400`.
- Invariants that are always true belong in `CHECK` / `UNIQUE`, not in application code.
  `length(trim(justification)) >= 50` is a constraint, not a form rule.
- Use `ON DELETE RESTRICT` where history must survive (`appraisal_cycles`,
  `pms_evaluations`) and `CASCADE` where children are meaningless without the parent
  (`pms_report_sections`, `doc_pages`).

---

## 5. Dependency injection

No container, no framework. Three mechanisms, each idiomatic to its runtime.

**React — context as the injection point.**
```tsx
const FooContext = createContext<FooContextType | undefined>(undefined);

export function useFoo() {
  const ctx = useContext(FooContext);
  if (ctx === undefined) throw new Error('useFoo must be used within a FooProvider');
  return ctx;
}
```
The `undefined` default plus the throwing hook is not ceremony — it turns a missing
provider into a loud startup failure instead of a silent `undefined` three components deep.
Every context in `src/contexts/` follows this exactly. Provider and hook live in the same
file, with `/* eslint-disable react-refresh/only-export-components */` at the top.

**Python — factory selection from config.**
```python
ocr = make_ocr(cfg.ocr_backend)                      # null | tesseract | ollama
llm = make_llm(cfg.llm_backend, base_url, model, ...)  # fake | openllm
db  = SupabaseDB(cfg)                                 # FakeDB in tests
```
Tests construct fakes directly and pass them in. **Do not monkeypatch module globals** —
if a function needs a dependency, it takes it as a parameter.

**Closure injection for scoped I/O.**
```python
fetch_texts = make_fetch_texts(client)      # closes over the caller's RLS-scoped client
answer = traverse(docs, question, llm, fetch_texts)
```
`retrieval.py` therefore imports nothing from Supabase and is fully testable with a list of
strings. Prefer this shape whenever a pure function needs one I/O capability.

---

## 6. TypeScript and React idioms

### 6.1 Compiler settings (non-negotiable)

`strict` · `noUnusedLocals` · `noUnusedParameters` · `noFallthroughCasesInSwitch` ·
`verbatimModuleSyntax` · `erasableSyntaxOnly`.

`verbatimModuleSyntax` means **all type-only imports must use `import type`**:
```ts
import type { StaffMember, Role } from '../types';
import { useData } from '../contexts/DataContext';
```

### 6.2 Rules

- **`any` is permitted in two files only**: `dataMapper.ts` and `dataMigration.ts`, the
  raw-row boundary. Never in UI, hooks, or `lib/`.
- **Non-null assertion `!` is permitted at the root mount only** (`main.tsx`).
- **Exports:** pages `export default`; UI primitives, contexts, hooks, and lib modules use
  **named exports**.
- **`useMemo` for all derived data in pages.** This is the primary performance pattern —
  pages derive over thousands of context rows, and an unmemoized filter re-runs on every
  unrelated state change.
- **Lazy initializers for persisted state:** `useState(() => localStorage.getItem('surya_theme'))`.
- **Generics on reusable data components:** `DataTable<T>`.
- **Pages consume `useData()`.** Direct Supabase access from a page is a defect; the
  sanctioned exceptions are `src/lib/<domain>/{write,api,storage}.ts` and
  `src/lib/ask/client.ts`.
- **ESLint disables are justified in place.** Only two are accepted:
  `react-refresh/only-export-components` at the top of context files, and
  `react-hooks/exhaustive-deps` when the omission is intentional and prevents an infinite
  loop — with a comment saying which.

### 6.3 Import order

Not enforced by tooling; universally observed:

1. React and third-party (`react`, `lucide-react`, `clsx`, `motion`, `recharts`)
2. Contexts (`../contexts/AuthContext`)
3. Components (`../components/ui/Cards`)
4. Utils and lib (`../utils/dateUtils`, `../lib/pms/scoring`)
5. Types (`../types`)

**No path aliases.** Relative imports only.

### 6.4 Styling

- **Tailwind CSS 4 only.** No CSS modules, no styled-components, no `style={{}}` except for
  genuinely dynamic numeric values.
- **Semantic tokens, always:** `bg-surface`, `text-text-muted`, `border-border`,
  `text-brand-blue`. **Never** `bg-white`, `text-gray-500`, `text-blue-700`, or
  `[#3b82f6]`. ESLint enforces this as an **error**; files listed in
  `eslint.design-debt.json` are grandfathered at `warn`. **Shrink that list by fixing
  files — never grow it** (`scripts/update-design-debt.mjs` checks in CI).
- Raw hex belongs in `src/index.css` and chart `fill` props, nowhere else.
- Compose classes with `cn()` (`clsx` + `tailwind-merge`) so a caller's `className` can
  override a variant class.
- Theme is a class on `<html>`; density is `data-density` on `<html>`.
- Animation is `framer-motion` (`<motion.div>`, `<AnimatePresence>`).
- **Read [DESIGN.md](../../DESIGN.md) before any visual decision.** Fonts, colors, spacing, and
  aesthetic direction are defined there and are not open to per-component reinterpretation.

---

## 7. Python idioms

- **Python 3.12.** Modern union syntax (`str | None`), `@dataclass`, f-strings.
- **Standard library first.** `rag/llm.py` calls Ollama with `urllib.request` — no
  `requests`, no SDK. `ingest/` is pure stdlib plus `supabase-py`. Do not add a dependency
  for what a few lines already do.
- **Module-level constants carry the tuning knobs**, with a comment explaining the number:
  `CONTEXT_BUDGET = 8000`, `MAX_DOCS_FLAT = 8`, `MAX_SIMILAR_MATCHES = 6`,
  `HISTORY_MAX_TURNS = 3`, `_PAGE_SIZE = 200`. A magic number without a rationale is a
  defect.
- **Prompts are module constants**, not inline strings: `_ROUTE_SYSTEM`, `_ANSWER_SYSTEM`,
  `_PICK_PROMPT`, `_MAP_COLUMNS_SYSTEM`. A prompt is behaviour — changing one is a
  behavioural change and gets an eval run.
- **Model output is never trusted.** `_extract_json` parses first `{` to last `}` to
  tolerate code fences and prose. Every parsed field is validated, and validation failure
  falls back to the safe branch.
- **Keep FastAPI out of the logic.** New endpoint work goes in a service module;
  `api.py` only parses, authenticates, delegates, and maps exceptions to status codes.
- **Docstrings on modules and non-obvious functions**, stating the *contract* and the *why*
  — see `auth.py`'s module docstring, which states the security contract in three lines.
- Tests use `FakeLLM`, `NullOCR`, `FakeDB`. **No network in the test suite**, ever.

---

## 8. SQL standards

**Structure of a migration file:**

```sql
-- ============================================================
-- Stage NN — <what this file owns>
-- Contains : <tables, functions>
-- Depends  : <earlier stages and why>
-- Rerun    : NOT idempotent — fresh installs only.
-- ============================================================
```

Then, per table, in this order: `CREATE TABLE` → indexes → `ENABLE ROW LEVEL SECURITY` →
policies → grants → triggers.

**Rules:**

- `CREATE TABLE IF NOT EXISTS` and `CREATE OR REPLACE FUNCTION` for re-runnability where
  it is honest; say so in the header when a file is not idempotent.
- Keywords uppercase, identifiers lowercase, quoted only when the CamelCase HR schema
  requires it.
- **Every table gets RLS, an explicit policy block, and an explicit grant** in the same
  migration.
- **Every `SECURITY DEFINER` function opens with an authorization block.** No exceptions,
  and "the UI gates it" is not one — the function runs as owner, RLS does not apply, and the
  function *is* the boundary. A function that genuinely needs none (a trigger, a caller
  identity resolver, an `EXECUTE`-revoked internal helper) goes in
  `scripts/check_security_definer.py`'s `EXEMPT` map **with a stated reason**.
- **Assert client-supplied actor ids** against `auth.uid()`.
- **`COALESCE(..., false)` around any `IF NOT (...)` guard touching a nullable column.**
  `assigned_to = auth.uid()` on an unassigned ticket is NULL; the OR-chain collapses to
  NULL; `NOT NULL` is NULL; the `IF` never fires and the guard authorizes everyone. RLS
  `USING` clauses are safe (NULL is false there) — it is plpgsql `IF` that bites. This
  shipped once; only the RLS suite caught it.
- **`SET search_path`** on `SECURITY DEFINER` functions, and schema-qualify extension calls
  (`extensions.digest(...)`) — `SET search_path` alone was not enough.
- Use `_` prefixed parameter names (`p_report_id`) so parameters never shadow columns.
- Comment the *why* above non-obvious policies — the migrations in this repo are unusually
  well-commented, and that is a standard to maintain, not an accident.

---

## 9. Logging

**TypeScript** — use `src/utils/logger.ts`, never bare `console.*` in application code:

```ts
logger.info('import_committed', { fileType, rowCount });
logger.warn('mapping_unconfirmed', { headers });
logger.error('staff_load_failed', err, { role: activeRole });
```

The first argument is a **stable snake_case event name**, not a sentence. Context is a
structured object. Errors are serialized to `{name, message, stack}`. This shape survives
being shipped to a log aggregator later; a formatted English string does not.

**Python** — `print(..., flush=True)` with a `[rag]` / `[ingest]` prefix in workers. This is
deliberate: workers run under NSSM, which captures stdout to a service log, and `flush=True`
matters because NSSM buffers otherwise. Web-path logging goes to the database
(`query_log`), not to stdout — it needs to be queryable, and it is.

**Never log:** JWTs, the service key, passwords, or full document text. Log identifiers and
counts.

**Audit trails are not logs.** A workflow action goes into `pms_audit_logs` / `audit_log` /
`ticket_events` via the RPC that performed it, with the true actor. Those are records, and
they are queryable, retained, and RLS-protected.

---

## 10. Comments and documentation

### 10.1 Comments

**Default: write none. Code self-documents.** Then these specific exceptions, all of which
are well represented in the codebase:

| Write a comment when | Example |
|---|---|
| A number needs a rationale | `# Total character budget for the answer context, split evenly across picked nodes.` |
| An ordering is load-bearing | `# pages before index: an indexed doc always has its pages` |
| A defect is being prevented | `-- COALESCE: NULL assigned_to would authorize everyone` |
| A simplification has a known ceiling | `# ponytail: two stages (document -> section); add a collection stage if corpora outgrow a single doc-level prompt` |
| A security contract is being stated | the module docstring in `rag/auth.py` |
| A weird thing is intentional | `"CompletioDate" text, -- typo is intentional (matches Excel source)` |

**JSDoc** on utility functions in `utils/` and on exported `lib/` functions whose contract
is not obvious from the signature. **Not** on components or hooks.

`// --- N. Section Name ---` dividers in long pages. `// TODO:` for planned work — and a
real TODO goes in [TODOS.md](../../TODOS.md) too, with what breaks if it is not done.

**Do not write:** comments restating the code, changelog comments (`// changed 2026-07-12`
— that is what git is for), or commented-out code. Delete it; git remembers.

### 10.2 Documentation

| Change | Update |
|---|---|
| New feature or role gate | [FEATURES.md](FEATURES.md), `ACCESS_MAP` |
| New table, column, or index | [database_design.md](database_design.md) |
| New RPC or HTTP endpoint | [api_spec.md](api_spec.md) |
| New state machine or flow | [system_design.md](system_design.md) |
| New layer, adapter, or extension point | [architecture_addendum.md](architecture_addendum.md) |
| New convention | This file, and the summary in [CLAUDE.md](../../CLAUDE.md) |
| New dependency or version bump | [STACK.md](STACK.md) |
| New setup step or script | [development_guide.md](development_guide.md) |
| Deployment change | [deploy/README.md](../../deploy/README.md) |

**Documentation states what is true, and marks what is not yet true as Planned.** A doc
that describes an intention as if it were shipped is worse than no doc — this repo already
carries one such stale banner, and it cost a reader real time. When you finish a planned
thing, update the plan document's status line in the same commit.
