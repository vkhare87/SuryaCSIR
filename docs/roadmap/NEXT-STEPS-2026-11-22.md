# Next steps — 2026-11-22

Snapshot after PRs #1–#37 merged. `main` = `origin/main` = `74b1c05f`. No open PRs. No extra worktrees.

## Health check (run 2026-11-22)

| Check | Result |
|---|---|
| `npm run build` (real typecheck) | Pass |
| `npm run lint` | 0 errors, 852 warnings |
| `npm test` | 171 files, 1,457 tests, all pass |
| `scripts/check_security_definer.py` | 256 functions, none unguarded |
| Python tests (`rag/`, `ingest/`) | Not run (Python 3.14 / WDAC blockers) |

## Inconsistencies found

1. **Docs out of date.** `CLAUDE.md` says 148 test files / 1,297 tests. Real: 171 / 1,457.
2. **DB doc out of date.** `database_design.md` says 121 tables, 8-file baseline. Migrations 09–15 and `20261122000001`–`06` add more. Re-count and update the doc.
3. **Design-token drift.** 852 lint warnings: ~600 raw hex colours in classes, ~245 raw Tailwind colours. This breaks the `DESIGN.md` rule.
4. **Hook warning.** One `react-hooks/exhaustive-deps` warning (`committee`, `committeeMembers`, `staff`). Check if it is a real bug.
5. **Bundle size.** `react-pdf` chunk is 1.4 MB. `dataMigration` is 497 kB. Both load too early.
6. **Stale stashes.** 10 old git stashes from dead branches.
7. **Stale remote branches.** All merged into `main`. Safe to delete on GitHub.
8. **PR #35 lost work once.** PR #36 restored it. Add a post-merge diff check.

## Plan (in order)

1. **Docs sync (S) — DONE 2026-11-22.** Fix counts in `CLAUDE.md`, `database_design.md`, `api_spec.md`. Add new migrations 09–15 and `20261122*`.
2. **Housekeeping (S) — DONE 2026-11-22.** Delete merged remote branches. Drop dead stashes after a look.
3. **Token cleanup (M) — DONE 2026-11-22.** 0 colour warnings; debt list is empty and the rule is now `error` everywhere. Replace raw colours with semantic tokens, page by page. Start with `pms/` and `proposals/`. Target: 0 warnings. Then make the lint rule an error.
4. **Hook warning (S) — DONE 2026-11-22.** Fix or justify the one `exhaustive-deps` warning.
5. **Code-split (M) — DONE 2026-11-22.** Admin routes and xlsx/charts were already lazy. Fixed the one leak: `AWPMine.tsx` pulled `react-pdf` (1.4 MB) on page open. Eager JS at startup: 842 kB raw. Lazy-load `react-pdf` and admin-only routes (`/data`, `/pms/audit`, `/audit`).
6. **Python gate (M).** Get `rag/` and `ingest/` tests running (Python 3.12 venv). Close the mail-in ack-after-land bug (WP-0).
7. **RAG host (L).** Stand up the production host with a GPU. See `deploy/README.md`.
8. **Roadmap WP-1 / WP-2 (M).** Quick wins, then the alert spine. See `docs/roadmap/ROADMAP.md`.
