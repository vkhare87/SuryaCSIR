# SURYA — security findings, phase 2

Date: 2026-11-01. Scope: whole codebase re-read after the data-ops work — `src/`, `supabase/migrations/`
(38 files, newest `20261101000002_contribution_target_scope.sql`), `rag/`, `ingest/`, `deploy/`, `scripts/`,
`package.json` + `npm audit` output.

Companion to [BUG-REMEDIATION-2026-11-01.md](BUG-REMEDIATION-2026-11-01.md). That brief carries the
correctness bug list; this one carries the security surface: unauthorised API access, data-leak paths,
supply chain, auth weaknesses, SQL-layer integrity, verbose errors.

**This is an AI-assisted source review, not a penetration test.** Every finding was read out of the code
at the cited line, and the RAG/LLM surface in particular deserves a real attacker's attention before the
app goes institute-wide.

---

## 1. How to use this

Each work order is self-contained: what is wrong, the evidence, the fix (copy-pasteable), and how to prove
it is fixed. Take one work order, land it as its own PR, tick the box in §6.

**Rules that override anything here** (`CLAUDE.md`, `supabase/CLAUDE.md`):

1. Never edit a shipped migration. New file, timestamp after `20261101000002`.
2. Every new `SECURITY DEFINER` function opens with an authorization block **and** pins `SET search_path`.
3. Client-supplied actor ids must be asserted equal to `auth.uid()::text`.
4. RLS is the only hard gate — do not add a second authorization path in the client, and never "fix" a
   denial by widening a grant.
5. Never paste SQL into the Supabase Dashboard editor; `supabase db push` is the only path.

---

## 2. Register

Severity: **P0** institute-record integrity · **P1** confirmed vulnerability, realistic exploit path ·
**P2** real but needs a precondition · **P3** hardening / hygiene.

| ID | Sev | Conf | Category | Finding | Evidence |
|---|---|---|---|---|---|
| SEC-01 | **P0** | 9/10 | SQL / access control | Client can write PMS workflow state (`status`, `duty_days`, `self_score`) on their own report, and re-point an evaluation at any report | `20260712000004_pms.sql:787-795`, `:862-863`, `:496-505` |
| SEC-02 | **P1** | 9/10 | Unauthorised API | Ask SURYA API accepts any valid JWT; `Guest`/`DefaultUser` bypass the `/ask` role gate with `curl` | `rag/api.py:58-70`, `rag/auth.py:14-23` |
| SEC-03 | **P1** | 10/10 | Supply chain | `xlsx@0.18.5` prototype pollution + ReDoS, and the app parses untrusted workbooks in the browser | `package.json:34`, `src/utils/dataMigration.ts` |
| SEC-04 | **P1** | 9/10 | Data leak | `institute`-tier documents are readable by every authenticated user, including unverified roles | `20260712000008_rag_documents.sql:69` |
| SEC-05 | **P1** | 9/10 | Repudiation | `audit_log` and `tickets` are `FOR ALL` (incl. `DELETE`) to Director/SystemAdmin/MasterAdmin — the audit trail is erasable by the roles it records | `20260712000005:299-302`, `20260725000004:112-122` |
| SEC-06 | **P2** | 9/10 | Verbose errors | Raw Postgres `error.message` in the UI at 30+ sites — leaks table/constraint names and other users' key values | see WO-S6 |
| SEC-07 | **P2** | 9/10 | Hardcoded credential | Dev superuser backdoor `admin@dev.local` / `admin123`, gated only on `import.meta.env.DEV` | `src/contexts/AuthContext.tsx:126-137` |
| SEC-08 | **P2** | 9/10 | Infra | nginx sends no security headers (no HSTS, CSP, `frame-ancestors`, `nosniff`, `Referrer-Policy`) | `deploy/nginx.conf` |
| SEC-09 | **P2** | 8/10 | Cost abuse | No rate limit or length cap on `/query`, `/similar`; `history` is an unbounded list | `rag/api.py:48-56,73-130` |
| SEC-10 | **P2** | 9/10 | Auth design | `SUPABASE_JWT_SECRET` + `mint_user_token()` can impersonate any user, incl. MasterAdmin | `rag/auth.py:30-43`, `deploy/README.md:118` |
| SEC-11 | **P2** | 8/10 | Data leak | `documents` bucket accepts writes to any path; registry rows are not namespaced to the uploader; orphaned objects are claimable | `20260712000008:115-118`, `registry.ts:82,102` |
| SEC-12 | **P2** | 8/10 | Error handling | 15+ `.then()` with no `.catch()` → permanent spinner; one root `ErrorBoundary` so any page crash blanks the shell | `SystemAdminView:88,98`, `pms/ReportNew:38`, `ReportView:40`, `ProjectReportForm:32` |
| SEC-13 | **P2** | 8/10 | Fail-open switch | `FeatureControlContext` defaults open on any read failure — a kill switch that fails open is not one | `FeatureControlContext.tsx:37-58` |
| SEC-14 | **P3** | 8/10 | Supply chain | 26 high / 30 moderate advisories, all in the dev toolchain; two are Windows-local-dev specific | `npm audit` |
| SEC-15 | **P3** | 7/10 | Supply chain | `zod` memory-exhaustion advisory; `ws` advisories unreachable (zero realtime usage) | `package.json:35` |
| SEC-16 | **P3** | 8/10 | Auth robustness | gotrue lock disabled (`noopLock`) + `bearerToken()` localStorage fallback → cross-tab refresh races, revoked-token reuse up to the 1 h TTL | `supabaseClient.ts:13-21`, `bearerToken.ts:15-47` |
| SEC-17 | **P3** | 9/10 | Third party | Google Fonts loaded from `fonts.googleapis.com` by every client — IP/referrer leak, breaks air-gapped | `index.html:26-31` |
| SEC-18 | **P3** | 8/10 | Secrets hygiene | `mock/17_test_auth_users.sql` creates a MasterAdmin with `Test@1234` and has no production guard (not auto-seeded — `config.toml:45` seeds `./seed/*.sql` only) | `supabase/mock/17_test_auth_users.sql` |

