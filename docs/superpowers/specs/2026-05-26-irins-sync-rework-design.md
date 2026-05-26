# IRINS Data Sync — Rework Design

**Date:** 2026-05-26
**Status:** Approved (design), pending implementation plan
**Scope:** Replace the broken IRINS sync feature with a production-ready, on-demand, sysadmin-gated sync built on a Supabase Edge Function.

---

## 1. Problem — why the current feature fails

IRINS = the institute's public research profile portal (`ampri.irins.org`). Each scientist
has a profile at `/profile/<VidwanID>` listing publications, patents, awards, projects,
qualifications, citations, etc. SURYA wants to mirror that data into its own database and
let a SystemAdmin / MasterAdmin refresh it on demand.

The existing implementation has **two disconnected paths, neither of which works for
on-demand sync from the app:**

### Path A — GitHub Action (`scripts/irins-sync.ts` + `.github/workflows/irins-sync.yml`)
- A real Playwright scraper, run on a weekly cron + manual `workflow_dispatch`.
- **Not callable from the app.** A SystemAdmin inside SURYA has no way to trigger it; it
  needs GitHub access.
- **Wrong selectors.** It looks for panel IDs `pb_information_panel`,
  `pt_information_panel`, `rp_information_panel`, `experience_information_panel`. These do
  not exist in the live IRINS DOM (verified 2026-05-26). Real containers are `list-pb` /
  `pb-view` / `pub-view`, `list-awards`, `list-rp`, `list-pt`, `list_panel_experience`,
  etc. Result: even when the Action runs, profiles come back near-empty.
- Clicks tabs inside `page.evaluate()` then reads synchronously — would not await async
  content anyway.

### Path B — in-app "Sync All" button (`IrinsSync.tsx` `triggerSync`)
- Does **not scrape anything**. The browser cannot run Playwright and cross-origin fetch to
  IRINS is blocked by CORS.
- Writes placeholder rows: `profile_data: { status: 'pending_full_sync' }`.
- **Destructive:** these placeholder writes overwrite any real data Path A fetched, with no
  merge guard.

### Root cause
A static-hosted browser SPA physically cannot scrape IRINS (no headless browser; CORS
blocks cross-origin fetch). Sync was therefore punted to GitHub, but GitHub cannot be
triggered from the app and the scraper was broken. Dead end.

---

## 2. Key finding — no browser is needed

Live investigation of IRINS on 2026-05-26 (profiles `625235` and `625115`) showed all
required data is reachable with **plain server-side HTTP requests, no headless browser, no
auth, no cookies.** Three endpoints:

| Data | Method | Endpoint | Returns |
|---|---|---|---|
| Identity, academic IDs, expertise, experience, qualifications, awards, theses, professional bodies, research projects, patents | `GET` | `/profile/<expert_id>` | Full HTML page (server-rendered static sections) |
| Publications | `POST` | `/profile/get_publication` | HTML fragment, **paginated** |
| Citations / H-index / i10-index | `POST` | `/profile/getgooglecitation` | JSON |

Verified facts:
- `GET /profile/625235` returned a 179 KB document containing 8 publications, 11 awards,
  research projects, patents, H-index, and all academic IDs — entirely in the initial HTML.
- **Profiles render inconsistently.** On `625235` publications were inline in the page; on
  `625115` they were **not** in the page HTML and instead load via `POST
  /profile/get_publication`. Therefore publications must **always** be fetched from the
  `get_publication` endpoint for uniformity, never parsed from the main page.
- `POST /profile/get_publication` with body
  `expert_id=<id>&current_page=<n>&sort_by=year&direction=desc` returns ~10 publications per
  page as an HTML fragment. Pages are 0-indexed and increment. **Termination:** a page with
  zero `<h2>` entries means no more publications (verified: `625115` had content through
  page 20+, empty by page 100).
- `POST /profile/getgooglecitation` with body `expert_id=<id>` returns clean JSON, e.g.
  `{"status":"success","google_data":{"all":"17591","all_2013":"9645","h_all":"64","h_2013":"57","hi10_all":"130","hi10_2013":"127"}}`.
  This was previously assumed to be browser-locked; it is not.
