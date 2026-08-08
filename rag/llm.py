import json
import os
import re
import urllib.request

# Grounding sentinel: the model must reply exactly this when the supplied excerpts
# don't contain the answer. retrieval.traverse turns it into REFUSAL_TEXT.
NOT_FOUND = "NOT_FOUND"
REFUSAL_TEXT = "Not found in institute documents."

# Per-stage latency budget (P9). Route fails fast into the document fallback;
# summarize keeps the long budget because Ollama cold-loads the model on the
# worker's first request and CPU-only servers blow 60s.
ROUTE_TIMEOUT_S = int(os.environ.get("RAG_ROUTE_TIMEOUT_S", "10"))
PICK_TIMEOUT_S = int(os.environ.get("RAG_PICK_TIMEOUT_S", "20"))
ANSWER_TIMEOUT_S = int(os.environ.get("RAG_ANSWER_TIMEOUT_S", "60"))
SUMMARIZE_TIMEOUT_S = int(os.environ.get("RAG_SUMMARIZE_TIMEOUT_S", "300"))
MAP_COLUMNS_TIMEOUT_S = int(os.environ.get("RAG_MAP_COLUMNS_TIMEOUT_S", "20"))

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
_MAP_COLUMNS_SYSTEM = (
    "You map spreadsheet column headers to a fixed target schema for an institute HR "
    'database import. Reply with ONLY a JSON object, no prose: {"mapping": '
    '{"<raw header>": "<target column or null>", ...}}. Map a raw header to a target '
    "column only if it is a plausible semantic match — a header with no good match maps "
    "to null. Never invent a target column that is not in the given list. Each target "
    "column should be used by at most one raw header."
)


def _map_columns_prompt(raw_headers: list, target_fields: list) -> str:
    fields_listing = "\n".join(f"- {f['column']}: {f['label']}" for f in target_fields)
    headers_listing = "\n".join(f"- {h}" for h in raw_headers)
    return f"Target schema columns:\n{fields_listing}\n\nRaw headers to map:\n{headers_listing}"


