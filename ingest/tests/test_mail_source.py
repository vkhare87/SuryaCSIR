from email.message import EmailMessage

from mail_source import Mailbox


class _FakeIMAP:
    def __init__(self, messages: dict[bytes, bytes]):
        self.messages = messages
        self.fetch_calls: list[tuple[bytes, str]] = []
        self.store_calls: list[tuple[bytes, str, str]] = []

    def search(self, charset, criterion):
        assert criterion == "UNSEEN"
        return "OK", [b" ".join(self.messages.keys())]

    def fetch(self, uid: bytes, parts: str):
        self.fetch_calls.append((uid, parts))
        return "OK", [(b"1 (BODY[] {0})", self.messages[uid])]

    def store(self, uid: bytes, command: str, flags: str):
        self.store_calls.append((uid, command, flags))
        return "OK", []


def _build_mail(sender: str, attachments: list[tuple[str, bytes]]) -> bytes:
    msg = EmailMessage()
    msg["From"] = f"Sender <{sender}>"
    msg["To"] = "harvest@ampri.res.in"
    msg["Subject"] = "Monthly division report"
    msg.set_content("See attached.")
    for name, payload in attachments:
        msg.add_attachment(payload, maintype="application", subtype="octet-stream", filename=name)
    return msg.as_bytes()


def test_unseen_messages_peeks_without_marking_seen():
    raw = _build_mail("HoD@ampri.res.in", [("report.pdf", b"%PDF-1.4 test")])
    conn = _FakeIMAP({b"42": raw})
    box = Mailbox(conn)

    msgs = list(box.unseen_messages())

    assert len(msgs) == 1
    assert msgs[0].uid == b"42"
    assert msgs[0].sender_email == "hod@ampri.res.in"
    assert [(a.filename, a.content) for a in msgs[0].attachments] == [
        ("report.pdf", b"%PDF-1.4 test"),
    ]
    assert conn.fetch_calls == [(b"42", "(BODY.PEEK[])")]
    assert conn.store_calls == []


def test_mark_seen_sets_seen_flag_explicitly():
    conn = _FakeIMAP({})
    box = Mailbox(conn)

    box.mark_seen(b"42")

    assert conn.store_calls == [(b"42", "+FLAGS", "\\Seen")]