### Verified clean — do not re-audit

No committed secrets and none in git history (`git log -S'eyJhbGciOi'` → one hit, the truncated
placeholder in `SetupWizard.tsx:74`); `deploy/profiles/*.env` values are all empty; scripts read the
service key from env and `reset_user_password.py` refuses passwords on the command line. No SQL injection:
all access goes through PostgREST builders or parameterised RPCs, and `rag/analytics.py` is a hard
whitelist of functions, never free-form SQL. No XSS sink: zero `dangerouslySetInnerHTML` / `innerHTML` /
`eval` in `src/`, and Ask SURYA renders model output as text (`AskSurya.tsx:146,179`). IMAP TLS is done
correctly (`ingest/mail_source.py:63-72` — explicit `create_default_context`, with the `imaplib`
unverified-context trap documented). Service-key split is real (`--host 127.0.0.1`, `/rag/` same-origin).
`query_log`, `scheduled_queries`, `feature_grants`, `tickets_select` and `pms_audit_logs` (no client write
path) are correctly scoped. Auth config is strong: `enable_signup = false`, 12-char minimum with four
character classes, refresh-token rotation, confirmations on.

---

## 3. Work orders

---

### WO-S1 — Close the client-writable PMS state machine (SEC-01) · P0 · S

This is **still open**. It is WO-1 + WO-2 of
[BUG-REMEDIATION-2026-11-01.md](BUG-REMEDIATION-2026-11-01.md) — land those two migrations first and take
the code from there rather than re-deriving it here.

Confirm the hole is still present before you start:

```bash
# should print the two policies with scientist_id as the only constraint
grep -n 'reports_insert\|reports_update' supabase/migrations/20260712000004_pms.sql

# should print NOTHING (no later migration redefines them)
grep -rn 'DROP POLICY IF EXISTS "reports_update"' supabase/migrations/
```

**Why it is P0 here too:** it is the same class as everything else in this document — the database does
not enforce a rule the UI assumes. A scientist can `UPDATE … SET status='FINALIZED'` on their own draft and
legitimately be paid on a score no committee produced.

**Verify:** the T21–T24 tests from WO-1 (T24 proves the `current_user` discriminator did not break
`pms_submit_report`), plus `supabase db reset` and the full E2E appraisal smoke.

---

### WO-S2 — Authorise the Ask SURYA API, and cap what one caller can spend (SEC-02, SEC-09) · P1 · S

**Problem.** `verify_token` answers "is this a real Supabase user?" — it never asks "may this user use Ask
SURYA?". `ACCESS_MAP['/ask'] = VERIFIED` (`src/constants/access.ts:37`) and the `PENDING` comment ("kept out
of anything that reads institute knowledge until an admin approves a real role") are enforced only by
`Sidebar` + `ProtectedRoute`. RLS deliberately opens `institute`-tier documents to any `auth.uid()`
(SEC-04), so the API is the perimeter and it is open.

**Exploit.** An approved-but-unverified account (`DefaultUser`, JWT `role: authenticated`) sends
`POST /rag/query` with its own bearer token and gets cited answers over institute documents, bypassing the
page gate entirely. Same token also drives `/similar` and `/map-columns`, each of which costs a model call.

**Fix — SQL (new migration `20261102000008_can_use_ask_surya.sql`):**

