# TODOS

## Mail-in ack-after-land (Phase B hardening)

- **What:** `ingest/mail_source.py` marks a message `\Seen` right after
  yielding its attachments — before `land_file` confirms the upload/insert
  succeeded. A Supabase/Storage outage during a poll permanently drops that
  mail from the queue (content-hash dedupe only helps if the file is re-sent).
- **Fix:** restructure `scan_mailbox` to collect per-message and mark `\Seen`
  only after every attachment of that message lands.
- **Why deferred:** accepted in 2026-07-19 /review (D3) — no mailbox is
  provisioned yet, and worker restarts already share the same window; not
  worth destabilizing untested code pre-deployment.

## Per-division freshness attribution (post-Phase-B upgrade)

- **What:** Upgrade `import_events` from one-event-per-upload to per-division
  fan-out rows, so the freshness scoreboard is per division × domain instead of
  per domain only.
- **Why:** Chosen Phase A model (D2, 2026-07-19 eng review) records one event
  per upload. A staff file containing only 3 divisions' rows still stamps the
  whole staff domain fresh — divisions absent from the file can show green
  while stale. Accepted deliberately for demo simplicity.
- **Pros:** Scoreboard stops lying per division; row counts per division give a
  depth signal; the pressure mechanism reaches individual division heads.
- **Cons:** Fan-out insert per upload; needs an ALL fallback for domains
  without division linkage (e.g. the divisions master list itself); tile grows
  from 7 rows to a matrix.
- **Context:** `resolveImportDivisions()` in `src/utils/dataMigration.ts`
  already maps import rows → divisions during the cleaning flow; start there.
  Becomes natural after Phase B (watched folders / mail-in), when files start
  arriving per-division anyway. See design doc
  `~/.gstack/projects/vkhare87-SuryaCSIR/vkhare87-main-design-data-ingestion-20260719.md`.
- **Depends on / blocked by:** Phase A shipped (import_events table exists).
  Best sequenced with Phase B.
