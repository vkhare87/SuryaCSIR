"""Mail-in authorization and acknowledgement.

Two invariants:

1. `ingest_sender_map` is an authorization gate, not a division tag. Anyone
   on the internet can mail the harvest address; landing an unmapped sender's
   attachment let them publish into the shared documents bucket and the RAG
   corpus without holding an account at all.

2. A message is acknowledged (`\\Seen`) only when nothing about it is worth
   retrying. A transient Storage/DB failure must leave it unread — otherwise
   an outage mid-poll drops the mail permanently, since content-hash dedupe
   only helps if the sender happens to send it again.
"""

import sys
from contextlib import contextmanager
from dataclasses import dataclass

import pytest

from db import FakeDB
from mail_source import MailAttachment, MailMessage
import worker


@dataclass(frozen=True)
class FakeConfig:
    watch_root: str | None = None
    imap_enabled: bool = True
    imap_host: str = "imap.example.com"
    imap_port: int = 993
    imap_user: str = "harvest"
    imap_password: str = "pw"
    imap_mailbox: str = "INBOX"
    imap_ca_file: str | None = None


class FakeMailbox:
    def __init__(self, messages):
        self._messages = messages
        self.seen: list[bytes] = []

    def unseen_messages(self):
        return iter(self._messages)

    def mark_seen(self, uid):
        self.seen.append(uid)


def install_mailbox(monkeypatch, *messages):
    """messages: (uid, sender, [(filename, content), ...]) triples."""
    box = FakeMailbox([
        MailMessage(uid=uid, sender_email=sender,
                    attachments=[MailAttachment(f, c) for f, c in atts])
        for uid, sender, atts in messages
    ])

    @contextmanager
    def fake_open(*a, **kw):
        yield box

    monkeypatch.setattr(worker, "open_mailbox", fake_open)
    return box


# ── Authorization ──────────────────────────────────────────────────────

def test_mapped_sender_lands(monkeypatch):
    db = FakeDB()
    db.sender_map = {"hod@ampri.res.in": "CMPD"}
    box = install_mailbox(monkeypatch, (b"1", "hod@ampri.res.in", [("scan.pdf", b"%PDF-1.4 a")]))

    assert worker.run_once(FakeConfig(), db) == 1
    assert len(db.documents) == 1
    assert box.seen == [b"1"]


def test_unmapped_sender_is_rejected(monkeypatch):
    db = FakeDB()
    db.sender_map = {"hod@ampri.res.in": "CMPD"}
    box = install_mailbox(
        monkeypatch, (b"1", "attacker@evil.example", [("payload.pdf", b"%PDF-1.4 b")]))

    assert worker.run_once(FakeConfig(), db) == 0
    assert db.documents == {}
    assert db.harvested == {}
    assert db.storage == {}
    # Deliberate refusal — retire it rather than re-reading it every poll.
    assert box.seen == [b"1"]


def test_mapped_sender_with_null_division_still_lands(monkeypatch):
    """A mapped sender whose division is unresolved is authorized — it just
    has no division tag. Only *absence from the map* is a rejection."""
    db = FakeDB()
    db.sender_map = {"director@ampri.res.in": None}
    install_mailbox(monkeypatch, (b"1", "director@ampri.res.in", [("note.pdf", b"%PDF-1.4 c")]))

    assert worker.run_once(FakeConfig(), db) == 1
    assert len(db.documents) == 1


def test_rejection_does_not_stop_later_messages(monkeypatch):
    db = FakeDB()
    db.sender_map = {"hod@ampri.res.in": "CMPD"}
    install_mailbox(
        monkeypatch,
        (b"1", "attacker@evil.example", [("payload.pdf", b"%PDF-1.4 d")]),
        (b"2", "hod@ampri.res.in", [("real.pdf", b"%PDF-1.4 e")]),
    )

    assert worker.run_once(FakeConfig(), db) == 1
    assert len(db.documents) == 1


# ── Acknowledgement ────────────────────────────────────────────────────

def test_message_is_not_acked_when_landing_fails(monkeypatch):
    """The whole point: an outage must not consume the mail."""
    db = FakeDB()
    db.sender_map = {"hod@ampri.res.in": "CMPD"}
    monkeypatch.setattr(
        db, "upload",
        lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("storage down")))
    box = install_mailbox(monkeypatch, (b"1", "hod@ampri.res.in", [("scan.pdf", b"%PDF-1.4 f")]))

    assert worker.run_once(FakeConfig(), db) == 0
    assert box.seen == []


def test_partial_failure_leaves_whole_message_unread(monkeypatch):
    """One attachment lands, another fails: the message stays unread so the
    next poll retries. Dedupe stops the landed one being duplicated."""
    db = FakeDB()
    db.sender_map = {"hod@ampri.res.in": "CMPD"}

    real_upload = db.upload
    calls = {"n": 0}

    def flaky_upload(path, content, mime_type):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("storage down")
        return real_upload(path, content, mime_type)

    monkeypatch.setattr(db, "upload", flaky_upload)
    box = install_mailbox(monkeypatch, (b"1", "hod@ampri.res.in", [
        ("one.pdf", b"%PDF-1.4 g"),
        ("two.pdf", b"%PDF-1.4 h"),
    ]))

    assert worker.run_once(FakeConfig(), db) == 1
    assert box.seen == []


def test_ack_survives_a_duplicate(monkeypatch):
    """A re-sent attachment is a no-op, not a failure — still acknowledge."""
    db = FakeDB()
    db.sender_map = {"hod@ampri.res.in": "CMPD"}
    install_mailbox(monkeypatch, (b"1", "hod@ampri.res.in", [("scan.pdf", b"%PDF-1.4 i")]))
    worker.run_once(FakeConfig(), db)

    box = install_mailbox(monkeypatch, (b"2", "hod@ampri.res.in", [("scan.pdf", b"%PDF-1.4 i")]))
    assert worker.run_once(FakeConfig(), db) == 0
    assert box.seen == [b"2"]


def test_refused_extension_is_acked_not_retried(monkeypatch):
    """The allowlist verdict is deterministic — retrying cannot change it."""
    db = FakeDB()
    db.sender_map = {"hod@ampri.res.in": "CMPD"}
    box = install_mailbox(
        monkeypatch, (b"1", "hod@ampri.res.in", [("invoice.pdf.exe", b"MZ\x90\x00")]))

    assert worker.run_once(FakeConfig(), db) == 0
    assert db.documents == {}
    assert db.storage == {}
    assert box.seen == [b"1"]


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