```sql
-- ============================================================
-- 20261102000008_can_use_ask_surya
-- The /ask page is VERIFIED-only in ACCESS_MAP, but the RAG API accepted any
-- valid JWT, so an unverified (Guest / DefaultUser) account could query the
-- corpus directly. One function answers the same question the SPA answers.
-- Takes no argument, so it cannot be used to probe other users.
-- ============================================================
CREATE OR REPLACE FUNCTION public.caller_is_verified()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    -- Mirrors VERIFIED in src/constants/access.ts: every role except the two
    -- un-provisioned ones.
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
         WHERE user_id = auth.uid()
           AND role NOT IN ('Guest', 'DefaultUser')
    );
$$;

CREATE OR REPLACE FUNCTION public.can_use_ask_surya()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    -- Role gate, then the global feature-control kill switch. Per-role blocking
    -- stays a UI concern: the API must not lock a user out because of the role
    -- they happen to be *acting as* in the browser.
    SELECT public.caller_is_verified()
       AND coalesce(
             (SELECT c.enabled FROM public.feature_controls c
               WHERE c.feature_key = '/ask'),
             true);
$$;

REVOKE ALL ON FUNCTION public.caller_is_verified() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_use_ask_surya()  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_is_verified() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_ask_surya()  TO authenticated, service_role;

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.can_use_ask_surya()', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon can call can_use_ask_surya';
    END IF;
END $$;
```

**Fix — Python (`rag/api.py`):**

```python
def can_use_ask(client) -> bool:
    """Ask SURYA's own gate. Deny on any error — this is the authorization path,
    so an RPC failure must not fall open."""
    try:
        return bool(client.rpc("can_use_ask_surya", {}).execute().data)
    except Exception:
        return False


def _authed_client(body_question: str, authorization):
    question = _bounded_question(body_question)
    try:
        jwt = parse_bearer(authorization)
    except ValueError:
        raise HTTPException(status_code=401, detail="missing bearer token")
    try:
        verify_token(jwt, _ANON_URL, _ANON_KEY)
    except PermissionError:
        raise HTTPException(status_code=401, detail="invalid token")
    client = scoped_client(_ANON_URL, _ANON_KEY, jwt)
    if not can_use_ask(client):
        raise HTTPException(status_code=403, detail="forbidden")
    return question, client
```

Apply the same `can_use_ask(client)` check in `similar()` and `map_columns()` (both already build the scoped
client), and in the `/query/stream` path.

**Fix — input bounds (SEC-09).** `QueryIn.history` is an unbounded list whose every turn is fed to the
model, and `question` has no ceiling, so one token can buy arbitrary context:

```python
MAX_QUESTION_CHARS = 2000
MAX_HISTORY_TURNS = 6

class HistoryTurn(BaseModel):
    question: str = Field(max_length=MAX_QUESTION_CHARS)
    answer: str = Field(max_length=8000)

class QueryIn(BaseModel):
    question: str = Field(min_length=1, max_length=MAX_QUESTION_CHARS)
    history: list[HistoryTurn] | None = Field(default=None, max_length=MAX_HISTORY_TURNS)

class SimilarIn(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_QUESTION_CHARS)
```

Keep `_authed_client`'s empty-question 400 branch (it is friendlier than a pydantic 422) — both are fine.

**Also add per-caller throttling in nginx** (see WO-S7, which owns the limiter) or, if you prefer it in the
app, a `query_log` count per user per hour with a 429.

**Verify:**
- [ ] `curl -X POST $RAG/query -H "Authorization: Bearer $GUEST_JWT" -d '{"question":"x"}'` → **403**.
- [ ] The same call with a Scientist JWT → 200.
- [ ] A `feature_controls` row for `/ask` with `enabled = false` → 403 for everyone except nobody
      (per-role still a UI concern).
- [ ] `{"question":"x","history":[…7 turns…]}` → 422.
- [ ] `pytest` in `rag/` green (add a case for the 403 and one for the history cap).

---

### WO-S3 — Stop `institute`-tier docs leaking, and namespace the upload bucket (SEC-04, SEC-11) · P1 · S

**SEC-04.** `documents_can_read` grants `access_tier = 'institute'` to anyone with `auth.uid() IS NOT NULL`
(`20260712000008:69`), which includes `Guest` and `DefaultUser` — the two roles `access.ts:20-24` defines as
"unverified, kept out of anything that reads institute knowledge".

**Fix (in the same migration as WO-S2, or its own):** swap that branch to the helper you just added:

```sql
CREATE OR REPLACE FUNCTION public.documents_can_read(d public.documents)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    d.owner_id = auth.uid()
    OR public.proposals_caller_has_role('HRAdmin')
    OR public.proposals_caller_has_role('SystemAdmin')
    OR public.proposals_caller_has_role('MasterAdmin')
    OR public.proposals_caller_has_role('Director')
    OR (d.access_tier = 'institute' AND public.caller_is_verified())   -- was: auth.uid() IS NOT NULL
    OR (d.access_tier = 'division'
        AND d.division_code IS NOT NULL
        AND d.division_code = public.proposals_caller_division());
$$;
```

**Check before landing:** does `ingest/sink.py` or the RAG worker rely on a `Guest` reading institute-tier
docs? It assigns `division` or `confidential` (`sink.py:47`), so no. The blast radius is documents an admin
explicitly promoted to `institute` via `documents_set_access_tier`.

