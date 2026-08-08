from dataclasses import dataclass

# OPENLLM_BASE_URL / OPENLLM_MODEL are not required: LLM_PROVIDER can supply both
# from a preset, so a host switch is a provider name plus a key. llm.resolve_endpoint
# raises if neither route yields an endpoint.
REQUIRED = [
    "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "SUPABASE_ANON_KEY",
    "OCR_BACKEND", "LLM_BACKEND",
    "POLL_INTERVAL_S", "BATCH_SIZE",
]


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_service_key: str
    supabase_anon_key: str
    openllm_base_url: str
    openllm_model: str
    ocr_backend: str
    llm_backend: str
    poll_interval_s: int
    batch_size: int
    llm_provider: str = ""
    openllm_api_key: str = ""


def load_config(env: dict) -> Config:
    missing = [k for k in REQUIRED if not env.get(k)]
    if missing:
        raise ValueError(f"Missing required env: {', '.join(missing)}")
    return Config(
        supabase_url=env["SUPABASE_URL"],
        supabase_service_key=env["SUPABASE_SERVICE_KEY"],
        supabase_anon_key=env["SUPABASE_ANON_KEY"],
        openllm_base_url=env.get("OPENLLM_BASE_URL", ""),
        openllm_model=env.get("OPENLLM_MODEL", ""),
        llm_provider=env.get("LLM_PROVIDER", ""),
        openllm_api_key=env.get("OPENLLM_API_KEY", ""),
        ocr_backend=env["OCR_BACKEND"],
        llm_backend=env["LLM_BACKEND"],
        poll_interval_s=int(env["POLL_INTERVAL_S"]),
        batch_size=int(env["BATCH_SIZE"]),
    )
