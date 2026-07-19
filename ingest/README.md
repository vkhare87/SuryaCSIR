# SURYA Ingest Worker (Phase B)

Standalone Python worker implementing the data-ingestion design doc's Phase B —
"zero-behavior-change capture." Harvests files divisions already produce
without asking them to change how they work:

- **Watched folder** — polls `WATCH_ROOT`, one subfolder per division code
  (`WATCH_ROOT\CMPD\monthly-report.xlsx`). Folder name = division tag.
- **Mail-in** — polls an IMAP mailbox for unseen messages, extracts
  attachments, tags by sender via the `ingest_sender_map` table.

Either source can be disabled by leaving its env vars unset — see
`.env.example`. Pure stdlib + `supabase-py`, no native dependencies (unlike
`rag/`, this runs fine on any Python 3.10+, no WDAC DLL issues).

## Where files land

- **Structured** (`.xlsx`/`.xls`/`.csv`) → `harvested_imports` table. Shows up
  under Data Management → **Harvested** for a human to pick the entity type
  and confirm via the same import flow as a manual upload. Nothing commits to
  HR tables unreviewed.
- **Everything else** (PDF, scans) → the existing `documents` table with
  `ingest_status='pending'` — the `rag/` worker picks it up automatically
  (read-only corpus, low risk, no review gate).

Dedupe is by SHA-256 content hash (survives re-sent mail, a folder re-scan of
an unchanged file, a file renamed but otherwise identical).

## Setup

```bash
cd ingest
py -3.12 -m venv .venv         # pin 3.12 — a bare `python`/`py` on this machine
                                # may resolve to 3.14, which is fine for ingest's
                                # own deps but drifts from rag/'s required 3.12
.venv/Scripts/activate          # Windows; source .venv/bin/activate on *nix
pip install -r requirements.txt
cp .env.example .env
```

`INGEST_OWNER_USER_ID` needs a real `auth.users` row — create one in the
Supabase Dashboard (Authentication → Users), no login required, just a
service identity for the `documents.owner_id` FK.

`WATCH_ROOT` and the `IMAP_*` mailbox are real infrastructure the design doc
left as open questions (institute-server folder share, IT-provisioned mailbox
account) — fill in whichever you have. Neither is required to run; a source
with unset env vars is silently skipped.

## Run

```bash
python worker.py            # poll loop (sleeps POLL_INTERVAL_S between passes)
python worker.py --once     # single pass, then exit (deploy verify / cron)
```

## Tests

```bash
pip install pytest
python -m pytest -v
```

All logic is tested against `FakeDB` (in-memory) — no live Supabase project
or IMAP server needed to run the suite.