- `POST /profile/get_sidebarData` returns "related experts" JSON — **not** citation data;
  not used.

### Selector variance (critical for the parser)
Item-level class names differ between profiles (`pb-view` vs `pub-view`, `award-view` vs
`profile-event`). **Stable anchors are the container IDs**, which were consistent:
`i_orcid_id`, `i_scopus_id`, `i_isi_id`, `i_google_sid`, `list_panel_experience`,
`list_panel_qualification`, `list-awards`, `list-theses`, `list-rp`, `list-pt`, `list_org`,
expertise (`e_expertise` / `list_expert`). The parser anchors on containers and reads
children generically.

---

## 3. Architecture

A **Supabase Edge Function (Deno)** performs all fetching and parsing server-side. This is
the only new piece of infrastructure; it is native to the existing Supabase backend (no new
external service, no always-on worker, no GitHub dependency). It requires a one-time CLI
deploy.

```
SystemAdmin / MasterAdmin clicks Sync (one scientist or "Sync All")
   → app calls supabase.functions.invoke('irins-sync', { mode, vidwanIds })
   → Edge Function (Deno, server-side):
        1. verify caller JWT role ∈ {SystemAdmin, MasterAdmin}   [403 otherwise]
        2. for each target vidwan_id (chunked, time-boxed):
             GET  /profile/<id>                → parse static sections
             POST /profile/get_publication     → loop pages 0..N (cap 100) → publications
             POST /profile/getgooglecitation   → citations / H-index / i10
             assemble profile JSON
             guard: if identity (name) missing or HTTP error → mark failed, DO NOT overwrite
             else upsert irins_profiles (profile_data + raw_html + raw_pub_html + status)
             update irins_sync_queue row
        3. write/refresh irins_sync_log; return { processed, succeeded, failed, remaining }
   → app reads sync_log + profiles; for "Sync All" loops invoke until remaining == 0
```

### Components
| File | Purpose |
|---|---|
| `supabase/functions/irins-sync/index.ts` | Orchestration: JWT auth gate, queue processing, time-boxing, logging |
| `supabase/functions/irins-sync/parser.ts` | **Pure** functions: HTML → structured profile; publication fragment → entries; citation JSON → metrics. No network. Unit-testable against saved fixtures. |
| `supabase/functions/irins-sync/fetcher.ts` | Thin HTTP layer: GET profile, POST get_publication (paginated), POST getgooglecitation. Retry + timeout. |
| `supabase/migrations/<TS>_irins_sync_rework.sql` | Schema additions (new timestamped migration; never edit init) |
| `src/pages/IrinsSync.tsx` | Rewired: calls `functions.invoke`; per-scientist status; batch progress bar |

### Removed (dead path)
- `.github/workflows/irins-sync.yml`
- `scripts/irins-sync.ts`
- `playwright` dependency (`package.json`)
- The broken `triggerSync` placeholder writer in `IrinsSync.tsx`

---

## 4. Data model

New timestamped migration, RLS enabled on every table (matches project rules).

```sql
-- irins_profiles (existing: vidwan_id PK, profile_data jsonb, synced_at) — add:
ALTER TABLE public.irins_profiles
  ADD COLUMN raw_html      text,        -- last GET /profile/<id> body (re-parse / audit)
  ADD COLUMN raw_pub_html  text,        -- concatenated publication fragments
  ADD COLUMN parse_version int  NOT NULL DEFAULT 1,  -- bump when parser.ts changes
  ADD COLUMN last_status   text NOT NULL DEFAULT 'ok'
       CHECK (last_status IN ('ok','fetch_failed','parse_empty')),
  ADD COLUMN last_error    text;

-- irins_sync_log (existing) — kept as-is for batch-run records.

-- irins_sync_queue (new) — drives chunked "Sync All", makes batch resumable.
CREATE TABLE public.irins_sync_queue (
  vidwan_id    text PRIMARY KEY,
  run_id       bigint REFERENCES public.irins_sync_log(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','processing','done','failed')),
  attempts     int  NOT NULL DEFAULT 0,
  enqueued_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
```

