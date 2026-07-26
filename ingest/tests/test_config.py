import pytest

from config import load_config

BASE_ENV = {
    "SUPABASE_URL": "https://x.supabase.co",
    "SUPABASE_SERVICE_KEY": "key",
    "INGEST_OWNER_USER_ID": "00000000-0000-0000-0000-000000000000",
    "POLL_INTERVAL_S": "300",
}


def test_missing_required_raises():
    with pytest.raises(ValueError, match="SUPABASE_URL"):
        load_config({})


def test_neither_source_configured():
    cfg = load_config(BASE_ENV)
    assert cfg.watch_root is None
    assert cfg.imap_enabled is False


def test_folder_only():
    cfg = load_config({**BASE_ENV, "WATCH_ROOT": r"C:\watched"})
    assert cfg.watch_root == r"C:\watched"
    assert cfg.imap_enabled is False


def test_imap_requires_all_three_vars():
    cfg = load_config({**BASE_ENV, "IMAP_HOST": "imap.example.com", "IMAP_USER": "u"})
    assert cfg.imap_enabled is False  # IMAP_PASSWORD missing

    cfg2 = load_config({**BASE_ENV, "IMAP_HOST": "imap.example.com", "IMAP_USER": "u", "IMAP_PASSWORD": "p"})
    assert cfg2.imap_enabled is True
    assert cfg2.imap_port == 993
