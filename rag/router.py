def route(question: str, llm) -> str:
    """Classify a question into a single answer path. Defaults to 'document' — the safe
    branch (RLS-scoped traversal) — when the classifier is unsure."""
    label = llm.classify(question).strip().lower()
    return "structured" if "structured" in label else "document"
