# Deploy profiles

Three targets, same codebase — only env values change (see `CLAUDE.md` /
"Where Things Live" for why: HashRouter + `useData()` + swappable RAG adapters
make the app host-agnostic by design).

| Profile | DB | LLM host | SPA↔API |
|---|---|---|---|
| `laptop` | Supabase cloud project | Ollama on localhost, `qwen3-vl:8b` | different ports, needs `CORS_ORIGINS` |
| `institute-server` | self-hosted Supabase (Docker) | Ollama on same box, `qwen3-vl:32b` | same-origin via nginx, no CORS needed |
| `cloud` | Supabase cloud project | rented GPU/CPU endpoint | fill in per provider |

## Use

```bash
cp deploy/profiles/<target>/rag-worker.env rag/.env
cp deploy/profiles/<target>/rag-api.env    rag/.env.api
cp deploy/profiles/<target>/spa.env        .env      # repo root
```

Then fill in the blank secrets (Supabase keys, LLM endpoint) — never commit
the copied files (`rag/.env`, `rag/.env.api`, `.env` are all gitignored).

## Switching later

Moving from `laptop` to `institute-server` after the demo is a copy-and-refill,
not a rewrite: same migrations (`supabase db push` against the new host), same
RLS policies, same RAG code. See `deploy/README.md` for the full self-hosted
Supabase + systemd runbook.