**SEC-11.** `documents_storage_insert` is `WITH CHECK (bucket_id = 'documents' AND auth.uid() IS NOT NULL)`
— any authenticated user can write **any path** in the shared bucket, and the registry row that makes an
object readable is bound to `owner_id` but not to a path namespace. What is *not* possible (verified, so
don't over-build): `documents(storage_bucket, storage_path)` is `UNIQUE` (`20260712000008:49`), so you cannot
alias an object that already has a registry row. What *is* possible:

- writing an object under another entity's prefix (`proposal/<someone-elses-id>/…`), which confuses the
  RAG ingest queue and any human reading the bucket;
- claiming an **orphaned** object — `uploadDocument` deletes the file when the registry insert fails, but it
  ignores the result of that delete (`registry.ts:102`), so a failed cleanup leaves a claimable object.

**Fix:** give every object an owner-scoped prefix and constrain both sides.

```sql
DROP POLICY IF EXISTS documents_storage_insert ON storage.objects;
CREATE POLICY documents_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.uid() IS NOT NULL
    AND name LIKE auth.uid()::text || '/%'      -- objects live under the uploader's own uid
  );

DROP POLICY IF EXISTS documents_insert ON public.documents;
CREATE POLICY documents_insert ON public.documents
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    AND storage_bucket = 'documents'
    AND storage_path LIKE auth.uid()::text || '/%'
    AND (public.caller_is_admin() OR public.caller_has_role('Director')
         OR access_tier IN ('owner', 'confidential'))
  );
```

Then change the path builder in `src/lib/documents/registry.ts:82`:

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { ok: false, error: 'Not signed in' };
const path = `${user.id}/${input.entityType}/${input.entityId}/${Date.now()}_${sanitize(file.name)}`;
```

…and stop swallowing the cleanup failure (`registry.ts:101-104`): log the remove error and return it in the
message so a stale object is never silent. **This breaks existing objects**, so ship it with a one-off
migration that rewrites `storage_path`/object names for rows already in the table, or accept a read-only
legacy window and document it.

**Verify:**
- [ ] A `DefaultUser` token can no longer `select` an institute-tier document (403/no rows).
- [ ] A Scientist still reads institute and same-division documents.
- [ ] Upload with a path outside `auth.uid()/…` → 403 from Storage.
- [ ] Existing documents still open (signed URL) after the rewrite.

---

### WO-S4 — Replace `xlsx` (SEC-03) · P1 · XS

**Problem.** `xlsx@0.18.5` carries GHSA-4r6h-8v6p-xvw6 (prototype pollution) and GHSA-5pgg-2g8v-p4x9
(ReDoS). `npm audit` reports `fixAvailable: false` because SheetJS stopped publishing to npm — the fixed
build is on their own CDN. This is not a dormant advisory: `dataMigration.ts` feeds it user-uploaded
workbooks, and the import flow exists precisely to accept them.

**Fix (preferred, keeps the API identical):**

```bash
npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
npm ls xlsx          # expect 0.20.3
npm audit | grep xlsx  # expect nothing
```

Run a real institute workbook through `parseFile` afterwards; the 0.18 → 0.20 API surface used here
(`XLSX.read`, `sheet_to_json`, `aoa_to_sheet`, `write`) is unchanged.

**Alternative** if you do not want a CDN artifact in `package.json`: `exceljs` for reading + writing, with
`dataMigration.ts` split into `readWorkbook` / `writeTemplate`. Bigger change, tests already cover
`parseFile` (`src/utils/dataMigration.test.ts`).

**Also add a bomb guard** while you are in there — one line in `parseFile`:

```ts
if (file.size > 25 * 1024 * 1024) return { success: false, error: 'File too large (max 25 MB).' };
```
plus a post-parse row cap (`rows.length > 50_000` → reject) so a decompression bomb cannot hang the tab.

**Verify:** [ ] `npm audit` shows no `xlsx` entry; [ ] existing import tests green; [ ] a 40 MB workbook is
rejected before `XLSX.read` runs.

---

### WO-S5 — Make the audit trail append-only (SEC-05) · P1 · S

**Problem.** `audit_log` is `FOR ALL` — including `DELETE` — to Director/SystemAdmin/MasterAdmin
(`20260712000005:299-302`), and `tickets` is the same (`20260725000004:112-122`). The roles whose actions
are being recorded can erase the record of them, and a Director can delete a grievance ticket outright.
No client code needs those writes: rows come from triggers and `SECURITY DEFINER` RPCs, and `pms_audit_logs`
correctly has no write policy at all (`20260712000002:152`).

**Fix — new migration `20261102000009_append_only_audit.sql`:**

```sql
-- ============================================================
-- 20261102000009_append_only_audit
-- audit_log / tickets lost DELETE and UPDATE to every client role. Writes go
-- through triggers and SECURITY DEFINER RPCs, which run as the owner and are
-- unaffected by the current_user guard below.
-- ============================================================
BEGIN;

DROP POLICY IF EXISTS "audit_log_write" ON public.audit_log;
CREATE POLICY "audit_log_write_admins" ON public.audit_log
    FOR INSERT TO authenticated
    WITH CHECK (public.caller_is_admin() OR public.caller_has_role('Director'));

REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_log FROM authenticated;
GRANT  INSERT ON public.audit_log TO authenticated;

-- tickets: client writes are only ever through the helpdesk RPCs.
DROP POLICY IF EXISTS "tickets_write" ON public.tickets;
CREATE POLICY "tickets_write_admins" ON public.tickets
    FOR UPDATE TO authenticated
    USING      (public.caller_is_admin() OR public.caller_has_role('Director'))
    WITH CHECK (public.caller_is_admin() OR public.caller_has_role('Director'));
REVOKE DELETE, TRUNCATE ON public.tickets FROM authenticated;

-- Belt and braces: even a future overly-broad grant cannot rewrite or erase
-- history from a client session.
CREATE OR REPLACE FUNCTION public.audit_grade_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') THEN
        RAISE EXCEPTION '% is append-only: use the workflow RPCs', TG_TABLE_NAME;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_append_only ON public.audit_log;
CREATE TRIGGER trg_audit_log_append_only
    BEFORE UPDATE OR DELETE ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.audit_grade_append_only();

COMMIT;
```

Same discriminator as WO-1: direct PostgREST writes run as `authenticated`, definer RPCs run as the owner.
**Prove it** — a helpdesk status change must still write a `StatusChanged` row after this lands.

**Verify:**
- [ ] `UPDATE audit_log SET action='x'` as Director → error; `DELETE FROM audit_log` → error.
- [ ] `DELETE FROM tickets` as Director → error.
- [ ] Ticket create → respond → resolve writes all its `ticket_events` / `audit_log` rows.
- [ ] `pms_audit_logs` unchanged (it never had a client write path).

---

### WO-S6 — One error translator, then swap 30 call sites (SEC-06) · P2 · S

**Problem.** Raw Postgres text reaches users. The three leaks that matter:

| Postgres text | What leaks |
|---|---|
| `duplicate key value … Key (ID)=(123) already exists.` | **another record's key value** + column names |
| `… violates foreign key constraint … is not present in table "projects"` | existence oracle on a hidden parent row |
| `new row violates row-level security policy for table "pms_reports"` | table names + the fact that RLS exists |

A division-scoped HOD can use insert-conflict errors as an existence oracle over other divisions' records.
`Login.tsx:143-153` also returns GoTrue's raw `error.message` to an unauthenticated caller.

**Fix — new `src/lib/errors.ts`:**

```ts
/** User-facing text for a PostgREST/Postgres failure. Detail goes to the logger,
 *  never to the UI: raw messages leak table names, constraint names and other
 *  rows' key values (see docs/roadmap/sources/SECURITY-REVIEW-2026-11-01.md). */
export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const code = (error as { code?: string } | null)?.code;
  switch (code) {
    case '23505': return 'That record already exists.';
    case '23503': return 'A related record is missing or already removed.';
    case '23502': return 'A required field is missing.';
    case '42501': case 'PGRST301': case 'PGRST116':
      return "You don't have permission to do that.";
    case 'PGRST204': return 'That change is not allowed.';
    case '22P02': return 'One of the values is not in the expected format.';
    default: return fallback;
  }
}
```

Then replace the pattern at each site. They are all one of three shapes:

```ts
setError(err instanceof Error ? err.message : 'Save failed');
// →
setError(friendlyError(err, 'Save failed')); logger.error('[module] save failed', err);
```

Sites, in file order (30 call sites, 18 files): `ManageUsersTab.tsx:50,51,120`,
`UserFeatureGrants.tsx:29,55,68`, `committees/ActionItemModal.tsx:81`, `committees/CommitteeFormModal.tsx:154,173`,
`committees/DocumentUploader.tsx:57`, `committees/MeetingFormModal.tsx:140`, `pms/AnnexureUpload.tsx:36`,
`pms/ReportWizard.tsx:103,137`, `pms/SignatureUpload.tsx:28`, `proposals/StatusUpdateModal.tsx:96`,
`DivisionFormModal.tsx:100,118`, `EntityEditModal.tsx:96,105`, `EntityRecordsPanel.tsx:120,169`,
`HarvestedImportsPanel.tsx:41,55,64,75`, `ImportFlow.tsx:212,257`, `InstrumentForm.tsx:84`, and
`DataContext.tsx:309-311` (the partial-load toast lists table names to the user — say "N tables failed to
load" and log the list).

`Login.tsx`: keep the specific message for `Invalid login credentials` (it is genuinely useful), map
everything else to "Sign-in failed. Please try again or contact your administrator.", and detect the
schema-error case on `error.status === 500` rather than on the message text.

**Verify:** [ ] an insert conflict shows "That record already exists." with the raw text only in the
console; [ ] a wrong password still says "Invalid login credentials"; [ ] grep shows no `error.message`
left in a `setError`/`push`/`alert` call.

---

### WO-S7 — nginx: security headers, rate limit, self-hosted fonts (SEC-08, SEC-09, SEC-17) · P2 · S

**Problem.** `deploy/nginx.conf` is 30 lines with no headers. Clickjacking the login form is the concrete
risk (a framed credentialed form), and with no CSP the JWT in `localStorage` is one XSS from exfiltration.
There is also no throttle on `/rag/`, so one authenticated caller can spend unbounded model time.

**Fix.** The rate-limit zone must live in the `http` block, **not** in this server block — if you paste
`limit_req_zone` into `deploy/nginx.conf` as it stands, nginx will refuse to start with
`"limit_req_zone" directive is not allowed here`.

```nginx
# in the http { } block of nginx.conf (above your server includes) — NOT in deploy/nginx.conf
limit_req_zone $binary_remote_addr zone=rag_query:10m rate=6r/m;
```

```nginx
# deploy/nginx.conf — inside server { }
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options           "DENY" always;
add_header X-Content-Type-Options    "nosniff" always;
add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
add_header Permissions-Policy        "geolocation=(), microphone=(), camera=()" always;
add_header Content-Security-Policy   "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'" always;

