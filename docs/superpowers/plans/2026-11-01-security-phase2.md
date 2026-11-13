# Security Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the open findings SEC-02…SEC-18 of the security review, in 6 PRs, each cut from `main`.

**Architecture:** Database rules go in 2 new migrations and are tested in the PGlite harness. The RAG API asks the database one yes/no question (`can_use_ask_surya()`) before it does any work. The SPA gets one error translator, a page-level error boundary, and a visible "controls degraded" banner. Deploy and CI changes are config only.

**Tech Stack:** Postgres/Supabase RLS, PGlite harness (`scripts/db/pgliteHarness.ts`), FastAPI + pytest (`rag/`), React 19 + Vitest, nginx, GitHub Actions.

**Spec:** `docs/roadmap/sources/SECURITY-REVIEW-2026-11-01.md` (read with this plan; its §3 has the reference SQL/Python). Where this plan differs from the spec, this plan wins — each difference is marked **Δ** and was checked against `origin/main` on 2026-11-01.

## Global Constraints

- Never edit a shipped migration. New migrations sort after `20261102000007`: use `20261102000008_*` and `20261102000009_*`.
- Every new `SECURITY DEFINER` function opens with an authorization block **and** has `SET search_path = public`. `python scripts/check_security_definer.py` must pass.
- RLS is the only hard gate. Never fix a denial by widening a grant.
- Never run `supabase db push`. Say when a migration is ready; the user pushes it.
- Typecheck gate is `npm run build`, not `npx tsc --noEmit`.
- Each PR: `npm run lint` (0 errors), `npm test`, `npm run build`; `python -m pytest` in `rag/` when `rag/` changes.
- Do not touch `.claude/settings.local.json` or `docs/roadmap/ROADMAP.md` (other sessions' edits).

## Already done or changed since the review (do not redo)

- **WO-S1 / SEC-01: done.** Shipped as WO-1/WO-2 in #16, live since 2026-11-01. Tick it in the review's §6 tracker.
- **SEC-14 CI line `update-design-debt.mjs`: done** in #19 (`ci.yml:21`).
- **TRUNCATE for client roles: already revoked** on every table by `20261102000006` §6e. Do not repeat it.
- **SEC-12 list shrank.** `ReportNew`, `ReportView`, `ReportEdit`, `ProjectReportForm` now have `.catch`. Still open: `SystemAdminView.tsx` (3), `CommandPalette.tsx`, `useDirectorThresholds.ts`, `MyWork.tsx`, `pms/AuditLog.tsx`, plus `AuthContext.tsx` and `lib/auth/bearerToken.ts` (special path, Task 9).
- **SEC-06 count grew.** 72 raw `.message` sites in 40 files, not 30. Regenerate the list in Task 6; do not use the spec's list.
- **New: `react-router` / `react-router-dom` high advisory** in runtime deps (`npm audit --omit=dev`, fix available). Not in the review. Task 11 takes it.

## Decisions (defaults used unless the user overrides)

1. **Δ Path namespacing does not break existing files.** `documents_storage_select` keys on the registry row, not on the path, so the 7 live documents (all `institute` tier, checked live) stay readable. The new rule applies to new uploads only. No rewrite and no legacy window needed. The `ingest/` worker uses the service role, which bypasses RLS, so its paths are unaffected.
2. **Per-role feature blocks stay a UI concern.** The API honours only the global `feature_controls.enabled` for `/ask` (spec §5.2 default).
3. **CSP `connect-src`: the exact project origin**, taken from `VITE_SUPABASE_URL` at deploy time, not `*.supabase.co`.
4. **Asymmetric JWT keys: deferred.** Task 10 does the 3 cheap steps (ACL, `jti`, audit row) and documents step 4 as follow-up.
5. **Dev login stays, behind `VITE_DEV_LOGIN=1`** (spec option), not deleted.

## Review Focus

1. **Our own RPC messages must survive the error translator.** `RAISE EXCEPTION` text (SQLSTATE `P0001`), for example "Report is already finalized" or the 15-day appeal refusal, is written by us and is the only useful text the user gets. `friendlyError` passes `P0001` through unchanged. Test in Task 6.
2. **Helpdesk and committee writes still log after audit becomes append-only.** `audit_row_change()` is `SECURITY DEFINER`, so it must still insert. Test in Task 2.
3. **A verified user who is acting as a pending role.** `caller_is_verified()` reads all of the caller's `user_roles`, not the active role, so a Scientist whose active role is `DefaultUser` still passes. Test in Task 1.
4. **The RAG gate fails closed.** If the `can_use_ask_surya` RPC errors or returns null, the API answers 403, never 200. Test in Task 3.
5. **A workbook exactly at the limits.** 25 MB and 50 000 rows are allowed; one byte or one row more is refused before or right after `XLSX.read`. Test in Task 5.

---

## PR 1 — Database gates (Tasks 1, 2, 4) · branch `fix/sec-db-gates`

**Order to go live:** deploy the SPA with Task 4 first, then push `20261102000008`. The old storage rule accepts the new `<uid>/…` paths, but the new rule refuses the old ones, so the other order breaks uploads in between.

### Task 1: Verified-only access to Ask SURYA and institute documents; namespaced uploads (SEC-02 SQL, SEC-04, SEC-11 SQL)

**Files:**
- Create: `supabase/migrations/20261102000008_verified_gates.sql`
- Test: `scripts/db/security.db.test.ts` (new; same style as `scripts/db/schema.db.test.ts`)

**Interfaces:**
- Produces: `public.caller_is_verified() RETURNS boolean`, `public.can_use_ask_surya() RETURNS boolean` (Task 3 calls it by name, no args).

- [ ] **Step 1: Write the failing tests** in `scripts/db/security.db.test.ts`, using `migratedDb()` and `as()`:
  - `caller_is_verified is false for a DefaultUser-only account and true for a Scientist`
  - `caller_is_verified is true for a Scientist whose active_role is DefaultUser` (Review Focus 3)
  - `can_use_ask_surya is false when feature_controls has ('/ask', enabled=false)` and `true when there is no row`
  - `anon cannot execute can_use_ask_surya`
  - `a DefaultUser reads 0 institute-tier documents; a Scientist reads 1`
  - `a Scientist cannot insert storage.objects (bucket 'documents') at name 'proposal/x/f.pdf'`; `can insert at '<own uid>/proposal/x/f.pdf'`
  - `documents_insert refuses storage_path outside '<own uid>/'`
- [ ] **Step 2: Run, expect FAIL** — `npx vitest run scripts/db/security.db.test.ts` → functions do not exist / rows visible.
- [ ] **Step 3: Write the migration.** Take the spec's SQL from WO-S2 (both functions + grants + anon check) and WO-S3 (`documents_can_read`, `documents_storage_insert`, `documents_insert`). Changes to the spec SQL:
  - Both functions stay `LANGUAGE sql`: the linter accepts `auth.uid()` / `caller_is_` in the body. Policies use `(SELECT auth.uid())`, or the WO-6d test in `schema.db.test.ts` fails. *(done in PR 1)*
  - **Δ** `documents_insert` keeps the live tier rule from `20260725000001:140` (`caller_is_admin() OR caller_has_role('Director') OR access_tier IN ('owner','confidential')`) and adds `storage_bucket = 'documents' AND storage_path LIKE auth.uid()::text || '/%'`. Note: PMS annexures use bucket `annexures` through `registerDocument` — check `src/contexts/PMSContext.tsx` `uploadAnnexure`; scope the path rule to `storage_bucket = 'documents'` only, or that flow breaks.
  - Header comment says why (one paragraph, like `20261102000006`).
- [ ] **Step 4: Run, expect PASS** — same command; then `npm test -- scripts/db` and `python scripts/check_security_definer.py`.
- [ ] **Step 5: Commit** — `fix(db): verified-only Ask SURYA gate and institute docs; namespaced uploads (SEC-02, SEC-04, SEC-11)`

### Task 2: Append-only audit trail; no client writes to tickets (SEC-05)

**Files:**
- Create: `supabase/migrations/20261102000009_append_only_audit.sql`
- Test: `scripts/db/security.db.test.ts` (extend)

- [ ] **Step 1: Write the failing tests:**
  - `a Director cannot UPDATE or DELETE audit_log rows` (expect error or 0 rows changed)
  - `a Director cannot INSERT into audit_log directly`
  - `a Director cannot UPDATE or DELETE tickets directly`
  - `updating a committee as its admin still writes an audit_log row` (Review Focus 2)
  - `the helpdesk status RPC still changes status and writes its ticket_events row`
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Write the migration.** **Δ simpler than the spec:** no client code writes either table (checked: `src/` only selects `tickets` and never touches `audit_log`; `audit_row_change()` and the helpdesk RPCs are `SECURITY DEFINER`). So:
  - `DROP POLICY IF EXISTS "audit_log_write" ON public.audit_log;` — no replacement policy (same as `pms_audit_logs`).
  - `DROP POLICY IF EXISTS "tickets_write" ON public.tickets;` — no replacement.
  - `REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated, anon;` and `REVOKE INSERT, UPDATE, DELETE ON public.tickets FROM authenticated, anon;`
  - **Δ** `ticket_events` and `ticket_responses` had the same `FOR ALL` admin write policy and no client writer either; they get the same treatment. *(done in PR 1)*
  - Skip the spec's trigger: with no policy and no grant there is no path left to guard.
- [ ] **Step 4: Run, expect PASS**, plus `npm test -- scripts/db` (helpdesk tests must stay green).
- [ ] **Step 5: Commit** — `fix(db): audit_log and tickets are append-only for clients (SEC-05)`.

### Task 4: Uploads go under the uploader's uid; cleanup failure is not silent (SEC-11 client)

**Files:**
- Modify: `src/lib/documents/registry.ts:77-105` (`uploadDocument`)
- Test: `src/lib/documents/registry.test.ts` (extend; mock `../../utils/supabaseClient`)

- [ ] **Step 1: Failing tests:** `uploadDocument uploads to '<uid>/<entityType>/<entityId>/<epoch>_<name>'`; `returns 'Not signed in' when there is no user`; `when registry insert fails and remove fails, the error mentions the leftover file and logger.error is called`.
- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/documents/registry.test.ts`.
- [ ] **Step 3: Implement.** Get the uid from `supabase.auth.getSession()` (CLAUDE.md: session via `getSession`), prefix the path, check the `remove` result. Update the JSDoc path format line above the function.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `fix(documents): uploads live under the uploader's uid (SEC-11)`. Tell the user both migrations are ready, and the deploy order above.

## PR 2 — RAG API gate and bounds (Task 3) · branch `fix/sec-rag-gate`

Depends on PR 1 being **pushed live**; until then every API call answers 403.

### Task 3: Authorise and bound the Ask SURYA API (SEC-02, SEC-09)

**Files:**
- Modify: `rag/api.py` (`_authed_client` :58-70, `similar` :117-130, `map_columns` :144-160, models :48-56, :112)
- Test: `rag/tests/test_api_auth.py` (new; FastAPI `TestClient`, monkeypatch `api.verify_token` and `api.scoped_client` with a fake whose `.rpc(...).execute().data` is set per test, in the style of `_FakeClient` in `rag/tests/test_query_service.py`)

**Interfaces:**
- Consumes: `can_use_ask_surya()` from Task 1.
- Produces: `can_use_ask(client) -> bool` in `rag/api.py`; constants `MAX_QUESTION_CHARS = 2000`, `MAX_HISTORY_TURNS = 6`.

- [ ] **Step 1: Write the failing tests:**
  - `test_query_403_when_gate_false`, `test_query_200_when_gate_true`
  - `test_query_403_when_gate_rpc_raises` and `..._returns_none` (Review Focus 4)
  - `test_similar_403_when_gate_false`, `test_map_columns_403_when_gate_false`, `test_stream_403_when_gate_false`
  - `test_history_of_7_turns_is_422`, `test_question_of_2001_chars_is_422`, `test_empty_question_is_400`
- [ ] **Step 2: Run, expect FAIL** — `cd rag && python -m pytest tests/test_api_auth.py -v`.
- [ ] **Step 3: Implement** per spec WO-S2 Python: `can_use_ask(client)` (deny on any exception), call it after `scoped_client` in `_authed_client`, `similar`, `map_columns`; pydantic `Field` bounds on `HistoryTurn`, `QueryIn`, `SimilarIn`. Keep the empty-question 400.
- [ ] **Step 4: Run, expect PASS**, then the full `python -m pytest` in `rag/`.
- [ ] **Step 5: Commit** — `fix(rag): API asks can_use_ask_surya and bounds input (SEC-02, SEC-09)`

## PR 3 — xlsx (Task 5) · branch `fix/sec-xlsx`

### Task 5: Replace xlsx 0.18.5; cap file size and rows (SEC-03)

**Files:**
- Modify: `package.json` / `package-lock.json` (`xlsx` → `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`)
- Modify: `src/utils/dataMigration.ts` (`parseFile`)
- Test: `src/utils/dataMigration.test.ts` (extend)

**Interfaces:** constants `MAX_UPLOAD_BYTES = 25 * 1024 * 1024`, `MAX_UPLOAD_ROWS = 50_000` exported from `dataMigration.ts`.

- [ ] **Step 1: Failing tests:** `parseFile refuses a file of MAX_UPLOAD_BYTES + 1 without calling XLSX.read` (spy) and `accepts exactly MAX_UPLOAD_BYTES`; `refuses MAX_UPLOAD_ROWS + 1 rows` and `accepts exactly MAX_UPLOAD_ROWS` (Review Focus 5). Errors are `{ success: false, error: 'File too large (max 25 MB).' }` and `'Too many rows (max 50,000).'`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3:** `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, then add the two checks.
- [ ] **Step 4: Verify** — tests pass; `npm ls xlsx` → `0.20.3`; `npm audit --omit=dev` has no `xlsx` entry.
- [ ] **Step 5: Commit** — `fix(deps): xlsx 0.20.3 from SheetJS CDN; size and row caps (SEC-03)`

## PR 4 — Errors users see (Task 6) · branch `fix/sec-error-text`

### Task 6: One error translator; swap every raw-message site (SEC-06)

**Files:**
- Create: `src/lib/errors.ts`, test `src/lib/errors.test.ts`
- Modify: every file from the grep in Step 3, plus `src/pages/Login.tsx` and `src/contexts/DataContext.tsx` (partial-load toast)

**Interfaces:** `friendlyError(error: unknown, fallback?: string): string` — code table from spec WO-S6, **Δ plus** `P0001` → the error's own `message` (Review Focus 1).

- [ ] **Step 1: Failing tests** in `errors.test.ts`: `23505 → 'That record already exists.'`; `42501 → "You don't have permission to do that."`; `P0001 passes its message through`; `unknown code → fallback`; `a plain Error with no code → fallback`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `errors.ts`, then list sites with `git grep -nE "(setError|push|pushToast|alert)\(.*\.message" -- src ':!*.test.*'` (72 today) and replace each with `friendlyError(err, '<existing fallback>')` + `logger.error('[<module>] <action> failed', err)`. DataContext toast: "N table(s) failed to load", table list only in `logger.error`. Login: keep `Invalid login credentials`, map the rest to "Sign-in failed. Please try again or contact your administrator.", detect the schema case by `error.status === 500`.
- [ ] **Step 4: Verify** — `npm test`; the grep from Step 3 returns 0 lines; `npm run lint`; `npm run build`.
- [ ] **Step 5: Commit** — `fix(ui): show friendly errors, log the raw ones (SEC-06)`

## PR 5 — Deploy edge (Task 7) · branch `fix/sec-nginx`

### Task 7: nginx headers, `/rag/` rate limit, self-hosted fonts, title (SEC-08, SEC-09, SEC-17)

**Files:**
- Modify: `deploy/nginx.conf`, `deploy/README.md` (the `limit_req_zone` line goes in the host's `http {}` block — document it, do not put it in `deploy/nginx.conf`)
- Create: `public/fonts/*.woff2` (Fraunces, IBM Plex Mono, Inter, Tiro Devanagari Sanskrit — the weights in `index.html:30`)
- Modify: `src/index.css` (`@font-face`), `index.html` (delete lines 26-31; `<title>SURYA — CSIR-AMPRI</title>`)
- Test: `src/index.html.test.ts` or extend an existing static test: `index.html has no fonts.googleapis.com` and `title is 'SURYA — CSIR-AMPRI'`.

- [ ] **Step 1: Failing test** for the two `index.html` checks.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** headers and `/rag/` block from spec WO-S7. `connect-src 'self' <VITE_SUPABASE_URL origin>` (Decision 3); write the origin as a placeholder `__SUPABASE_ORIGIN__` and a one-line `sed` in `deploy/README.md` that fills it. Font files: download once from Google Fonts (ask the user before the download, per the download rule) or `@fontsource/*` packages if the user prefers npm.
- [ ] **Step 4: Verify** — test passes; `npm run build`; `nginx -t` if nginx is available, else state it was not run. Live checks from spec WO-S7 Verify are for the deploy, not this PR.
- [ ] **Step 5: Commit** — `fix(deploy): security headers, rag rate limit, self-hosted fonts (SEC-08, SEC-09, SEC-17)`

## PR 6 — Resilience and auth hardening (Tasks 8–11) · branch `fix/sec-hardening`

### Task 8: No silent spinners; page-level error boundary; degraded-controls banner (SEC-12, SEC-13)

**Files:**
- Modify: `SystemAdminView.tsx`, `CommandPalette.tsx`, `useDirectorThresholds.ts`, `MyWork.tsx`, `pms/AuditLog.tsx` (add `.catch` per spec WO-S9 pattern, using `friendlyError` from Task 6)
- Modify: `src/components/layout/Layout.tsx` (wrap `<Outlet />` in `<ErrorBoundary key={pathname}>` with a fallback card), `src/components/ErrorBoundary.tsx` (accept a `fallback` prop if it does not)
- Modify: `src/contexts/FeatureControlContext.tsx` (`controlsDegraded: boolean`, true on read failure), `Layout.tsx` banner "Feature controls unavailable — all features are enabled" with `role="alert"`
- Test: `src/components/ErrorBoundary.test.tsx`, `src/contexts/FeatureControlContext.test.tsx`

- [ ] **Step 1: Failing tests:** `a throwing child renders the fallback and the sibling chrome stays`; `controlsDegraded is true when the feature_controls read errors and false when it succeeds`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Re-run the `.then` without `.catch` scan from this plan's "Already done" list before editing; fix what it finds.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `fix(ui): catch load failures, page error boundary, degraded-controls banner (SEC-12, SEC-13)`

### Task 9: Dev login needs an explicit flag; token fallback respects sign-out (SEC-07, SEC-16)

**Files:**
- Modify: `src/contexts/AuthContext.tsx:127` — condition becomes `import.meta.env.VITE_DEV_LOGIN === '1' && !import.meta.env.PROD && …`; add `.catch` to the `.then` at the session load
- Modify: `src/lib/auth/bearerToken.ts` — module flag `signedOutSinceMount`, set from `supabase.auth.onAuthStateChange` on `SIGNED_OUT`; use `storedToken()` only when `getSession()` **timed out** (distinguish timeout from a `null` session) and the flag is false
- Modify: `.env.example` (`VITE_DEV_LOGIN=`), `docs/engineering/development_guide.md` (one line)
- Test: `src/lib/auth/bearerToken.test.ts` (new)

- [ ] **Step 1: Failing tests:** `getSession returns null → throws 'Not signed in' even with a stored token`; `getSession times out → uses stored token`; `after SIGNED_OUT, a timeout does not use the stored token`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** — tests pass; `npm run build` then `grep -l "admin@dev.local" dist/assets/*.js` prints nothing.
- [ ] **Step 5: Commit** — `fix(auth): dev login behind VITE_DEV_LOGIN; no stored-token reuse after sign-out (SEC-07, SEC-16)`

### Task 10: JWT secret blast radius, cheap steps (SEC-10)

**Files:**
- Modify: `rag/auth.py` `mint_user_token` (add `"jti": uuid.uuid4().hex`), `rag/worker.py:64-70` (one `BRIEF_TOKEN_MINTED` audit row per mint with owner, schedule id, jti — use the worker's existing db audit helper; if none exists, insert into `audit_log` with the service client)
- Modify: `deploy/README.md:118` — mark `SUPABASE_JWT_SECRET` as the most sensitive value, add the `icacls` line from spec WO-S8, and note asymmetric keys as follow-up (Decision 4)
- Test: `rag/tests/test_briefs.py` (extend)

- [ ] **Step 1: Failing tests:** `minted token has a 32-hex jti and two mints differ`; `a brief run records exactly one BRIEF_TOKEN_MINTED row with that jti`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `python -m pytest` in `rag/` → PASS.
- [ ] **Step 5: Commit** — `fix(rag): jti and audit row per minted brief token (SEC-10)`

### Task 11: Dependencies, CI gates, mock-file guard (SEC-14, SEC-15, SEC-18)

**Files:**
- Modify: `package.json` — `zod@latest`, `react-router`/`react-router-dom` to the fixed version, `overrides` from spec WO-S11 (check each is still needed with `npm audit` first; drop ones that are not)
- Modify: `.github/workflows/ci.yml` `spa` job — `npm audit --audit-level=high --omit=dev` and `gitleaks/gitleaks-action@v2` (`update-design-debt` is already there)
- Modify: every `supabase/mock/*.sql` (18 files) — prepend the guard from spec WO-S11
- Test: `scripts/db/mockGuard.test.ts` — `every supabase/mock/*.sql starts with the dev-only guard` (file read, no DB)

- [ ] **Step 1: Failing test** for the mock guard.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** all three parts.
- [ ] **Step 4: Verify** — `npm audit --omit=dev` exits 0; `npm test`; `npm run build`; CI green on the PR.
- [ ] **Step 5: Commit** — `chore(deps,ci): runtime audit gate, secret scan, mock guard (SEC-14, SEC-15, SEC-18)`

---

## After all PRs

- Tick each WO in the review's §6 tracker; WO-S1 points to #16.
- Live checks the PRs cannot do (need the deployed host): spec WO-S2 `curl` 403/200, WO-S7 header and 429 checks, CSP console check on Dashboard / Ask SURYA / a DataTable page / a PDF preview.
- The review says to engage a professional pentest before the institute-wide rollout. This plan does not replace that.
