---
phase: 3
phase_slug: helpdesk
date: 2026-05-10
---

# Phase 3: Helpdesk — Validation Strategy

## Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | vite.config.ts (inline vitest config) |
| Quick run command | `npx vitest run src/lib/helpdesk/` |
| Full suite command | `npm test` (= `vitest run`) |

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Status |
|--------|----------|-----------|-------------------|--------|
| HD-01 | Ticket creation form renders all 8 categories | integration/smoke | Manual — page render verification | TO CREATE |
| HD-02 | Routing preview shows correct handler for category | unit | `vitest run src/lib/helpdesk/routing.test.ts` | TO CREATE |
| HD-03 | Filtering logic: status, category, urgency; sort by urgency+date | unit | `vitest run src/lib/helpdesk/ -- --grep "filter\|sort"` | TO CREATE |
| HD-04 | Status transitions: canTransitionStatus returns correct booleans | unit | `vitest run src/lib/helpdesk/permissions.test.ts` | TO CREATE |
| HD-05 | Admin permissions: canViewAllTickets, canReassign, canForceClose | unit | `vitest run src/lib/helpdesk/permissions.test.ts` | TO CREATE |
| HD-06 | Timeline icons mapped correctly to event types | unit | `vitest run src/lib/helpdesk/ -- --grep "timeline\|event"` | TO CREATE |
| HD-07 | Submitter can close own resolved ticket | unit | `vitest run src/lib/helpdesk/permissions.test.ts` | TO CREATE |
| HD-08 | Token format AMPRI-YYMMDD-XXX valid | integration | Manual (DB function) — RPC already exists | N/A (DB-side) |

## Sampling Rate

- **Per task commit:** `npx vitest run src/lib/helpdesk/` (permissions + routing unit tests, < 2s)
- **Per wave merge:** `npm test` (full test suite)
- **Phase gate:** `npm test` green + `npx tsc --noEmit` clean + `npx eslint src/` clean

## Wave 0 Test Gaps

- [ ] `src/lib/helpdesk/permissions.test.ts` — covers HD-04, HD-05, HD-07 permission functions
- [ ] `src/lib/helpdesk/routing.test.ts` — covers HD-02 routing preview logic
- [ ] `src/lib/helpdesk/constants.test.ts` — covers urgency/status color maps (optional, low priority)
- [ ] Test fixtures: `makeUser()` and `makeTicket()` helpers

## Security Threat Model

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | YES (inherited) | Supabase Auth |
| V3 Session Management | YES (inherited) | Supabase session tokens |
| V4 Access Control | YES | RLS + permissions module + RPC gating |
| V5 Input Validation | YES | Zod on TicketForm; RPC state transition validation |
| V6 Cryptography | NO | Not applicable |
| V7 Logging | YES | ticket_events + audit_log tables |

### Threat Mitigations

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Direct status manipulation bypassing RPC | Tampering | RLS blocks direct UPDATE; SECURITY DEFINER RPCs are only write path |
| Horizontal privilege escalation | Information Disclosure | Client-side useMemo filtering (UX, not security); acceptable for internal app |
| Response injection by unauthorized user | Spoofing | helpdesk_add_response RPC checks author_id = auth.uid() |
| Replay attacks on status transitions | Tampering | RPC validates current status before allowing transition |
| Token sequence collision | Denial of Service | Row-level locking within DB transaction |