def _route_user_prompt(question: str, catalog: dict, examples=None) -> str:
    listing = "\n".join(f"- {name}: {desc}" for name, desc in catalog.items())
    extra = "".join(
        f"Q: {e['question']}\n"
        f'A: {{"route": "{e["correct_route"]}", "function": null, "params": {{}}}}\n'
        for e in (examples or [])
    )
    return (
        f"Analytics functions:\n{listing}\n\n"
        'Examples:\n'
        'Q: How many documents are indexed?\n'
        'A: {"route": "structured", "function": "count_documents_by_status", "params": {}}\n'
        'Q: What did the 2025 annual report say about water research?\n'
        'A: {"route": "document", "function": null, "params": {}}\n'
        'Q: How many documents are indexed, and what do the reports say about delays?\n'
        'A: {"route": "hybrid", "function": "count_documents_by_status", "params": {}}\n'
        f"{extra}\n"
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

    def route(self, question: str, catalog: dict, examples=None) -> str:
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

    def answer_stream(self, question: str, context: str):
        text = self.answer(question, context)
        mid = max(1, len(text) // 2)
        yield text[:mid]
        yield text[mid:]

    def map_columns(self, raw_headers: list, target_fields: list) -> str:
        """Deterministic, offline: case-insensitive exact match against each
        target's column name or label. Crude but genuinely useful as an
        offline fallback (LLM_BACKEND=fake) when no real model is deployed —
        not just a test double."""
        mapping = {}
        for h in raw_headers:
            norm = h.strip().lower()
            match = next(
                (f["column"] for f in target_fields
                 if norm == f["column"].lower() or norm == f["label"].lower()),
                None,
            )
            mapping[h] = match
        return json.dumps({"mapping": mapping})


class OpenLLMClient:
    """Any OpenAI-compatible /chat/completions endpoint: the locally hosted model
    (Ollama, no key) or a hosted API (set OPENLLM_API_KEY for the bearer header)."""

    def __init__(self, base_url: str, model: str, api_key: str = ""):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key or os.environ.get("OPENLLM_API_KEY", "")

    def _request(self, content: str, system: str | None, stream: bool = False):
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": content})
        payload = {"model": self.model, "messages": messages, "temperature": 0.0}
        if stream:
            payload["stream"] = True
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(payload).encode(),
            headers=headers,
        )

    def _chat(self, content: str, system: str | None = None,
              timeout: int = SUMMARIZE_TIMEOUT_S) -> str:
        req = self._request(content, system)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.load(r)
        return data["choices"][0]["message"]["content"].strip()

    def summarize(self, text: str) -> str:
        return self._chat(_SUMMARY_PROMPT + text[:4000], timeout=SUMMARIZE_TIMEOUT_S)

    def route(self, question: str, catalog: dict, examples=None) -> str:
        return self._chat(_route_user_prompt(question, catalog, examples),
                          system=_ROUTE_SYSTEM, timeout=ROUTE_TIMEOUT_S)

    def pick(self, question: str, titles: list) -> list:
        listing = "\n".join(f"{i}: {t}" for i, t in enumerate(titles))
        reply = self._chat(f"{_PICK_PROMPT}{question}\n\nSections:\n{listing}",
                           timeout=PICK_TIMEOUT_S)
        # No digits (e.g. 'none') -> [] so traverse refuses instead of force-picking
        # section 0 — force-picking was the ungrounded path.
        idxs = [int(n) for n in re.findall(r"\d+", reply)]
        return [i for i in idxs if 0 <= i < len(titles)]

    def answer(self, question: str, context: str) -> str:
        return self._chat(
            f"Question: {question}\n\nDocument excerpts:\n{context[:8000]}",
            system=_ANSWER_SYSTEM, timeout=ANSWER_TIMEOUT_S,
        )

    def answer_stream(self, question: str, context: str):
        """Yield answer text chunks as the model produces them (SSE deltas)."""
        req = self._request(
            f"Question: {question}\n\nDocument excerpts:\n{context[:8000]}",
            system=_ANSWER_SYSTEM, stream=True,
        )
        with urllib.request.urlopen(req, timeout=ANSWER_TIMEOUT_S) as r:
            for raw in r:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                data = line[len("data:"):].strip()
                if data == "[DONE]":
                    break
                try:
                    delta = json.loads(data)["choices"][0]["delta"].get("content", "")
                except (ValueError, KeyError, IndexError):
                    continue
                if delta:
                    yield delta

    def map_columns(self, raw_headers: list, target_fields: list) -> str:
        return self._chat(
            _map_columns_prompt(raw_headers, target_fields),
            system=_MAP_COLUMNS_SYSTEM, timeout=MAP_COLUMNS_TIMEOUT_S,
        )


# Presets for the OpenAI-compatible endpoints this project has actually been run
# against, so moving between them is a provider name plus a key rather than a set
# of URLs to look up. Any other provider still works — set OPENLLM_BASE_URL and
# OPENLLM_MODEL explicitly and leave LLM_PROVIDER unset.
PROVIDERS = {
    "ollama": {"base_url": "http://localhost:11434/v1", "model": "qwen3-vl:8b"},
    "deepseek": {"base_url": "https://api.deepseek.com/v1", "model": "deepseek-v4-flash"},
}


def resolve_endpoint(provider: str = "", base_url: str = "", model: str = ""):
    """(base_url, model) for a provider preset, with explicit values winning.

    Model ids drift; if a provider rejects the preset one, set OPENLLM_MODEL."""
    key = (provider or "").strip().lower()
    if key and key not in PROVIDERS:
        raise ValueError(
            f"Unknown LLM_PROVIDER: {provider}. Known: {', '.join(sorted(PROVIDERS))}. "
            "For any other provider set OPENLLM_BASE_URL and OPENLLM_MODEL instead.")
    preset = PROVIDERS.get(key, {})
    resolved_url = base_url or preset.get("base_url", "")
    resolved_model = model or preset.get("model", "")
    if not resolved_url or not resolved_model:
        raise ValueError(
            "No model endpoint configured: set LLM_PROVIDER "
            f"({', '.join(sorted(PROVIDERS))}) or both OPENLLM_BASE_URL and OPENLLM_MODEL.")
    return resolved_url, resolved_model


def make_llm(backend: str, base_url: str = "", model: str = "",
             provider: str = "", api_key: str = ""):
    if backend == "fake":
        return FakeLLM()
    if backend == "openllm":
        url, name = resolve_endpoint(provider, base_url, model)
        return OpenLLMClient(url, name, api_key)
    raise ValueError(f"Unknown LLM_BACKEND: {backend}")
