from dataclasses import dataclass

REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "INGEST_OWNER_USER_ID", "POLL_INTERVAL_S"]


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_service_key: str
    ingest_owner_user_id: str
    poll_interval_s: int
    # Folder-watch — off if WATCH_ROOT is unset.
    watch_root: str | None
    # Mail-in — off unless every IMAP_* var is set.
    imap_enabled: bool
    imap_host: str | None
    imap_port: int
    imap_user: str | None
    imap_password: str | None
    imap_mailbox: str
    # Optional private-CA bundle for the mail server. None = system trust store.
    imap_ca_file: str | None


def load_config(env: dict) -> Config:
    missing = [k for k in REQUIRED if not env.get(k)]
    if missing:
        raise ValueError(f"Missing required env: {', '.join(missing)}")

    imap_vars = ["IMAP_HOST", "IMAP_USER", "IMAP_PASSWORD"]
    imap_enabled = all(env.get(k) for k in imap_vars)

    return Config(
        supabase_url=env["SUPABASE_URL"],
        supabase_service_key=env["SUPABASE_SERVICE_KEY"],
        ingest_owner_user_id=env["INGEST_OWNER_USER_ID"],
        poll_interval_s=int(env["POLL_INTERVAL_S"]),
        watch_root=env.get("WATCH_ROOT") or None,
        imap_enabled=imap_enabled,
        imap_host=env.get("IMAP_HOST"),
        imap_port=int(env.get("IMAP_PORT", "993")),
        imap_user=env.get("IMAP_USER"),
        imap_password=env.get("IMAP_PASSWORD"),
        imap_mailbox=env.get("IMAP_MAILBOX", "INBOX"),
        imap_ca_file=env.get("IMAP_CA_FILE") or None,
    )