location /rag/ {
    limit_req  zone=rag_query burst=3 nodelay;
    limit_req_status 429;
    proxy_pass http://127.0.0.1:8000/;
    proxy_read_timeout 300s;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
}
```

`style-src 'unsafe-inline'` is required by framer-motion and Tailwind's runtime style injection — everything
else can be strict. Note the SPA talks to Supabase directly, so `connect-src` must allow your project
origin; list it explicitly instead of `*.supabase.co` if you can (narrower, and it survives a project move).

**SEC-17 (fonts).** Self-host the four families so `font-src 'self'` holds and the app stops calling
`fonts.googleapis.com` from every client (IP/referrer leak, and broken on the air-gapped institute LAN where
it silently falls back to Georgia/system-ui today): download the woff2 files into `public/fonts/`, add
`@font-face` blocks in `src/index.css`, delete the three `<link>` tags in `index.html:26-31`. While you are
there, fix `<title>suryafd</title>` → `SURYA — CSIR-AMPRI`.

**Verify:**
- [ ] `curl -sI https://<host>/ | grep -E 'content-security-policy|strict-transport|x-frame'` → all present.
- [ ] Same for a `/rag/` response.
- [ ] The SPA loads with **no** console CSP violations on Dashboard, Ask SURYA, a DataTable page and a PDF
      preview (`blob:` is in `img-src` for this).
