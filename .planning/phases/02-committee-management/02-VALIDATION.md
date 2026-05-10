# Phase 2: Committee Management — Validation

**Created:** 2026-05-10
**Based on:** 02-RESEARCH.md Validation Architecture

## Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | none — create `vitest.config.ts` as Wave 0 |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

## Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CMT-01 | Committee list renders, search filters by name, type/status filter works | unit (component) | `npx vitest run src/pages/committees/__tests__/CommitteeList.test.tsx` | No (Wave 0) |
| CMT-02 | Admin can create committee (form -> Supabase insert), validation errors shown | integration | `npx vitest run src/components/committees/__tests__/CommitteeFormModal.test.tsx` | No (Wave 0) |
| CMT-03 | Committee detail renders 3 tabs, not-found UI for invalid ID | unit (component) | `npx vitest run src/pages/committees/__tests__/CommitteeDetail.test.tsx` | No (Wave 0) |
| CMT-04 | Meeting scheduling form validates, agenda items reorder via Reorder | integration | `npx vitest run src/components/committees/__tests__/MeetingFormModal.test.tsx` | No (Wave 0) |
| CMT-05 | Minutes autosave on blur, lock disables textarea after 7 days | unit (component) | `npx vitest run src/components/committees/__tests__/MinutesEditor.test.tsx` | No (Wave 0) |
| CMT-06 | File upload triggers Supabase storage call, download creates blob URL | integration | `npx vitest run src/components/committees/__tests__/DocumentUploader.test.tsx` | No (Wave 0) |
| CMT-07 | Action item status toggles Pending->InProgress->Completed->Pending | unit | `npx vitest run src/lib/committees/__tests__/permissions.test.ts` | No (Wave 0) |
| CMT-08 | Kanban renders 3 columns, overdue items have red styling, filters work | unit (component) | `npx vitest run src/components/committees/__tests__/KanbanBoard.test.tsx` | No (Wave 0) |
| CMT-permissions | Permission functions return correct boolean for each role | unit | `npx vitest run src/lib/committees/__tests__/permissions.test.ts` | No (Wave 0) |

## Sampling Rate

- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** All tests pass before `/gsd-verify-work`

## Wave 0 Gaps

- [ ] `vitest.config.ts` -- Vitest configuration file (none exists)
- [ ] `src/lib/committees/__tests__/permissions.test.ts` -- permission logic tests (highest priority -- pure functions, no mocking needed)
- [ ] `src/components/committees/__tests__/MinutesEditor.test.tsx` -- lock logic tests
- [ ] `src/components/committees/__tests__/KanbanBoard.test.tsx` -- kanban rendering + overdue logic
- [ ] `src/pages/committees/__tests__/CommitteeList.test.tsx` -- list rendering + filter tests
- [ ] `src/pages/committees/__tests__/CommitteeDetail.test.tsx` -- detail page + tab tests
- [ ] React Testing Library setup (`@testing-library/react`, `@testing-library/jest-dom`) -- not installed
- [ ] Supabase mock/setup for integration tests -- `vi.mock('@supabase/supabase-js')` or test helper

**Note:** The project currently has only one test file (`src/utils/dateUtils.test.ts`). Setting up comprehensive test infrastructure is a Wave 0 task. Given Phase 2 scope, prioritize unit tests for permissions (pure functions, no mocking) and component tests for lock logic + overdue computation.
