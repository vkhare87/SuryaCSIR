import json
import urllib.request

_PROMPT = "Summarize the following document section in one sentence:\n\n"


class FakeLLM:
    model = "fake"

    def summarize(self, text: str) -> str:
        first = text.strip().splitlines()[0] if text.strip() else ""
        return first[:80]


class OpenLLMClient:
    def __init__(self, base_url: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model

    def summarize(self, text: str) -> str:
        body = json.dumps({
            "model": self.model,
            "messages": [{"role": "user", "content": _PROMPT + text[:4000]}],
            "temperature": 0.0,
        }).encode()
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=body, headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.load(r)
        return data["choices"][0]["message"]["content"].strip()


def make_llm(backend: str, base_url: str, model: str):
    if backend == "fake":
        return FakeLLM()
    if backend == "openllm":
        return OpenLLMClient(base_url, model)
    raise ValueError(f"Unknown LLM_BACKEND: {backend}")
