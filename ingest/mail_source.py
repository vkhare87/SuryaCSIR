import email
import imaplib
import ssl
from contextlib import contextmanager
from email.utils import parseaddr
from typing import Iterator, NamedTuple


class MailAttachment(NamedTuple):
    filename: str
    content: bytes


class MailMessage(NamedTuple):
    uid: bytes
    sender_email: str
    attachments: list[MailAttachment]


class Mailbox:
    """An open IMAP session. Yields whole messages and lets the caller decide
    when one is safely dealt with.

    The previous shape yielded loose attachments and marked the message
    `\\Seen` as the generator advanced — including when landing had *failed*.
    A Supabase or Storage outage mid-poll therefore dropped that mail
    permanently, since content-hash dedupe only helps if the file is sent
    again. Acknowledgement is now the caller's explicit act.
    """

    def __init__(self, conn: imaplib.IMAP4_SSL):
        self._conn = conn

    def unseen_messages(self) -> Iterator[MailMessage]:
        status, data = self._conn.search(None, "UNSEEN")
        if status != "OK":
            return
        for uid in data[0].split():
            status, msg_data = self._conn.fetch(uid, "(RFC822)")
            if status != "OK" or not msg_data or not msg_data[0]:
                continue
            msg = email.message_from_bytes(msg_data[0][1])
            sender = parseaddr(msg.get("From", ""))[1].lower()

            attachments = []
            for part in msg.walk():
                if part.get_content_disposition() != "attachment":
                    continue
                filename = part.get_filename()
                content = part.get_payload(decode=True)
                if filename and content:
                    attachments.append(MailAttachment(filename, content))

            yield MailMessage(uid=uid, sender_email=sender, attachments=attachments)

    def mark_seen(self, uid: bytes) -> None:
        """Retire a message. Call only once it needs no further attempt —
        either everything landed, or it was rejected on purpose (an unmapped
        sender stays rejected, so re-reading it every poll is pure waste)."""
        self._conn.store(uid, "+FLAGS", "\\Seen")


@contextmanager
def open_mailbox(host: str, port: int, user: str, password: str, mailbox: str,
                 ca_file: str | None = None) -> Iterator[Mailbox]:
    """`ssl_context` is passed explicitly: imaplib defaults to
    ssl._create_stdlib_context(), an alias for _create_unverified_context
    (check_hostname=False, CERT_NONE). That encrypts the session but
    authenticates nothing, so any MITM presenting a self-signed certificate
    collects the mailbox password sent by conn.login() below."""
    context = ssl.create_default_context(cafile=ca_file)
    conn = imaplib.IMAP4_SSL(host, port, ssl_context=context)
    try:
        conn.login(user, password)
        conn.select(mailbox)
        yield Mailbox(conn)
    finally:
        try:
            conn.logout()
        except Exception:
            pass