RLS: `irins_sync_queue` read = authenticated; write = SystemAdmin/MasterAdmin + service_role
(mirror the existing `irins_profiles` / `irins_sync_log` policies).

### Parsed `profile_data` shape (full rich profile)
```
{
  identity:      { name, designation, division, photo_url },
  academic_ids:  { orcid, scopus, researcher_id, google_scholar },
  expertise:     string[],
  citations:     { total, total_2013, h_index, h_index_2013, i10, i10_2013 },
  experience:    [{ period, role, division }],
  qualifications:[{ year, degree, institution }],
  awards:        [{ year, title, awarding_body }],
  theses:        [{ title, scholar, year, status }],
  professional_bodies: string[],
  projects:      [{ title, funding_agency, status, role, budget, duration }],
  patents:       [{ title, inventors, number, status, filing_date }],
  publications:  [{ title, authors, journal, year, doi, type }]
}
```
Every section is optional — a legitimately empty section is `[]`, not an error.

---

## 5. Sync workflow detail

### Per-scientist (interactive)
`invoke('irins-sync', { mode: 'one', vidwanIds: [id] })` → fetch 3 endpoints → parse →
upsert → return result inline (~5–15 s depending on publication count). UI updates that row.

### Sync All (chunked, resumable)
1. App opens a run: insert `irins_sync_log` row, enqueue all eligible scientists into
   `irins_sync_queue` (status `queued`).
2. App calls `invoke('irins-sync', { mode: 'batch', runId })` repeatedly.
3. Each invocation claims up to **chunk size 3–5** `queued` rows (set `processing`,
   increment `attempts`), processes them within a **~120 s wall budget**, marks each `done`
   / `failed`, and returns `{ remaining }` (count of `queued` rows left).
4. App loops invoke until `remaining == 0`, showing a progress bar (done / total).
5. Because progress lives in the queue, an Edge timeout mid-chunk loses nothing — the next
   invocation resumes. Upserts are idempotent.

### Eligibility
Only `staff` rows with `Group = 'Scientific'` and a non-empty `VidwanID` are syncable
(matches existing query).

---

## 6. Security (defense in depth)

- **Edge Function JWT gate (authoritative):** the function reads the caller's Supabase JWT
  and checks `user_roles` for `SystemAdmin` or `MasterAdmin`. Anyone else → HTTP 403. This
  is server-side and cannot be spoofed.
- **RLS:** `irins_profiles`, `irins_sync_log`, `irins_sync_queue` writable only by
  SystemAdmin/MasterAdmin or `service_role` (used by the function). Readable by
  authenticated users (profile display).
- **Secret:** `SUPABASE_SERVICE_ROLE_KEY` is set on the Edge Function only; never in the
  client bundle.
- **Client `ProtectedRoute` is UX only** (hideable in devtools); real enforcement is the two
  layers above.

---

## 7. Access scoping & bundle size

Requirement: the feature must not bloat the bundle loaded by ordinary users.

This is already satisfied today and is preserved:
- **Lazy chunk:** `App.tsx` — `const IrinsSync = lazy(() => import('./pages/IrinsSync'))`.
  Non-admins never download it.
- **Route guard:** `App.tsx` — `<ProtectedRoute allowedRoles={['SystemAdmin','MasterAdmin']}>`.
- **Nav hidden:** `Layout.tsx` `NAV_ITEMS` — `allowedRoles: ['SystemAdmin','MasterAdmin']`.

The rework makes the client footprint smaller, not larger: all fetching/parsing/`deno-dom`
runs in the Edge Function (server-side). The client page only calls `functions.invoke` and
renders status — no new client dependencies.

### Two surfaces (distinct weight & audience)
| Surface | File | Audience | Cost |
|---|---|---|---|
| Sync **management** console | `IrinsSync.tsx` | SystemAdmin / MasterAdmin only | lazy chunk, gated |
| Profile **display** | `ScientistProfile.tsx` (reads `irins_profiles`) | all authenticated users (e.g. a scientist viewing own profile) | light DB read, no scrape code |

