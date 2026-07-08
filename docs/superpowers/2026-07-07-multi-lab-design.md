# Multi-Institute (Multi-Lab) Scalability — Design

**Status:** design only — implement after real-data validation (P10) and the dissertation §4.5 write-up.
**Proposal:** P7 in `docs/IMPROVEMENT-PROPOSALS.md`.
**Class:** coordinated DB + RLS + UI change (same class as the HR column-casing debt). Do not implement piecemeal.

## Problem

SURYA's schema has no laboratory dimension. Scaling to other CSIR labs today means one
full deployment per lab: separate database, separate worker, separate SPA config.
That works (and stays the fallback), but the dissertation's scalability commitment
(§4.5) describes a single deployment serving multiple labs with lab-scoped data and
HQ-level cross-lab views.

## Design

### 1. `labs` table + `lab_code` dimension

```sql
create table public.labs (
  code       text primary key,          -- 'AMPRI', 'NEERI', ...
  name       text not null,
  city       text,
  created_at timestamptz not null default now()
);
insert into public.labs (code, name, city) values ('AMPRI', 'CSIR-AMPRI', 'Bhopal');
```

`lab_code text not null default 'AMPRI' references public.labs(code)` is added to:

- `documents` (drives RAG scoping — doc_pages/doc_indexes inherit through the FK)
- `divisions` (HR spine; staff/projects/etc. resolve lab via division)
- `user_profiles` (each user's home lab)
- `query_log`, `collection_indexes` (per-lab analytics and collections; for
  `collection_indexes` the PK becomes `(lab_code, collection_key)`)
- new entities going forward — checklist item in the 5-file dance

The `default 'AMPRI'` backfill means every existing row and every code path that
doesn't set `lab_code` keeps working unchanged. Tables that hang off a lab-carrying
parent (`doc_indexes`, `doc_pages`, `pms_reports`, …) do **not** get their own column —
they join through the parent, one source of truth.

### 2. RLS lab predicate

Helper mirroring the existing `proposals_caller_has_role` pattern:

```sql
create or replace function public.caller_lab_code() returns text
language sql stable security definer set search_path = public
as $$ select lab_code from public.user_profiles where user_id = auth.uid() $$;

create or replace function public.caller_can_see_lab(p_lab text) returns boolean
language sql stable security definer set search_path = public
as $$
  select p_lab = public.caller_lab_code()
      or public.proposals_caller_has_role('HQ')      -- cross-lab role, see §4
$$;
```

Each lab-carrying table's read policy gains `and public.caller_can_see_lab(lab_code)`.
Policies on child tables (e.g. `doc_pages_read`) already join to `documents`; the
predicate lands once, on the parent. Write policies: users write only into their own
lab (`lab_code = public.caller_lab_code()` in `with check`).

### 3. RAG stack

- Worker: unchanged (service role, processes all labs). `--build-collections`
  groups by `(lab_code, entity_type)` instead of `entity_type`.
- Query path: RLS on `documents` already narrows `read_docs`/`doc_pages`/
  `collection_indexes` to the caller's lab — **no query-service code change**,
  which is the payoff of doing this at the RLS layer.
- `select_corpus` collection keys become lab-scoped automatically via RLS.

### 4. Cross-lab capability

New role `HQ` (or extend `Director` with an `all_labs` flag on `user_profiles` —
decide at implementation; role is cleaner given the composite-role system).
`caller_can_see_lab` returns true for HQ, so cross-lab queries and dashboards need
no per-page changes. Lab picker UI (Layout header) only renders for HQ users and
writes the active lab filter into context, not localStorage (spoofable).

### 5. SPA

- `DataContext` loads are already RLS-scoped — no change for single-lab users.
- HQ dashboards: lab dimension appears in aggregations (group-by `lab_code`).
- Setup Wizard / seed: `supabase/seed/` gains the `labs` bootstrap row.

## Migration plan (when implemented)

1. `<TS>_labs.sql`: `labs` table + seed row + `lab_code` columns with defaults
   (pure additive, zero downtime).
2. `<TS>_lab_rls.sql`: helper functions + policy replacements, table by table.
3. SPA: HQ role in `ACCESS_MAP`, lab picker, dashboard group-bys.
4. Onboard lab #2: insert `labs` row, create its divisions/users with `lab_code`,
   point its document uploads at the same instance.

## Effort / risks

- ~3–4 sessions as estimated in the proposal; step 2 (RLS) is the risky one —
  every policy touch needs its existing tests plus a lab-isolation test
  (user in lab A must not read lab B's documents even with matching role).
- Per-deployment fallback remains valid for labs with data-residency constraints;
  this design doesn't preclude it.

## Non-goals

- Cross-lab PMS (appraisal stays within a lab's hierarchy).
- Federated auth across CSIR (single Supabase Auth instance assumed).
- Renaming existing HR CamelCase columns (separate debt item).