- [ ] `for i in $(seq 1 10); do curl -o /dev/null -s -w '%{http_code}\n' -X POST https://<host>/rag/query …; done` → some 429s.
- [ ] DevTools Network shows zero requests to `fonts.googleapis.com`.

---

### WO-S8 — Shrink the blast radius of the JWT secret (SEC-10) · P2 · M

**Problem.** `mint_user_token()` (`rag/auth.py:30-43`) signs a 5-minute HS256 token for any `sub` with
`SUPABASE_JWT_SECRET`. Answering a brief as its owner is the right design, but anyone who reads
`rag-worker.env` can mint a MasterAdmin token. `deploy/README.md:118` documents the file; its ACL is the
only control.

**Fix, cheapest first (all four are worth doing):**

1. **ACL the file** to SYSTEM + the service account only, and exclude it from images/backups:
   ```powershell
   icacls C:\surya\rag-worker.env /inheritance:r /grant:r "SYSTEM:(R)" "surya-rag-worker$:(R)"
   ```
2. **Log every mint** — one audit row per brief answer (owner, schedule id, `jti`), so an unexpected mint is
   visible: `db.post_audit("BRIEF_TOKEN_MINTED", owner, {"schedule_id": q["id"], "jti": jti})`.
3. **Make tokens revocable** — add `jti` and `session_id` claims:
   ```python
   payload = {"sub": user_id, "role": "authenticated", "aud": "authenticated",
              "iat": iat, "exp": iat + ttl_s, "jti": uuid.uuid4().hex}
   ```
   GoTrue rejects a token whose `session_id` was revoked, so including one from a real session is better than
   a bare `sub` — but a fresh `jti` at least gives you something to search for and correlate.
4. **Move the project to asymmetric JWT signing keys** (GoTrue supports ECC/RSA; the private key never leaves
   the auth server, consumers verify with JWKS). Then the worker holds a private key you can rotate, and a
   leaked file no longer implies "mint anything".

Until (4) lands, treat `SUPABASE_JWT_SECRET` as the single most sensitive value in the deployment and say so
in `deploy/README.md` — it currently reads as routine config.

**Verify:** [ ] `icacls` shows no inherited ACEs; [ ] a brief run writes exactly one audit row with a `jti`;
[ ] after key rotation, old worker tokens are rejected.

---

### WO-S9 — Stop swallowing failures (SEC-12, SEC-13) · P2 · M

