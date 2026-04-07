# Concerns & Risks
_Last updated: 2026-04-07_

## Summary

SURYA is a functional MVP dashboard with a clear dual-mode architecture (mock data vs. Supabase), but it has several critical security exposures that must be resolved before real data is connected. Authentication is entirely hardcoded with a known plaintext password, Supabase credentials are stored in `localStorage`, and multiple feature areas (Calendar, Recruitment, Intelligence) are completely static with no database backing. The codebase has zero test coverage in application code.

---

## Critical Concerns

### 1. Hardcoded Admin Credentials in Source Code

- **File:** `SuryaFD/src/contexts/AuthContext.tsx` lines 40–41
- **Issue:** Login accepts `MasterAdmin` / `Admin` as plaintext credentials checked directly in source code. Any user who inspects the frontend bundle can extract these credentials.
- **Impact:** Any person who opens DevTools or reads the compiled JS bundle has full MasterAdmin access. This is a complete authentication bypass.
- **Fix approach:** Implement Supabase Auth (`supabase.auth.signInWithPassword()`). The TODO comment on line 52 already acknowledges this. Until provisioned, the app should either block login entirely or show a clear "demo mode only" banner — it must not accept real credentials over hardcoded checks.

### 2. Supabase Credentials Stored in localStorage

- **File:** `SuryaFD/src/utils/supabaseClient.ts` lines 8–9
- **Issue:** `surya_supabase_url` and `surya_supabase_anon_key` are stored in `localStorage`. While anon keys are intended to be public in Supabase's model, storing them in `localStorage` is still vulnerable to XSS. Any injected script can read `localStorage` and exfiltrate credentials.
- **Impact:** If XSS is ever introduced (e.g., via a future rich-text field), the database connection credentials become exposed.
- **Fix approach:** If the keys must be user-supplied via Setup Wizard, `sessionStorage` is marginally safer. Long-term, keys should be provisioned via environment variables at build time (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) and never stored client-side.

### 3. Session Stored as Unverified JSON in localStorage

- **File:** `SuryaFD/src/contexts/AuthContext.tsx` lines 23–34
- **Issue:** The session is `JSON.parse(localStorage.getItem('surya_session'))` without any signature or server verification. A user can manually craft a `surya_session` item in `localStorage` with `role: "MasterAdmin"` and bypass all role checks entirely.
- **Impact:** Full privilege escalation — any user can grant themselves MasterAdmin role by editing `localStorage`.
- **Fix approach:** Sessions must be verified server-side. With Supabase Auth, the JWT from `supabase.auth.getSession()` is verified on the backend. Until then, local session storage should not be trusted for role decisions.

### 4. No Connection Validation in Setup Wizard

- **File:** `SuryaFD/src/pages/SetupWizard.tsx` lines 15–18
- **Issue:** The comment reads "In a real app we'd try to connect first. Here we assume valid input." — the wizard accepts any URL and key, stores them, and reloads. No connection test is performed.
- **Impact:** Administrators can accidentally provision the app against a wrong or malicious Supabase endpoint. Subsequent data uploads would silently push institute data to an unverified destination.
- **Fix approach:** Before storing credentials, attempt a lightweight Supabase query (e.g., `supabase.from('divisions').select('count')`). Only store and reload on success.

---

## Technical Debt

### 5. Scientific Outputs and IP Intelligence Are Permanently Mock-Only

- **Files:** `SuryaFD/src/contexts/DataContext.tsx` lines 74–75, `SuryaFD/src/utils/mockData.ts` lines 213–256
- **Issue:** Even when Supabase is provisioned, `scientificOutputs` and `ipIntelligence` are always set from `mockData`. The comment on line 74 says "Fallback for data we haven't modeled yet in Supabase." These tables do not exist in Supabase.
- **Impact:** The Intelligence page (`SuryaFD/src/pages/Intelligence.tsx`) always displays 2 mock publications and 2 mock patents regardless of real institute data. All stats on the page (total publications, avg impact factor) are derived from mock data only.
- **Fix approach:** Create `scientific_outputs` and `ip_intelligence` tables in Supabase. Add migration paths in `dataMigration.ts` and add fetching to `DataContext.tsx` alongside other entities.

### 6. Calendar Page Is Entirely Hardcoded

- **File:** `SuryaFD/src/pages/Calendar.tsx` lines 38–49
- **Issue:** `SAMPLE_EVENTS` and `UPCOMING_ASSESSMENTS` are static arrays defined in the component. The "New Event" button has no handler — clicking it does nothing. Events cannot be added, edited, or deleted.
- **Impact:** The Calendar page is a visual prototype, not a functional feature. Events shown (e.g., "Budget Review FY26", "Project Audit GAP0111") are hardcoded to specific dates and will become stale immediately.
- **Fix approach:** Requires a `calendar_events` table in Supabase and full CRUD implementation. The page needs a form modal behind the "New Event" button.

