# Phase 1: Foundation — Discussion Log

**Date:** 2026-05-07
**Mode:** Default (interactive)
**Areas discussed:** 3

## RLS Depth for Committees

### Question 1: Where should committee write permission enforcement live?
- **Presented:** Deep RLS (DB-level), Shallow RLS + app guard, Hybrid (RLS read, RPC write)
- **Selected:** Shallow RLS + app guard
- **Rationale:** All auth users read, admin roles write. App code checks chairperson/secretary before showing edit UI.

### Question 2: RPC write gates vs trust app?
- **Presented:** RPCs for sensitive writes, Trust app — no DB write gates
- **Selected:** Trust app — no DB write gates
- **Rationale:** No RPCs for committee CRUD. Simple RLS. App-level enforcement only.

### Question 3: 7-day minutes lock behavior?
- **Presented:** App-only soft lock, RLS hard lock + UI soft lock, No lock — always editable
- **Selected:** No lock — always editable
- **Rationale:** Keep it simple. Minutes always editable by chairperson, secretary, and admins.

### Question 4: Where should permission checks live?
- **Presented:** Shared module (src/lib/committees/permissions.ts), Inline in components, You decide
- **Selected:** Shared module (Recommended)
- **Rationale:** Single source of truth. Mirrors PMS pattern at src/lib/pms/permissions.ts.

**Status:** Resolved — moved to next area.

## Routing Config Management

### Question 1: Where should routing map be managed?
- **Presented:** DB Wizard tab, Static SQL in migration, New settings UI page
- **Selected:** DB Wizard tab (Recommended)
- **Rationale:** Extend existing /db-wizard. No new UI page needed.

### Question 2: Default routing mappings?
- **Presented:** Spec defaults (8 specific mappings), All → DivisionHead (simpler)
- **Selected:** All → DivisionHead (simpler)
- **Rationale:** Simplest default. Admins customize later via DB Wizard.

### Question 3: Fallback chain when target is empty?
- **Presented:** DivisionHead→HRAdmin→SysAdmin, DivisionHead only — NULL if missing
- **Selected:** DivisionHead→HRAdmin→SysAdmin
- **Rationale:** Three-step chain. Last resort always exists.

### Question 4: Single vs multiple targets per category?
- **Presented:** One row per category, Multiple targets per category
- **Selected:** One row per category (Recommended)
- **Rationale:** Simple, predictable. Columns: category, target_type, target_id.

**Status:** Resolved — moved to next area.

## Mock Data Depth

### Question 1: How comprehensive should mock data be?
- **Presented:** Rich seed (5 committees, 20 tickets, etc.), Minimal seed, You decide
- **Selected:** Rich seed (Recommended)
- **Rationale:** Realistic data for UI development in Phase 2-3.

### Question 2: Reference existing mock staff or standalone?
- **Presented:** Reference existing, Standalone names
- **Selected:** Reference existing (Recommended)
- **Rationale:** Realistic cross-referencing with staff directory.

**Status:** Resolved — ready for context.

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Discussion completed: 2026-05-07*
