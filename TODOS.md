# TODOS

## Mail-in ack-after-land (Phase B hardening) — RESOLVED (2026-11-21)

- **What:** `ingest/mail_source.py` previously fetched messages with `(RFC822)` (which implicitly sets `\Seen` on IMAP servers during `FETCH`), before `land_file` confirmed upload/insert succeeded.
- **Fix:** Switched `Mailbox.unseen_messages()` to `FETCH (BODY.PEEK[])` so the server leaves messages `UNSEEN` until `Mailbox.mark_seen()` runs after every attachment lands or is deterministically refused/deduped; covered by `ingest/tests/test_mail_source.py` and `ingest/tests/test_worker.py`.

## Per-division freshness attribution (post-Phase-B upgrade) — RESOLVED (2026-11-21)

- **What:** Upgraded `import_events` from one-event-per-upload to per-division fan-out rows via `import_events.division_code` (`20261121000009_stage0_hardening.sql`), `attributeImportDivisions()` + `resolveImportDivisions()` in `src/components/ImportFlow.tsx`, division-aware `contribution_requests_sweep()`, and `domainUploadLedger(..., divisionCode)` in `src/lib/divisions/uploadFreshness.ts` (with `NULL` `division_code` fallback for `divisions` and unlinked rows).