**SEC-12.** Fifteen `.then()` chains with no `.catch()` leave a permanent spinner on rejection:
`SystemAdminView.tsx:88` (`admin_list_users`), `:98`, `:159`; `pms/ReportNew.tsx:38`; `pms/ReportView.tsx:40`;
`pms/ReportEdit.tsx:22`; `reports/ProjectReportForm.tsx:32`; `CommandPalette.tsx:139`;
`pms/AWPRegister.tsx:148`; `ReportAWPSection.tsx:26`; `useDirectorThresholds.ts:58`; plus `AuthContext.tsx:94`
and `bearerToken.ts:38`, which need their own path.

Pattern to apply:

```ts
loadThing()
  .then(r => { if (!cancelled) setX(r); })
  .catch(e => { logger.error('[module] load failed', e); if (!cancelled) setError(friendlyError(e)); })
  .finally(() => { if (!cancelled) setLoading(false); });
```

Also: the app has **one** `ErrorBoundary`, at the root (`main.tsx`). Any page-level throw blanks the entire
shell and loses in-progress form state. Add a boundary inside `Layout`'s `<main>` keyed on the route so a
single page crash shows a recoverable card and leaves the chrome alive:

```tsx
<ErrorBoundary key={pathname} fallback={<PageErrorCard onRetry={() => setRetryKey(k => k + 1)} />}>
  <Outlet />
</ErrorBoundary>
```

