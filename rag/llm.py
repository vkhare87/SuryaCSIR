import json
import re
import urllib.request

# Grounding sentinel: the model must reply exactly this when the supplied excerpts
# don't contain the answer. retrieval.traverse turns it into REFUSAL_TEXT.
NOT_FOUND = "NOT_FOUND"
REFUSAL_TEXT = "Not found in institute documents."

_SUMMARY_PROMPT = "Summarize the following document section in one sentence:\n\n"
_ROUTE_SYSTEM = (
    "You route questions for an institute data assistant. Reply with ONLY a JSON object, "
    'no prose: {"route": "structured" | "document" | "hybrid", "function": <name or null>, '
    '"params": {...}}. '
    "'structured' = answerable by one of the listed analytics functions (counts, sums, "
    "aggregates over database tables). 'document' = answerable from report/document text. "
    "'hybrid' = needs an analytics function AND supporting document context. "
    "For 'structured' or 'hybrid', 'function' must be one of the listed names and 'params' "
    "only its listed parameters. When unsure, use route 'document' with function null."
)
_PICK_PROMPT = (
    "Given a question and a numbered list of section titles, reply with the comma-separated "
    "indices of the sections most relevant to the question, or the word 'none' if no "
    "section is relevant.\n\nQuestion: "
)
_ANSWER_SYSTEM = (
    "You answer questions for institute staff using ONLY the provided document excerpts. "
    f"If the excerpts do not contain the answer, reply exactly {NOT_FOUND}. "
    "Never use outside knowledge."
)


def _route_user_prompt(question: str, catalog: dict) -> str:
    listing = "\n".join(f"- {name}: {desc}" for name, desc in catalog.items())
    return (
        f"Analytics functions:\n{listing}\n\n"
        'Examples:\n'
        'Q: How many documents are indexed?\n'
        'A: {"route": "structured", "function": "count_documents_by_status", "params": {}}\n'
        'Q: What did the 2025 annual report say about water research?\n'
        'A: {"route": "document", "function": null, "params": {}}\n'
        'Q: How many documents are indexed, and what do the reports say about delays?\n'
        'A: {"route": "hybrid", "function": "count_documents_by_status", "params": {}}\n\n'
        f"Question: {question}"
    )


class FakeLLM:
    """Deterministic, offline. Test hooks: questions starting 'COUNT'/'HOW MANY' route
    structured, 'HYBRID' routes hybrid — both to the catalog's first function; pick
    always returns [0]; answer echoes the context's first line or NOT_FOUND."""
    model = "fake"

    def summarize(self, text: str) -> str:
        first = text.strip().splitlines()[0] if text.strip() else ""
        return first[:80]

    def route(self, question: str, catalog: dict) -> str:
        q = question.strip().upper()
        fn = next(iter(catalog), None)
        if fn and q.startswith("HYBRID"):
            return json.dumps({"route": "hybrid", "function": fn, "params": {}})
        if fn and (q.startswith("COUNT") or q.startswith("HOW MANY")):
            return json.dumps({"route": "structured", "function": fn, "params": {}})
        return json.dumps({"route": "document", "function": None, "params": {}})

    def pick(self, question: str, titles: list) -> list:
        return [0] if titles else []

    def answer(self, question: str, context: str) -> str:
        if not context.strip():
            return NOT_FOUND
        return context.strip().splitlines()[0][:200]


class OpenLLMClient:
    def __init__(self, base_url: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model

    def _chat(self, content: str, system: str | None = None) -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": content})
        body = json.dumps({
            "model": self.model,
            "messages": messages,
            "temperature": 0.0,
        }).encode()
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=body, headers={"Content-Type": "application/json"},
        )
        # 300s: Ollama cold-loads the model on first request; CPU-only servers blow 60s.
        with urllib.request.urlopen(req, timeout=300) as r:
            data = json.load(r)
        return data["choices"][0]["message"]["content"].strip()

    def summarize(self, text: str) -> str:
        return self._chat(_SUMMARY_PROMPT + text[:4000])

    def route(self, question: str, catalog: dict) -> str:
        return self._chat(_route_user_prompt(question, catalog), system=_ROUTE_SYSTEM)

    def pick(self, question: str, titles: list) -> list:
        listing = "\n".join(f"{i}: {t}" for i, t in enumerate(titles))
        reply = self._chat(f"{_PICK_PROMPT}{question}\n\nSections:\n{listing}")
        # No digits (e.g. 'none') -> [] so traverse refuses instead of force-picking
        # section 0 — force-picking was the ungrounded path.
        idxs = [int(n) for n in re.findall(r"\d+", reply)]
        return [i for i in idxs if 0 <= i < len(titles)]

    def answer(self, question: str, context: str) -> str:
        return self._chat(
            f"Question: {question}\n\nDocument excerpts:\n{context[:8000]}",
            system=_ANSWER_SYSTEM,
        )


def make_llm(backend: str, base_url: str, model: str):
    if backend == "fake":
        return FakeLLM()
    if backend == "openllm":
        return OpenLLMClient(base_url, model)
    raise ValueError(f"Unknown LLM_BACKEND: {backend}")
