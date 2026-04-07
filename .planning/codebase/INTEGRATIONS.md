# External Integrations

_Last updated: 2026-04-07_

## Summary

SURYA has one external service integration: Supabase, used as the cloud database backend. The app is designed to run fully offline on static mock data when Supabase is not configured. All other integrations are browser-native (localStorage, FileReader API). There are no third-party analytics, monitoring, or CDN integrations present.

---

## APIs & External Services

**Supabase (PostgreSQL-as-a-service):**
- Purpose: Primary data store for all institute entities (staff, projects, PhD students, equipment, divisions, project staff)
- SDK: `@supabase/supabase-js` ^2.99.2
- Client initialization: `SuryaFD/src/utils/supabaseClient.ts`
- Auth method: anon key (public row-level access; RLS not currently enabled per `SuryaFD/supabase_schema.sql`)
- Operations used: `.from(table).select('*')` for reads; `.from(table).upsert(chunk)` for batch writes
- Batch size: 50 rows per upsert call (in `SuryaFD/src/utils/dataMigration.ts`)

---

## Data Storage

**Cloud Database:**
- Provider: Supabase (hosted PostgreSQL)
- Tables: `divisions`, `staff`, `projects`, `phd_students`, `equipment`, `project_staff`
- Schema definition: `SuryaFD/supabase_schema.sql`
- All columns are `text` or `integer` — no foreign key constraints enforced at DB level
- `scientific_outputs` and `ip_intelligence` entities are not yet in Supabase; served from mock data only

**Browser Storage (localStorage keys):**

| Key | Purpose |
|-----|---------|
| `surya_session` | Serialized `UserAccount` object — persists login session |
| `surya_supabase_url` | Supabase project URL (set by Setup Wizard if not using `.env`) |
| `surya_supabase_anon_key` | Supabase anon key (set by Setup Wizard if not using `.env`) |
| `surya_theme` | User theme preference (`light` / `dark` / `system`) |
| `surya_density` | UI density preference (`compact` / `medium` / `relaxed`) |

**Mock Data Fallback:**
- File: `SuryaFD/src/utils/mockData.ts`
- Used automatically when `isProvisioned()` returns `false` (no Supabase credentials)
- Covers all entity types including `scientificOutputs` and `ipIntelligence`

**File Storage:**
- Local filesystem only (no cloud file storage)
- Data import: user uploads `.xlsx`, `.xls`, or `.csv` files via browser file picker in the Data Management page; files are parsed in-browser and upserted to Supabase

---

## Authentication & Identity

**Auth Provider:**
- Custom (no external auth provider)
- Implementation: `SuryaFD/src/contexts/AuthContext.tsx`
- Session: stored in `localStorage` as `surya_session` (JSON-serialized `UserAccount`)
- Current credentials: single hardcoded account — username `MasterAdmin`, password `Admin`
- Roles: `MasterAdmin > Admin > User` (hierarchical permission check in `hasPermission()`)
- Supabase Auth integration is explicitly marked TODO in `SuryaFD/src/contexts/AuthContext.tsx`

**Route Protection:**
- `ProtectedRoute` component in `SuryaFD/src/App.tsx`
- Redirects to `/setup` if not provisioned, `/login` if not authenticated
- Role-gated routes: `/recruitment` (Admin+), `/data` (MasterAdmin only)

---

## Supabase Provisioning Flow

Two paths to configure the Supabase connection:

1. **Environment variables** (preferred for production):
   - `VITE_SUPABASE_URL` in `SuryaFD/.env`
   - `VITE_SUPABASE_ANON_KEY` in `SuryaFD/.env`

2. **Setup Wizard** (in-app, runtime):
   - User enters URL and anon key in the Setup Wizard UI (`SuryaFD/src/pages/SetupWizard.tsx`)
   - Credentials saved to `localStorage` via `provisionDatabase()` in `SuryaFD/src/utils/supabaseClient.ts`
   - Page reloads to re-initialize the Supabase client

Provisioning check: `isProvisioned()` in `SuryaFD/src/utils/supabaseClient.ts` returns `true` if a Supabase client was successfully initialized (from either source).

---

## Data Import Pipeline

**Trigger:** Admin uploads file on the Data Management page (route `/data`, MasterAdmin only)

**Flow:**
1. Browser FileReader API reads the uploaded file
2. `SuryaFD/src/utils/dataMigration.ts` — `parseFile()` dispatches to papaparse (CSV) or xlsx (Excel)
3. Raw rows are normalized: column names renamed via `SCHEMA_MAPS`, filtered to `ALLOWED_COLUMNS`
4. Excel serial dates converted to `DD/MM/YYYY` strings
5. `pushToSupabase()` upserts records to the appropriate Supabase table in chunks of 50

**Supported source files (from `Data/`):**
- `TEMPLATE_DIVISIONS.csv` → `divisions` table
- `AMPRI Master staff data.xls` → `staff` table
- `Scientist data.xlsx` → `staff` table
- `Projects_AMPRI.xlsx` → `projects` table
- `Project staff.xlsx` → `project_staff` table
- `AcSIR Students Data_Updated-_Dec_2025.xlsx` → `phd_students` table
- `Equipment details.xlsx` → `equipment` table

---

## Monitoring & Observability

**Error Tracking:** None — no Sentry, Datadog, or similar service integrated

**Logging:** `console.error()` only (e.g., in `SuryaFD/src/contexts/DataContext.tsx` line 89)

**Analytics:** None detected

---

## CI/CD & Deployment

**Hosting:** Not configured — app produces static files in `SuryaFD/dist/` suitable for any static host (Netlify, Vercel, GitHub Pages, etc.)

**CI Pipeline:** None detected — no `.github/workflows/`, no CI config files present

---

## Webhooks & Callbacks

**Incoming:** None

**Outgoing:** None — all Supabase interactions are client-initiated fetch requests

---

## Environment Variables Reference

| Variable | Required | Source | Purpose |
|----------|----------|--------|---------|
| `VITE_SUPABASE_URL` | No (fallback: localStorage) | `SuryaFD/.env` | Supabase project API URL |
| `VITE_SUPABASE_ANON_KEY` | No (fallback: localStorage) | `SuryaFD/.env` | Supabase public anon key |

Without either variable set and without localStorage credentials, the app runs entirely on mock data — no network calls are made.

---

*Integration audit: 2026-04-07*
