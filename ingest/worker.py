import os
import sys
import time
from pathlib import Path

from config import load_config
from folder_source import scan_folder
from mail_source import open_mailbox
from sink import land_file, RejectedFile


class _Outcome:
    """Landing result. `retry` separates 'try again next poll' from
    'this will never work' — only the latter may be acknowledged away."""
    LANDED = "landed"
    DUPLICATE = "duplicate"   # already have it; nothing to retry
    REFUSED = "refused"       # allowlist; will be refused identically forever
    FAILED = "failed"         # transient (DB/Storage); must be retried


def _land(db, source, source_identifier, division_code, filename, content) -> str:
    # One bad file must not kill the whole polling pass — classify and move on.
    try:
        rid = land_file(db, source, source_identifier, division_code, filename, content)
        return _Outcome.LANDED if rid else _Outcome.DUPLICATE
    except RejectedFile as e:
        print(f"[ingest] {e}", flush=True)
        return _Outcome.REFUSED
    except Exception as e:
        print(f"[ingest] failed to land {filename!r} from {source}:{source_identifier}: {e}",
              flush=True)
        return _Outcome.FAILED


def _poll_mailbox(cfg, db) -> int:
    landed = 0
    sender_map = db.load_sender_map()

    with open_mailbox(cfg.imap_host, cfg.imap_port, cfg.imap_user, cfg.imap_password,
                      cfg.imap_mailbox, cfg.imap_ca_file) as mailbox:
        for msg in mailbox.unseen_messages():
            # ingest_sender_map is the authorization gate, not just a division
            # tag. Anyone on the internet can mail this address; landing an
            # unmapped sender's attachment let them publish into the shared
            # documents bucket and the RAG corpus without an account.
            if msg.sender_email not in sender_map:
                print(f"[ingest] rejected message from {msg.sender_email!r}: "
                      f"not in ingest_sender_map", flush=True)
                mailbox.mark_seen(msg.uid)  # deliberate refusal — do not re-read it forever
                continue

            division_code = sender_map[msg.sender_email]
            outcomes = [
                _land(db, "mail", msg.sender_email, division_code, att.filename, att.content)
                for att in msg.attachments
            ]
            landed += outcomes.count(_Outcome.LANDED)

            # Retire the message only when nothing about it is worth another
            # attempt. A transient Storage/DB failure leaves it UNSEEN so the
            # next poll picks it up, instead of dropping the mail silently.
            if _Outcome.FAILED in outcomes:
                print(f"[ingest] leaving message from {msg.sender_email!r} unread — "
                      f"{outcomes.count(_Outcome.FAILED)} attachment(s) failed to land",
                      flush=True)
            else:
                mailbox.mark_seen(msg.uid)

    return landed


def run_once(cfg, db) -> int:
    landed = 0

    if cfg.watch_root:
        for f in scan_folder(Path(cfg.watch_root)):
            if _land(db, "folder", f.division_code, f.division_code,
                     f.filename, f.content) == _Outcome.LANDED:
                landed += 1

    if cfg.imap_enabled:
        landed += _poll_mailbox(cfg, db)

    return landed


def main():
    cfg = load_config(os.environ)
    if not cfg.watch_root and not cfg.imap_enabled:
        print("[ingest] neither WATCH_ROOT nor IMAP_* are configured — nothing to poll", flush=True)
        return

    from db import SupabaseDB
    db = SupabaseDB(cfg)

    once = "--once" in sys.argv
    while True:
        n = run_once(cfg, db)
        print(f"[ingest] landed {n} file(s)", flush=True)
        if once:
            return
        time.sleep(cfg.poll_interval_s)


if __name__ == "__main__":
    main()
