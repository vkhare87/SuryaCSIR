# Phase 1: Foundation — Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Data layer for committees + helpdesk modules. Delivers: 9 new TypeScript interfaces, 10 Supabase tables with RLS, DataContext extensions that load committees + tickets via `useData()`, rich mock data for UI development in Phase 2-3, and DataMapper functions for all new entities. Nothing visible in the UI yet.
</domain>

<decisions>
## Implementation Decisions

### RLS Depth for Committees
- **D-01:** Shallow RLS — all authenticated users get SELECT on all tables. Admin roles (Director, SystemAdmin, MasterAdmin) get ALL (INSERT/UPDATE/DELETE). Write enforcement lives in app code, not RLS policies.
- **D-02:** No RPC write gates for committees. Trust app-level enforcement. No SECURITY DEFINER functions needed for committee CRUD.
- **D-03:** No minutes lock. Meeting minutes are always editable by chairperson, secretary, and admins. No time-based lock (RLS or app-level).
- **D-04:** Shared permissions module at `src/lib/committees/permissions.ts` — exports `canEditCommittee()`, `canScheduleMeeting()`, `canWriteMinutes()`, etc. Mirrors PMS pattern at `src/lib/pms/permissions.ts`.

### Routing Config Management
- **D-05:** Helpdesk routing managed via DB Wizard tab on existing `/db-wizard` page. Shows editable table of category→target mappings. No new settings page.
- **D-06:** Default routing: All 8 categories route to submitter's DivisionHead on first install. Admins customize via DB Wizard.
- **D-07:** Fallback chain when route target is empty: DivisionHead → HRAdmin → SystemAdmin. Last resort always exists.
- **D-08:** One row per category in `helpdesk_routing` table. Single target per category (no multi-target routing). Columns: category, target_type (division/role), target_id.

### Mock Data Strategy
- **D-09:** Rich seed data — 5 committees (varied types: Standing, AdHoc, Review, Advisory), 3 meetings per committee (past, today, upcoming), 15 action items across statuses, 20 tickets across all 8 categories with varied statuses and urgencies.
- **D-10:** Mock committee members and ticket submitters reference existing mock staff by ID. Realistic cross-referencing with the staff directory.

### Claude's Discretion
- Type casing: snake_case for new entity interfaces (aligns with Supabase column names, no legacy Excel headers to mirror). Different from HR entities but consistent with PMS tables.
- PK type: UUIDs for all new tables (supported by Supabase, matches spec).
- Committee types: Standing, AdHoc, Review, Advisory.
- Ticket categories: Infrastructure, EquipmentIT, Administrative, HRGrievance, Finance, LabResearch, Library, Transport.
- Ticket auto-close: 14-day resolved→closed trigger (pg_cron or edge function — planner decides implementation).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design & Requirements
- `docs/superpowers/specs/2026-05-07-committees-helpdesk-design.md` — Full design spec: data model, routes, workflows, permissions matrix, build order
- `.planning/ROADMAP.md` — Phase structure, dependency graph, success criteria
- `.planning/REQUIREMENTS.md` — 20 requirements with REQ-IDs and phase mapping

### Project Conventions
- `CLAUDE.md` — Coding rules, folder map, naming conventions, do/don't list

### Existing Code Patterns (read for reference)
- `supabase/migrations/20260501000000_vacancy_tables.sql` — RLS policy pattern (public.user_has_role() checks, auth.role() = 'authenticated' for read)
- `supabase/migrations/20260504000000_irins_sync.sql` — RPC + service_role policy pattern
- `src/contexts/DataContext.tsx` — Data loading pattern (Supabase→mock fallback, scopeData() for role filtering)
- `src/utils/dataMapper.ts` — Mapper pattern (dual-key: CamelCase || snake_case || default)
- `src/lib/pms/permissions.ts` — Permission module pattern to replicate for committees
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DataContext` pattern — loads from Supabase, falls back to mock, applies role scoping via `scopeData()`. New entities follow same pattern.
- `DataMapper` dual-key mappers — `mapXxxRow()` functions handle both CamelCase and snake_case column names. Passthrough for mock data.
- Migration RLS templates — `public.user_has_role()` function for role checks, `auth.role() = 'authenticated'` for read access.
- `useData()` hook — all pages consume data through this. New entities must be added to DataContextType interface.

### Established Patterns
- Types in `src/types/index.ts` — `interface` for entities, mixed casing (HR=CamelCase, PMS=snake_case). New entities use snake_case (greenfield, no Excel headers).
- Mock data in `src/utils/mockData.ts` — named array exports. Extended with committees + tickets data.
- Migrations in `supabase/migrations/` — timestamped SQL files. Pattern: tables→indexes→triggers→RLS.
- PMS permission modules in `src/lib/pms/` — replicated for committees at `src/lib/committees/`.

### Integration Points
- `src/types/index.ts` — add 9 interfaces (Committee, CommitteeMember, Meeting, AgendaItem, ActionItem, MeetingDocument, Ticket, TicketResponse, TicketEvent)
- `src/utils/mockData.ts` — add 9 mock arrays + rich seed data
- `src/utils/dataMapper.ts` — add 9 mapper functions
- `src/contexts/DataContext.tsx` — add 9 state arrays + loading logic + role scoping
- `supabase/migrations/20260507XXXXXX_committees_helpdesk.sql` — 10 tables + RLS
</code_context>

<specifics>
## Specific Ideas

No specific visual or behavioral references from discussion — implementation approach is standard SURYA patterns.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.
</deferred>

---

*Phase: 1-Foundation*
*Context gathered: 2026-05-07*