### 7. Recruitment Page Is Entirely Hardcoded

- **File:** `SuryaFD/src/pages/Recruitment.tsx` lines 13–17, 83–87
- **Issue:** `vacancies` array and the onboarding pipeline list are static in-component constants. "New Vacancy" button has no handler. Vacancy detail navigation (`cursor-pointer`) has no route or action behind it.
- **Impact:** The Recruitment Portal displays hardcoded mock data and has no data management capabilities despite being gated to Admin/MasterAdmin role.
- **Fix approach:** Requires a `vacancies` table in Supabase. The click handler on each vacancy row needs to navigate to a detail/edit view.

### 8. Dashboard "S&T Output" Stat Is Hard-Coded to "N/A"

- **File:** `SuryaFD/src/pages/Dashboard.tsx` lines 197–200
- **Issue:** The "S&T Output" StatCard displays `value="N/A"` with subtitle "Publications & IP Pending" — this is a known stub acknowledged in code.
- **Impact:** A primary dashboard KPI is non-functional. The actual counts exist in `scientificOutputs` and `ipIntelligence` (even mock), but are not wired to this card.
- **Fix approach:** Wire `value={scientificOutputs.length + ipIntelligence.length}` once the data is sourced from real Supabase tables.

### 9. `Gender` Field Missing from TypeScript Interface but Present in Mock Data

- **Files:** `SuryaFD/src/types/index.ts` (StaffMember interface), `SuryaFD/src/utils/mockData.ts` lines 50–119
- **Issue:** `Gender` is present in all mock staff objects but is absent from the `StaffMember` TypeScript interface. The `ALLOWED_COLUMNS` for staff in `dataMigration.ts` also omits `Gender`. Dashboard gender parity calculations (`s.Gender === 'Male'`) rely on a field that TypeScript does not model, risking silent failures if data source changes.
- **Impact:** Gender demographic data on Dashboard will be blank (0/0) when real Supabase data is loaded, as `Gender` is filtered out by `ALLOWED_COLUMNS` during migration.
- **Fix approach:** Add `Gender?: string` to `StaffMember` interface in `src/types/index.ts` and add `'Gender'` to the `staff` array in `ALLOWED_COLUMNS` in `src/utils/dataMigration.ts`.

### 10. `mapStaffRow` Does Not Map `Gender` Field

- **File:** `SuryaFD/src/utils/dataMapper.ts` lines 26–49
- **Issue:** `mapStaffRow` does not include a `Gender` mapping, so even if the Supabase `staff` table has a gender column, it will be dropped during the mapping step.
- **Fix approach:** Add `Gender: row.Gender || row.gender || '',` to the `mapStaffRow` return object.

### 11. Column Name Typo Baked into Schema (`CompletioDate`)

- **Files:** `SuryaFD/src/utils/dataMigration.ts` line 111, `SuryaFD/src/utils/dataMapper.ts` line 62, `SuryaFD/src/types/index.ts` line 49
- **Issue:** The project completion date field is named `CompletioDate` (missing the `n`) throughout the entire stack — in the TypeScript type, the Supabase schema map, and the data mapper. This typo is now a de-facto contract with the database column name.
- **Impact:** Renaming it requires a coordinated database migration + code change. Any new developer will be confused. The mapper acknowledges this with `row.completio_date || row.completion_date` as a fallback.
- **Fix approach:** Plan a rename migration: rename DB column to `completion_date`, update TypeScript type, update all references. Not urgent but creates ongoing confusion.

### 12. `any` Types Used Pervasively in Data Layer

- **Files:** `SuryaFD/src/utils/dataMigration.ts` (lines 9, 33, 40, 41), `SuryaFD/src/utils/dataMapper.ts` (every mapper function parameter typed as `any`)
- **Issue:** All raw data rows from Supabase and parsed files are typed as `any`. Column table cells in Intelligence page also use `any` (`p: any`).
- **Impact:** TypeScript provides no safety when column names or data shapes change. Bugs from schema drift will only surface at runtime.
- **Fix approach:** Define raw Supabase row types (e.g., `SupabaseStaffRow`) and use them as mapper function parameter types. Use Supabase's `Database` generated types from `supabase gen types typescript`.

### 13. Data Upload Has No Row-Level Validation

- **File:** `SuryaFD/src/utils/dataMigration.ts` `formatData()` function
- **Issue:** `formatData()` strips unknown columns but performs no validation on values — required fields can be blank, dates are not validated for correct format, numeric fields (e.g., `SanctionedCost`) are not checked. Empty rows are filtered only by checking `Object.keys(row).length > 0`.
- **Impact:** Malformed data can be upserted to Supabase silently. Downstream date calculations (retirement forecaster, project end-date alerts) will silently fail on null/malformed dates from real imports.
- **Fix approach:** Add per-type validation schemas (e.g., using `zod`) before calling `pushToSupabase`. Return validation errors to the user in the migration log panel.

