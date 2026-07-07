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
    mode: str               # 'document' | 'structured'
    citations: list = field(default_factory=list)
