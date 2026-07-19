import email
import imaplib
from email.utils import parseaddr
from typing import Iterator, NamedTuple


class MailAttachment(NamedTuple):
    sender_email: str
    filename: str
    content: bytes


def scan_mailbox(host: str, port: int, user: str, password: str, mailbox: str) -> Iterator[MailAttachment]:
    """Polls UNSEEN messages in `mailbox`, yields each attachment, then marks
    the message \\Seen (native IMAP dedupe — content_hash is the backstop for
    a re-sent attachment or a mailbox re-scan)."""
    conn = imaplib.IMAP4_SSL(host, port)
    try:
        conn.login(user, password)
        conn.select(mailbox)
        status, data = conn.search(None, "UNSEEN")
        if status != "OK":
            return
        for num in data[0].split():
            status, msg_data = conn.fetch(num, "(RFC822)")
            if status != "OK" or not msg_data or not msg_data[0]:
                continue
            msg = email.message_from_bytes(msg_data[0][1])
            sender = parseaddr(msg.get("From", ""))[1].lower()
            for part in msg.walk():
                if part.get_content_disposition() != "attachment":
                    continue
                filename = part.get_filename()
                content = part.get_payload(decode=True)
                if filename and content:
                    yield MailAttachment(sender_email=sender, filename=filename, content=content)
            conn.store(num, "+FLAGS", "\\Seen")
    finally:
        try:
            conn.logout()
        except Exception:
            pass
