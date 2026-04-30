# Technology Stack
_Last updated: 2026-04-30_

## Core

| Layer | Choice | Version |
|-------|--------|---------|
| UI framework | React | ^19.2.4 |
| Language | TypeScript | ~5.9.3 |
| Bundler | Vite | ^8.0.0 |
| Routing | React Router DOM (`HashRouter`) | ^7.13.1 |
| Styling | Tailwind CSS 4 (via `@tailwindcss/vite`) | ^4.2.1 |
| Database | Supabase (hosted PostgreSQL + Auth + RLS) | ^2.99.2 |

## Key Libraries

| Purpose | Package | Notes |
|---------|---------|-------|
| Charts | recharts | ^3.8.0 |
| Animation | framer-motion (published as `motion`) | ^12.36.0 |
| Icons | lucide-react | ^0.577.0 |
| Class composition | clsx + tailwind-merge | ^2.1.1 / ^3.5.0 |
| PDF export | @react-pdf/renderer | ^4.5.1 |
| Excel parsing | xlsx | ^0.18.5 |
| CSV parsing | papaparse | ^5.5.3 |
| Schema validation | zod | ^4.3.6 |

## Build / Dev Tooling

| Tool | Config |
|------|--------|
| Vite | `vite.config.ts` — plugins: `@vitejs/plugin-react`, `@tailwindcss/vite` |
| TypeScript | `tsconfig.json` (references root), `tsconfig.app.json`, `tsconfig.node.json` |
| ESLint 9 | `eslint.config.js` flat config, `typescript-eslint`, `react-hooks`, `react-refresh` |
| No Prettier | Formatting not enforced by tooling |

## TypeScript Strict Settings (`tsconfig.app.json`)

```json
"strict": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"noFallthroughCasesInSwitch": true,
"verbatimModuleSyntax": true,
"erasableSyntaxOnly": true
```

`verbatimModuleSyntax` means: all type-only imports must use `import type { ... }`.

## Runtime Environment

- Node.js v24.x (dev only — Vite produces static browser assets)
- No SSR. Browser-only SPA.
- Deployment: any static file host (Vercel, Netlify, self-hosted nginx)

## Environment Variables

```
VITE_SUPABASE_URL=       # Supabase project URL
VITE_SUPABASE_ANON_KEY=  # Supabase anon/public key
```

Fallback: Setup Wizard stores them in `localStorage` (`surya_supabase_url`, `surya_supabase_anon_key`). Env vars preferred.

## No Server

The app has no backend beyond Supabase. All PMS state-machine logic runs as PostgreSQL SECURITY DEFINER functions — no Node.js API layer.
