import json
import re
import urllib.request

_SUMMARY_PROMPT = "Summarize the following document section in one sentence:\n\n"
_CLASSIFY_PROMPT = (
    "Classify this question as 'structured' (a count/aggregate answerable from database "
    "tables) or 'document' (answerable from document text). Reply with one word.\n\nQuestion: "
)
_PICK_PROMPT = (
    "Given a question and a numbered list of section titles, reply with the comma-separated "
    "indices of the sections most relevant to the question.\n\nQuestion: "
)


class FakeLLM:
    """Deterministic, offline. Test hooks: questions starting 'COUNT' classify structured;
    pick always returns [0]."""
    model = "fake"

    def summarize(self, text: str) -> str:
        first = text.strip().splitlines()[0] if text.strip() else ""
        return first[:80]

    def classify(self, question: str) -> str:
        return "structured" if question.strip().upper().startswith("COUNT") else "document"

    def pick(self, question: str, titles: list) -> list:
        return [0] if titles else []


class OpenLLMClient:
    def __init__(self, base_url: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model

    def _chat(self, content: str) -> str:
        body = json.dumps({
            "model": self.model,
            "messages": [{"role": "user", "content": content}],
            "temperature": 0.0,
        }).encode()
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=body, headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.load(r)
        return data["choices"][0]["message"]["content"].strip()

    def summarize(self, text: str) -> str:
        return self._chat(_SUMMARY_PROMPT + text[:4000])

    def classify(self, question: str) -> str:
        return self._chat(_CLASSIFY_PROMPT + question)

    def pick(self, question: str, titles: list) -> list:
        listing = "\n".join(f"{i}: {t}" for i, t in enumerate(titles))
        reply = self._chat(f"{_PICK_PROMPT}{question}\n\nSections:\n{listing}")
        idxs = [int(n) for n in re.findall(r"\d+", reply)]
        return [i for i in idxs if 0 <= i < len(titles)] or ([0] if titles else [])


def make_llm(backend: str, base_url: str, model: str):
    if backend == "fake":
        return FakeLLM()
    if backend == "openllm":
        return OpenLLMClient(base_url, model)
    raise ValueError(f"Unknown LLM_BACKEND: {backend}")
