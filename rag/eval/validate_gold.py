"""Lint gold eval files against corpus.json BEFORE running run_eval.py.
An unresolvable expected_citation silently scores 0 in the eval; this makes the
authoring session (IMPROVEMENT-PROPOSALS.md P10) a fast validate-fix loop.

Usage: py -3.12 eval/validate_gold.py   (from rag/;  exits 1 on any problem)"""

import difflib
import json
import os
import sys

VALID_MODES = {"structured", "document", "hybrid"}


def load_jsonl(path):
    """-> (cases_with_lineno, errors). Never raises on bad lines; reports them."""
    cases, errors = [], []
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            if not line.strip():
                continue
            try:
                cases.append((n, json.loads(line)))
            except json.JSONDecodeError as e:
                errors.append(f"{os.path.basename(path)}:{n}: invalid JSON — {e}")
    return cases, errors


def _walk_labels(corpus, lower):
    """Every reachable citation label, ALL depths — mirrors retrieval.descend,
    which recurses into node['nodes']; retrieval.flatten alone is top-level only."""
    labels = set()

    def walk(title, node):
        label = f"{title} — {node.get('title', '')}"
        labels.add(label.lower() if lower else label)
        for child in node.get("nodes") or []:
            walk(title, child)

    for d in corpus:
        root = (d.get("tree") or {}).get("root") or {}
        for node in root.get("nodes", []):
            walk(d.get("title", ""), node)
    return labels


def corpus_labels(corpus):
    """Lowercased label set — the matching layer (see run_eval substring rule)."""
    return _walk_labels(corpus, lower=True)


def _resolvable(needle, labels):
    n = needle.lower()
    return any(n in lb for lb in labels)


def _suggest(needle, corpus):
    """Nearest node title in the author's original casing, so the fix is copy-paste."""
    cased = sorted(_walk_labels(corpus, lower=False))
    close = difflib.get_close_matches(needle, cased, n=1, cutoff=0.4)
    return f" (closest: '{close[0]}')" if close else ""


def check_citations(cases, corpus, fname):
    labels = corpus_labels(corpus)
    errors = []
    for n, c in _numbered(cases):
        if not c.get("question") or not c.get("expected_citation"):
            errors.append(f"{fname}:{n}: needs 'question' and 'expected_citation'")
            continue
        if not _resolvable(c["expected_citation"], labels):
            errors.append(f"{fname}:{n}: expected_citation '{c['expected_citation']}' "
                          f"matches no corpus node{_suggest(c['expected_citation'], corpus)}")
    return errors


def check_duplication(cases, corpus, fname):
    labels = corpus_labels(corpus)
    errors = []
    for n, c in _numbered(cases):
        if not c.get("topic") or not isinstance(c.get("overlapping"), list) or not c["overlapping"]:
            errors.append(f"{fname}:{n}: needs 'topic' and non-empty 'overlapping' list")
            continue
        for o in c["overlapping"]:
            if not _resolvable(o, labels):
                errors.append(f"{fname}:{n}: overlapping '{o}' matches no corpus "
                              f"node{_suggest(o, corpus)}")
    return errors


def check_router(cases, fname):
    errors, seen = [], {}
    for n, c in _numbered(cases):
        if not c.get("question") or c.get("expected_mode") not in VALID_MODES:
            errors.append(f"{fname}:{n}: needs 'question' and expected_mode in {sorted(VALID_MODES)}")
        q = (c.get("question") or "").strip().lower()
        if q in seen:
            errors.append(f"{fname}:{n}: duplicate question (first at line {seen[q]})")
        else:
            seen[q] = n
    return errors


def _numbered(cases):
    """Accept both [(lineno, case)] from load_jsonl and bare [case] from tests."""
    return [c if isinstance(c, tuple) else (i + 1, c) for i, c in enumerate(cases)]


def main():
    base = os.path.dirname(os.path.abspath(__file__))
    errors = []

    gold, errs = load_jsonl(os.path.join(base, "gold.jsonl"))
    errors += errs + check_router(gold, "gold.jsonl")

    corpus_path = os.path.join(base, "corpus.json")
    if not os.path.exists(corpus_path):
        print("[validate] corpus.json missing — router file checked only "
              "(citation/duplication checks need the corpus; see run_eval.py --corpus-from-db)")
    else:
        with open(corpus_path, encoding="utf-8") as f:
            corpus = json.load(f)
        for fname, checker in (("gold_citations.jsonl", check_citations),
                               ("gold_duplication.jsonl", check_duplication)):
            path = os.path.join(base, fname)
            if os.path.exists(path):
                cases, errs = load_jsonl(path)
                errors += errs + checker(cases, corpus, fname)

    for e in errors:
        print(f"[validate] {e}")
    print(f"[validate] {'FAILED — ' + str(len(errors)) + ' problem(s)' if errors else 'all gold files OK'}")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