Showing synced IRINS data to a regular user is a cheap DB read; only the admin sync console
is gated and code-split.

---

## 8. Failure modes & mitigations

| Failure | Cause | Mitigation / behavior |
|---|---|---|
| Edge Function timeout mid-batch | chunk exceeds ~120 s | Progress persisted in `irins_sync_queue`; next invocation resumes. Idempotent upsert. No data loss. |
| IRINS page restructured | portal redesign breaks selectors | Parser yields empty identity → row marked `parse_empty`; **profile_data NOT overwritten** (guard). `raw_html` saved for offline re-parse + `parse_version` bump. |
| `get_publication` shape change | endpoint/params change | Publications come back empty → keep previously stored publications (guard); other sections unaffected. |
| `getgooglecitation` absent/changed | endpoint change | `citations` set null; rest of profile unaffected. |
| Publication pagination runaway | endpoint never returns empty | Hard cap **100 pages** + empty-`<h2>` stop condition. |
| IRINS down / 5xx / network timeout | portal outage | Mark `fetch_failed`; retry up to 3 attempts; log in `irins_sync_log`. Existing data untouched. |
| Rate-limit / IP block | too many rapid requests | Sequential (not parallel) fetches, small chunk size, polite delay + User-Agent. |
| Bad / missing VidwanID, 404 | wrong id | `fetch_failed`, skipped, reported in result. Pre-filtered to non-empty VidwanID. |
| Non-admin invokes function | privilege escalation attempt | 403 from JWT role check. |
| Concurrent syncs (two admins) | double processing | Queue row `processing` claim + `attempts` guard prevents duplicate work. |
| Messy HTML (encoding/whitespace) | source formatting | Parser normalizes whitespace, trims; fixture tests lock expected output. |
| Profile template variance | inconsistent item classes | Parser anchors on stable container IDs and reads children generically; each section optional. |

---

## 9. Why the new system works (vs old)

| Old (broken) | New |
|---|---|
| Browser SPA can't scrape; CORS blocks fetch | Server-side fetch in Edge Function — no CORS |
| Needed Playwright / headless browser | Static HTML + simple POST endpoints — no browser |
| Wrong selectors → empty profiles | Verified container-anchored selectors + dedicated `get_publication` endpoint |
| Not triggerable from app | `supabase.functions.invoke` on demand by sysadmin |
| Placeholder writes overwrote real data | Never-overwrite-on-empty guard; idempotent upsert |
| Single run, no recovery | Queue-driven, resumable, time-boxed chunks |
| Access not enforced server-side | JWT role gate + RLS (defense in depth) |

---

## 10. Testing

- **Parser unit tests** (no network): saved fixtures — full profile HTML (`625235`,
  `625115`), a `get_publication` page fragment, an empty publication page, a
  `getgooglecitation` JSON — assert structured output, including the empty-section and
  missing-name cases.
- **Guard test:** parser returning empty identity must produce `parse_empty` and skip
  upsert.
- **Pagination test:** loop stops on empty `<h2>` and respects the 100-page cap.
- **Auth test:** non-admin JWT → 403.

---

## 11. Decisions (locked)

- Trigger model: **per-scientist + chunked resumable batch** (queue-driven).
- Store **raw HTML** (`raw_html`, `raw_pub_html`) for re-parse/audit.
- **Include citations** via `getgooglecitation` (browserless JSON; earlier "skip" reversed
  after evidence).
- **Remove** the GitHub Action path entirely (workflow, script, Playwright dep, placeholder
  writer).
- Data scope: **full rich profile** (all sections).
- Publication scope: **full history, hard cap 100 pages**.
- Keep lazy import + `allowedRoles` route/nav guard; server-side parsing keeps client bundle
  light.

---

## 12. Open / deferred

- Live Google Scholar "since 2013" splits are captured if present in the citation JSON; no
  separate handling.
- A scheduled refresh (e.g. nightly) could later be added by invoking the same Edge Function
  from `pg_cron` or a Supabase scheduled function — out of scope for this rework, which is
  on-demand only.