**SEC-13.** `FeatureControlContext` sets `controls = []` on any read failure, and `featureEnabled` treats
"no row" as enabled — so a failed read silently turns every kill switch off. That trade-off (never brick the
app) is defensible, but it must be *visible*: keep the fail-open behaviour, add `controlsDegraded: boolean`
to the context and render a persistent banner in `Layout` ("Feature controls unavailable — all features are
enabled"). An operator who flips a switch off during an incident needs to know the switch did not take.

**Verify:** [ ] kill the network mid-load on `/system-admin` → an error card, not a spinner; [ ] throw
deliberately in one page → chrome survives, other routes work; [ ] break the `feature_controls` read → banner
appears and the console logs it.

---

### WO-S10 — Remove the dev backdoor, harden the token fallback (SEC-07, SEC-16) · P2 · XS

**SEC-07.** `AuthContext.tsx:126-137` grants `SystemAdmin` + `MasterAdmin` to `admin@dev.local` /
`admin123` when `import.meta.env.DEV`. A `vite build --mode development` ships it live, and it never touches
Supabase — so it also bypasses every RLS policy in the system at once.

```ts
// Only with an explicit opt-in that no deploy profile sets. VITE_DEV_LOGIN=1 in .env.local.
if (import.meta.env.VITE_DEV_LOGIN === '1' && !import.meta.env.PROD
    && email === 'admin@dev.local' && password === 'admin123') { … }
```
Add `VITE_DEV_LOGIN` to `.env.example` (empty) and to `docs/engineering/development_guide.md`, and add a
CI grep that fails if `VITE_DEV_LOGIN` appears in a deploy profile. Even better: delete the backdoor and
run a local Supabase (`supabase start`) — it exists specifically so this is unnecessary.

**SEC-16.** `supabaseClient.ts:13-21` replaces gotrue's cross-tab lock with a pass-through, and
`bearerToken.ts:41-45` falls back to reading the token straight out of `localStorage`. Two consequences:
concurrent refreshes across tabs can race (the original reason the lock was removed was a deadlock — keep
that reasoning), and a session revoked server-side stays usable until the 1 h JWT TTL expires, because
nothing revalidates. Fix the second one without reintroducing the deadlock: only take the storage fallback
when `getSession()` actually **timed out** (not when it returned null) *and* the app has not seen a
`SIGNED_OUT` event since mount. Track that with a module-level flag set in `onAuthStateChange`.

**Verify:** [ ] a production build contains no `admin@dev.local` (grep `dist/assets/*.js`); [ ] `VITE_DEV_LOGIN=1 npm run dev` still logs in; [ ] sign out in tab A → tab B stops issuing requests with the old token within one navigation.

---

### WO-S11 — Dependency and CI hygiene (SEC-14, SEC-15, SEC-18) · P3 · S

**SEC-14/15 — audit reality.** 26 high + 30 moderate, **all in the dev toolchain**; none ship in the bundle.
The app-runtime ones are `xlsx` (WO-S4), `zod` (memory exhaustion while validating oversized constrained
collections — the upload schemas use `passthrough()` and no `.max()`, so exposure is low, but the upgrade is
free: `npm i zod@latest`), and `@supabase/supabase-js → ws` (**unreachable**: `grep -r '\.channel(\|\.subscribe('
src/` returns **0** — there is no realtime usage). Two Windows dev-server advisories do matter to this team:
`vite`'s `server.fs.deny` bypass and `launch-editor` NTLM hash disclosure. Rule: never run `npm run dev
-- --host 0.0.0.0`; it already binds localhost only.

Clear the transitive noise with `overrides` so the audit output becomes readable again:

```json
"overrides": {
  "brace-expansion": "^2.0.2",
  "nanoid": "^3.3.8",
  "postcss": "^8.5.6",
  "undici": "^7.16.0",
  "ws": "^8.18.3"
}
```
Then `npm i && npm test && npm run build`, and `npm audit fix` for anything still flagged `fixAvailable: true`.

**CI (`.github/workflows/ci.yml`, `spa` job)** — add three gates that catch regressions:

```yaml
      - run: npm audit --audit-level=high --omit=dev   # runtime deps only; dev tree stays advisory
      - run: node scripts/update-design-debt.mjs
      - uses: gitleaks/gitleaks-action@v2              # secret scanning on every push
```
(`npm audit --omit=dev` is the line that matters: today a single high in the test runner is indistinguishable
from a vulnerable runtime dependency.)

**SEC-18.** `supabase/mock/17_test_auth_users.sql` creates `master@test.local` with `crypt('Test@1234', …)`
and `must_change_password = false`. It is not seeded (`config.toml:45` seeds `./seed/*.sql` only), so it is a
manual footgun. Add a guard at the top of every `supabase/mock/*.sql`:

```sql
DO $$
BEGIN
    IF current_database() NOT IN ('postgres', 'supabase_local_db') OR
       (SELECT inet_server_addr()) IS NOT NULL THEN
        RAISE EXCEPTION 'supabase/mock is dev-only — refusing to run against %', current_database();
    END IF;
END $$;
```
…or move the whole directory behind `supabase/mock/README.md` instructions that require an explicit
`psql -f` and rename the files `*.dev-only.sql`.

**Verify:** [ ] `npm audit --omit=dev` exits 0; [ ] CI fails on a deliberately committed fake key;
[ ] running a mock file against a non-local database raises.

---

## 4. Suggested PR sequence

| PR | Work orders | Risk | Notes |
|---|---|---|---|
| 1 | **WO-S1** (pointer to WO-1/WO-2) | Medium | The only P0. Land with the T21–T24 RLS tests and the full appraisal E2E. |
| 2 | WO-S2 + WO-S3 | Medium | One migration, one Python file. Changes who can call the API and read `institute` docs — tell the institute before deploying. |
| 3 | WO-S4 | Low | One dependency swap, reversible in a minute. |
| 4 | WO-S5 + WO-S6 | Low | Both are "the database/UI stops leaking"; no product decisions. |
| 5 | WO-S7 | Low | nginx only. Test CSP against every page before it goes to the server. |
| 6 | WO-S8 + WO-S9 + WO-S10 | Low–Medium | Resilience and auth hardening. |
| 7 | WO-S11 | Low | Config + CI. |

---

## 5. Needs a decision before you build

1. **WO-S3 path namespacing breaks existing objects.** Rewrite paths (one-off migration + Storage copy) or
   keep a legacy prefix readable for a transition window? The rewrite is cleaner; the window is cheaper.
2. **WO-S2's per-role feature control.** The API honours `feature_controls.enabled` globally; per-role blocks
   stay a UI concern. Is that acceptable, or must a role-blocked user also be blocked at the API? (If yes,
   that is a second branch and a slightly different rulebook in two places — which is what `can_use_ask_surya`
   exists to prevent.)
3. **WO-S7 CSP and Supabase.** Restrict `connect-src` to your exact project origin (and `wss://` if realtime
   is ever used) or leave `*.supabase.co`? Narrower is better and cheap to change.
4. **WO-S8.** Is the team ready to move to asymmetric JWT signing keys? It is a Supabase-side setting plus a
   JWKS fetch, but it invalidates every existing session once.

---

## 6. Tracker

```
[x] WO-S1   PMS client-write guard (SEC-01)            P0   #16 (live)
[x] WO-S2   Authorise the RAG API (SEC-02, SEC-09)     P1   #23 SQL + #24 API (merged)
[x] WO-S3   institute tier + bucket namespace          P1   SEC-04, SEC-11   #23 (merged)
[~] WO-S4   Replace xlsx (SEC-03)                      P1   #25
[x] WO-S5   Append-only audit trail (SEC-05)           P1   #23 (merged)
[~] WO-S6   Error translator (SEC-06)                  P2   #26
[~] WO-S7   nginx headers + rate limit + fonts         P2   SEC-08, SEC-09, SEC-17   #27
[~] WO-S8   JWT secret blast radius (SEC-10)           P2   #28
[~] WO-S9   Stop swallowing failures (SEC-12, 13)      P2   #28
[~] WO-S10  Dev backdoor + token fallback (SEC-07,16)  P2   #28
[~] WO-S11  Deps + CI gates (SEC-14, 15, 18)           P3   #28
```

`[x]` merged, `[~]` PR open. Plan: `docs/superpowers/plans/2026-11-01-security-phase2.md`.
Migrations `20261102000008`/`0009` (#23) are live (checked 2026-11-01).

---

*Findings are from a source review, not a penetration test. Engage a professional firm before the
institute-wide rollout, and re-run `npm audit --omit=dev`, `python scripts/check_security_definer.py` and the
RLS suites afterwards.*
