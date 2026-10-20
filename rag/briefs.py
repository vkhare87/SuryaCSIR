"""Scheduled briefs (WP-2 E4) — the first background agent.

A user saves an Ask SURYA question with a cadence (scheduled_queries). When one is
due, the worker answers it AS ITS OWNER (client_for(owner) must return an
RLS-scoped client for that user) and posts the answer to the owner's notifications
feed with source='agent'.

Suggest-only by construction: the only writes are the notification row and the
schedule's own bookkeeping. Nothing here calls a state-changing RPC."""

from datetime import datetime, timedelta, timezone

from llm import REFUSAL_TEXT
from query_service import handle_query

CADENCE = {"daily": timedelta(days=1), "weekly": timedelta(days=7)}
# The host scheduler runs this hourly; without slack a daily brief would slip a
# little later every day.
SLACK = timedelta(hours=1)
BODY_CHARS = 1500
MAX_CITATIONS = 5


def is_due(cadence, last_run_at, now):
    if last_run_at is None:
        return True
    return now - last_run_at >= CADENCE.get(cadence, CADENCE["weekly"]) - SLACK


def notification_for(q, answer, now):
    citations = [{"document_id": c.document_id, "title": c.title, "page": c.page_start}
                 for c in (answer.citations or [])[:MAX_CITATIONS]]
    return {
        "user_id": q["owner"],
        "kind": "brief",
        "severity": "info",
        "title": f"{q['cadence'].capitalize()} brief: {q['question'][:80]}",
        "body": answer.text[:BODY_CHARS],
        "link": "/ask",
        "source": "agent",
        # One per schedule per day, so a re-run the same day posts nothing new.
        "dedupe_key": f"brief:{q['id']}:{now.date().isoformat()}",
        "proposed_action": {"type": "open_sources", "citations": citations} if citations else None,
    }


def run_briefs(db, llm, client_for, answer=handle_query, now=None) -> int:
    """Answer every due schedule once. Returns how many briefs were posted."""
    now = now or datetime.now(timezone.utc)
    posted = 0
    for q in db.scheduled_queries():
        if not is_due(q["cadence"], q["last_run_at"], now):
            continue
        try:
            ans = answer(q["question"], client_for(q["owner"]), llm)
            # A refusal every week is noise, not a brief.
            if ans.text.strip() != REFUSAL_TEXT:
                db.post_notification(notification_for(q, ans, now))
                posted += 1
            db.mark_brief(q["id"], now, None)
        except Exception as e:  # one owner's failure must not stop the others
            # Still stamps last_run_at: a broken question retries next cadence,
            # not every hourly pass.
            db.mark_brief(q["id"], now, str(e)[:500])
    return posted
