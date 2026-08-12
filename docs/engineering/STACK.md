# Technology Stack
_Last updated: 2026-08-08_

Versions only. Architecture is in [architecture_addendum.md](architecture_addendum.md);
setup is in [development_guide.md](development_guide.md).

## Core

| Layer | Choice | Version |
|-------|--------|---------|
| UI framework | React | ^19.2.4 |
| Language | TypeScript | ~5.9.3 |
| Bundler | Vite | ^8.0.0 |
| Routing | React Router DOM (`HashRouter`) | ^7.13.1 |
| Styling | Tailwind CSS 4 (via `@tailwindcss/vite`) | ^4.2.1 |
| Database / Auth / Storage | Supabase (hosted PostgreSQL 17.6 + GoTrue + Storage + RLS) | `@supabase/supabase-js` ^2.99.2 |
| AI service | Python + FastAPI + uvicorn | Python **3.12** (pinned) |
| Model host | Ollama, OpenAI-compatible API | any OpenAI-compatible endpoint |

## Frontend libraries

| Purpose | Package | Version |
|---------|---------|---------|
| Charts | recharts | ^3.8.0 |
| Calendar heatmap | @nivo/calendar | ^0.99.0 |
| Org / hierarchy trees | react-d3-tree | ^3.6.6 |
| Relationship graph | react-force-graph-2d | ^1.29.1 |
| Animation | framer-motion | ^12.36.0 |
| Icons | lucide-react | ^0.577.0 |
| Class composition | clsx + tailwind-merge | ^2.1.1 / ^3.5.0 |
| PDF export | @react-pdf/renderer | ^4.5.1 |
| Excel parsing | xlsx | ^0.18.5 |
| CSV parsing | papaparse | ^5.5.3 |
| Schema validation | zod | ^4.3.6 |

## Python (`rag/`, `ingest/`)

| Purpose | Package | Notes |
|---------|---------|-------|
| HTTP API | fastapi + uvicorn + pydantic | `rag/` only; `api.py` is a thin shell |
| Supabase client | supabase-py | both modules |
| PDF parsing | PyMuPDF | `rag/` only. **No 3.14 wheel** — hence the 3.12 pin. Native DLL may be blocked by WDAC / Smart App Control |
| OCR | Tesseract binary (optional) or a vision model via Ollama | adapter-selected |
| LLM calls | `urllib.request` (stdlib) | no SDK, deliberately |
| Tests | pytest | offline: `FakeLLM` + `NullOCR` + `FakeDB` |

`ingest/` is pure stdlib plus `supabase-py` — no native dependencies, so it runs on any
Python 3.10+ without the WDAC concerns that affect `rag/`.

## Build / dev tooling

| Tool | Config |
|------|--------|
| Vite | `vite.config.ts` — plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`. **No `tailwind.config.js`** — Tailwind 4 config lives here plus CSS variables in `src/index.css` |
| TypeScript | `tsconfig.json` (references), `tsconfig.app.json`, `tsconfig.node.json` |
| ESLint 9 | `eslint.config.js` flat config: `typescript-eslint`, `react-hooks`, `react-refresh`, plus design-token rules with a shrinking debt list (`eslint.design-debt.json`) |
| Tests | Vitest ^4.1.5 + `@testing-library/react` ^16.3.2 + jsdom ^29.1.1 — 66 files, 652 tests |
| Scripts | tsx ^4.22.3 (`npm run sync:irins`) |
| CI | `.github/workflows/ci.yml` — four jobs: `spa`, `rag`, `ingest`, `db` (real Supabase stack + RLS suites) |
| No Prettier | Formatting is not tool-enforced |

## TypeScript strict settings (`tsconfig.app.json`)

```json
"strict": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"noFallthroughCasesInSwitch": true,
"verbatimModuleSyntax": true,
"erasableSyntaxOnly": true
```

`verbatimModuleSyntax` means all type-only imports must use `import type { … }`.

> `npx tsc --noEmit` passes vacuously under the project-references layout.
> **`npm run build` is the real typecheck.**

## Runtime environment

- **Node.js 22+** — development and build only; Vite emits static browser assets.
- **Python 3.12** — the AI service and workers, on the institute server.
- **No SSR.** Browser-only SPA served as static files.
- Deployment: nginx on Windows Server (see [deploy/README.md](../../deploy/README.md)), or any
  static host if the AI layer is not needed.

## Environment variables

```
VITE_SUPABASE_URL=       # Supabase project URL
VITE_SUPABASE_ANON_KEY=  # anon/public key
VITE_RAG_URL=            # Ask SURYA base URL; "/rag" behind the nginx proxy
```

Fallback: the Setup Wizard stores the first two in `localStorage`
(`surya_supabase_url`, `surya_supabase_anon_key`) — dev convenience, deprecated for
production. Server-side variables are documented in `deploy/rag-api.env.example` and
`deploy/rag-worker.env.example`.

## Where server-side logic lives

There is **no Node.js API tier**. Business rules are PostgreSQL `SECURITY DEFINER`
functions plus RLS policies; the only HTTP service is the Python AI layer. See
[app.md §8](app.md#8-non-goals).
