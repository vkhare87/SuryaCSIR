from dataclasses import dataclass

REQUIRED = [
    "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENLLM_BASE_URL",
    "OPENLLM_MODEL", "OCR_BACKEND", "LLM_BACKEND",
    "POLL_INTERVAL_S", "BATCH_SIZE",
]


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_service_key: str
    openllm_base_url: str
    openllm_model: str
    ocr_backend: str
    llm_backend: str
    poll_interval_s: int
    batch_size: int


def load_config(env: dict) -> Config:
    missing = [k for k in REQUIRED if not env.get(k)]
    if missing:
        raise ValueError(f"Missing required env: {', '.join(missing)}")
    return Config(
        supabase_url=env["SUPABASE_URL"],
        supabase_service_key=env["SUPABASE_SERVICE_KEY"],
        openllm_base_url=env["OPENLLM_BASE_URL"],
        openllm_model=env["OPENLLM_MODEL"],
        ocr_backend=env["OCR_BACKEND"],
        llm_backend=env["LLM_BACKEND"],
        poll_interval_s=int(env["POLL_INTERVAL_S"]),
        batch_size=int(env["BATCH_SIZE"]),
    )