---

## Missing Features / Gaps

### 14. No Real Authentication Flow for Non-MasterAdmin Roles

- **File:** `SuryaFD/src/contexts/AuthContext.tsx` lines 51–53
- **Issue:** The `login` function returns `false` for any credentials other than `MasterAdmin`/`Admin`. There is no path for `Admin` or `User` role accounts to log in. The roles exist in the type system and the route guards check them, but no accounts can hold those roles.
- **Impact:** Multi-user operation is impossible. Division heads, scientists, and regular users cannot access the system even with a Supabase backend connected.
- **Fix approach:** Implement `supabase.auth.signInWithPassword()` and map Supabase user metadata (custom claim or a `user_roles` table) to the app's `Role` type.

### 15. No Application-Level Tests

- **Issue:** There are zero test files in `SuryaFD/src/`. The only test files found in the repo are inside `node_modules/`.
- **Impact:** Date parsing logic (`dateUtils.ts`), schema mapping (`dataMigration.ts`, `dataMapper.ts`), permission checking (`AuthContext.tsx`), and name matching (`staffNameMatchesAuthor`) are all untested. A change to date format handling could silently break the retirement forecaster and tenure alerts across the dashboard.
- **Priority:** High for `dateUtils.ts` and `dataMigration.ts` as these are pure functions with real business logic.

### 16. No Error Boundary or Fallback UI for Failed Supabase Fetches

- **File:** `SuryaFD/src/contexts/DataContext.tsx` lines 88–90
- **Issue:** The `catch` block in `loadData()` only logs to console. If any Supabase query fails (network error, RLS rejection, wrong table name), all data state remains at initial empty arrays `[]`. The UI renders with zero data and no error message.
- **Impact:** Production users would see blank dashboards with no indication of what went wrong.
- **Fix approach:** Add an `error` state to `DataContext`, surface it via the context value, and display an error banner in the `Layout` component when `error !== null`.

### 17. No Row Level Security (RLS) Verification in UI

- **Files:** `SuryaFD/src/utils/supabaseClient.ts`, `SuryaFD/src/contexts/DataContext.tsx`
- **Issue:** The app uses the `ANON` key for all Supabase queries (including in Setup Wizard). There is no sign that Supabase RLS policies have been defined or tested. With the anon key and no RLS, any user who finds the Supabase URL and anon key can query all tables directly without going through the app.
- **Impact:** Staff personal data (DOB, salary level, email) is accessible to anyone with the anon key if RLS is not configured in Supabase.
- **Fix approach:** Confirm RLS is enabled on all tables in Supabase. Switch authenticated routes to use `supabase.auth.getSession()` tokens. Document RLS policies in the repo.

### 18. `PrincipalInvestigator` Stored as a Name String, Not a Foreign Key

- **File:** `SuryaFD/src/types/index.ts` line 53 (comment: "May reference StaffName or StaffID")
- **Issue:** Project-to-staff linkage is by name string only. `staffNameMatchesSupervisor` and `staffNameMatchesAuthor` in `dateUtils.ts` use fuzzy matching to compensate. This is acknowledged in the type comment.
- **Impact:** If a staff member's name is updated or they leave, project linkages break silently. Fuzzy matching (`includes`) can produce false positives (e.g., "S. Kumar" matching multiple staff members named Kumar).
- **Fix approach:** Normalize to use staff `ID` as the foreign key in projects and phd_students tables, with a migration plan for existing data.

---

## Recommendations

Priority order for addressing concerns:

1. **Immediate (before any real data is loaded):**
   - Fix #3 (localStorage session role spoofing) — trivially exploitable
   - Fix #1 (hardcoded credentials) — implement Supabase Auth
   - Fix #17 (confirm RLS is active on Supabase tables)
   - Fix #4 (validate Supabase connection before storing credentials)

2. **Short-term (before multi-user rollout):**
   - Fix #14 (implement Admin/User login paths via Supabase Auth)
   - Fix #9 and #10 (Gender field in type and mapper — blocks real demographic data)
   - Fix #16 (surface data fetch errors to users instead of silent empty state)
   - Fix #5 (create and wire `scientific_outputs` and `ip_intelligence` Supabase tables)

3. **Medium-term (data quality and reliability):**
   - Fix #13 (add row-level validation before upsert)
   - Fix #12 (replace `any` types with Supabase-generated types)
   - Fix #15 (add unit tests for `dateUtils.ts` and `dataMigration.ts`)
   - Fix #18 (normalize PI and supervisor references to staff IDs)

4. **Low-priority cleanup:**
   - Fix #6 and #7 (implement Calendar and Recruitment as real features)
   - Fix #8 (wire S&T Output stat card to real data)
   - Fix #11 (rename `CompletioDate` → `completion_date` with DB migration)
   - Fix #2 (assess whether localStorage credential storage is acceptable given the threat model)
