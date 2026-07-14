from dataclasses import dataclass, field


@dataclass
class Citation:
    document_id: str
    title: str
    node_title: str
    page_start: int
    page_end: int
    storage_path: str = ""


@dataclass
class Answer:
    text: str
    mode: str               # 'document' | 'structured' | 'hybrid'
    citations: list = field(default_factory=list)
    # Decision trace (RP3): {route, function, params, fallback?} — how this answer
    # was produced. Logged to query_log; rides in the API payload for auditability.
    trace: dict | None = None
    # Typed payload (RP1): structured result data separated from the prose text,
    # so tools/UI can consume results without parsing English.
    data: dict | None = None
