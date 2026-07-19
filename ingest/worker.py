import os
import sys
import time
from pathlib import Path

from config import load_config
from folder_source import scan_folder
from mail_source import scan_mailbox
from sink import land_file


def _land(db, source, source_identifier, division_code, filename, content) -> bool:
    # One bad file (DB insert error, malformed name) must not kill the whole
    # polling pass — log and move on; dedupe means it's retried next pass.
    try:
        return bool(land_file(db, source, source_identifier, division_code, filename, content))
    except Exception as e:
        print(f"[ingest] failed to land {filename!r} from {source}:{source_identifier}: {e}", flush=True)
        return False


def run_once(cfg, db) -> int:
    landed = 0

    if cfg.watch_root:
        for f in scan_folder(Path(cfg.watch_root)):
            if _land(db, "folder", f.division_code, f.division_code, f.filename, f.content):
                landed += 1

    if cfg.imap_enabled:
        sender_map = db.load_sender_map()
        for m in scan_mailbox(cfg.imap_host, cfg.imap_port, cfg.imap_user, cfg.imap_password, cfg.imap_mailbox):
            division_code = sender_map.get(m.sender_email)
            if _land(db, "mail", m.sender_email, division_code, m.filename, m.content):
                landed += 1

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
