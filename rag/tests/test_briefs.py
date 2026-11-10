import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

from answer import Answer, Citation
from auth import mint_user_token
from briefs import is_due, notification_for, run_briefs
from llm import REFUSAL_TEXT

NOW = datetime(2026, 10, 20, 9, 0, tzinfo=timezone.utc)


class FakeBriefDB:
    def __init__(self, rows):
        self.rows = rows
        self.posted = []
        self.marked = {}

    def scheduled_queries(self):
        return self.rows

    def post_notification(self, row):
        self.posted.append(row)

    def mark_brief(self, qid, ran_at, error):
        self.marked[qid] = (ran_at, error)


def _q(qid="q1", cadence="weekly", last=None, owner="u1"):
    return {"id": qid, "owner": owner, "question": "Which projects end this year?",
            "cadence": cadence, "last_run_at": last}


def _ans(text="Three projects end in 2026.", cites=1):
    return Answer(text=text, mode="document",
                  citations=[Citation("d1", "Annual report", "Projects", 4, 5)] * cites)


def test_is_due_by_cadence():
    assert is_due("weekly", None, NOW)
    assert not is_due("weekly", NOW - timedelta(days=3), NOW)
    assert is_due("weekly", NOW - timedelta(days=7), NOW)
    assert is_due("daily", NOW - timedelta(hours=23, minutes=30), NOW)   # within slack
    assert not is_due("daily", NOW - timedelta(hours=12), NOW)


def test_due_brief_is_answered_as_owner_and_posted():
    db = FakeBriefDB([_q(owner="owner-7")])
    seen = []
    n = run_briefs(db, llm=None, client_for=lambda uid: seen.append(uid) or f"client:{uid}",
                   answer=lambda q, client, llm: _ans(), now=NOW)
    assert n == 1
    assert seen == ["owner-7"]
    row = db.posted[0]
    assert row["user_id"] == "owner-7"
    assert row["source"] == "agent"
    assert row["dedupe_key"] == "brief:q1:2026-10-20"
    assert row["proposed_action"]["citations"][0]["document_id"] == "d1"
    assert db.marked["q1"] == (NOW, None)


def test_not_due_brief_is_skipped():
    db = FakeBriefDB([_q(last=NOW - timedelta(days=1))])
    assert run_briefs(db, None, lambda u: None, answer=lambda *a: _ans(), now=NOW) == 0
    assert db.posted == [] and db.marked == {}


def test_refusal_is_not_posted_but_is_stamped():
    db = FakeBriefDB([_q()])
    n = run_briefs(db, None, lambda u: None, answer=lambda *a: _ans(REFUSAL_TEXT, cites=0), now=NOW)
    assert n == 0 and db.posted == []
    assert db.marked["q1"] == (NOW, None)


def test_one_failure_does_not_stop_the_rest():
    db = FakeBriefDB([_q("bad"), _q("good")])

    def answer(question, client, llm):
        if client == "bad-client":
            raise RuntimeError("model timeout")
        return _ans()

    clients = iter(["bad-client", "good-client"])
    n = run_briefs(db, None, lambda u: next(clients), answer=answer, now=NOW)
    assert n == 1
    assert db.marked["bad"][1] == "model timeout"
    assert db.marked["good"] == (NOW, None)


def test_no_citations_means_no_proposed_action():
    assert notification_for(_q(), _ans(cites=0), NOW)["proposed_action"] is None


def test_minted_token_is_valid_hs256_for_the_owner():
    tok = mint_user_token("s3cret", "user-1", "a@b.in", ttl_s=300, now=1000, jti="j1")
    head, body, sig = tok.split(".")
    pad = lambda s: s + "=" * (-len(s) % 4)  # noqa: E731
    payload = json.loads(base64.urlsafe_b64decode(pad(body)))
    assert payload == {"sub": "user-1", "role": "authenticated", "aud": "authenticated",
                       "iat": 1000, "exp": 1300, "jti": "j1", "email": "a@b.in"}
    want = hmac.new(b"s3cret", f"{head}.{body}".encode(), hashlib.sha256).digest()
    assert base64.urlsafe_b64decode(pad(sig)) == want


def _payload(tok):
    body = tok.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))


def test_each_minted_token_has_its_own_jti():
    a, b = (_payload(mint_user_token("s", "u", None))["jti"] for _ in range(2))
    assert len(a) == 32 and a != b


def test_brief_client_logs_one_mint_line_with_the_tokens_jti(monkeypatch):
    import worker

    class Cfg:
        supabase_jwt_secret, supabase_url, supabase_anon_key = "s", "http://sb", "anon"

    class Db:
        def user_email(self, _):
            return "a@b.in"

    seen, lines = [], []
    monkeypatch.setattr("auth.scoped_client", lambda url, key, tok: seen.append(tok) or "client")
    client_for = worker.brief_client_factory(Cfg(), Db(), log=lines.append)
    assert client_for("owner-1") == "client"
    assert lines == [f"[rag] brief token minted owner=owner-1 jti={_payload(seen[0])['jti']}"]
