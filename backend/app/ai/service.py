"""Provider router: dispatches AI calls to Ollama or an API-key cloud provider.

Ollama (local, free) is the default. Anthropic Claude and any OpenAI-compatible
endpoint can be opted in by storing a key in `data/settings.json` (gitignored).
"""

from ..config import load_settings, save_settings
from . import anthropic_client, ollama_client, openai_client
from .prompts import SYSTEM_PROMPT

_PROVIDERS = {
    "ollama": {
        "label": "Ollama (local)",
        "url_key": "ollama_url",
        "model_key": "ollama_model",
        "key_key": None,
    },
    "anthropic": {
        "label": "Anthropic Claude",
        "url_key": "anthropic_url",
        "model_key": "anthropic_model",
        "key_key": "anthropic_api_key",
    },
    "openai": {
        "label": "OpenAI-compatible",
        "url_key": "openai_url",
        "model_key": "openai_model",
        "key_key": "openai_api_key",
    },
}


def _active(settings: dict) -> tuple[str, dict]:
    provider = settings.get("provider")
    if provider not in _PROVIDERS:
        provider = "ollama"
    return provider, _PROVIDERS[provider]


def public_settings() -> dict:
    settings = load_settings()
    provider, meta = _active(settings)
    key_key = meta["key_key"]
    return {
        "provider": provider,
        "providers": [
            {"id": pid, "label": m["label"], "requires_key": m["key_key"] is not None}
            for pid, m in _PROVIDERS.items()
        ],
        "model": settings[meta["model_key"]],
        "url": settings[meta["url_key"]],
        "has_key": bool(settings[key_key]) if key_key else True,
    }


def update_settings(provider: str | None = None, model: str | None = None, url: str | None = None, api_key: str | None = None) -> dict:
    settings = load_settings()
    active = provider if provider in _PROVIDERS else settings.get("provider")
    meta = _PROVIDERS.get(active, _PROVIDERS["ollama"])

    updates: dict = {}
    if provider in _PROVIDERS:
        updates["provider"] = provider
    if model is not None and model.strip():
        updates[meta["model_key"]] = model.strip()
    if url is not None and url.strip():
        updates[meta["url_key"]] = url.strip()
    if api_key is not None and meta["key_key"]:
        updates[meta["key_key"]] = api_key.strip()

    if updates:
        save_settings(updates)
    return public_settings()


def default_model() -> str:
    settings = load_settings()
    _, meta = _active(settings)
    return settings[meta["model_key"]]


async def list_models() -> list[str]:
    settings = load_settings()
    provider, meta = _active(settings)
    if provider == "anthropic":
        return await anthropic_client.list_models(settings["anthropic_url"], settings["anthropic_api_key"])
    if provider == "openai":
        return await openai_client.list_models(settings["openai_url"], settings["openai_api_key"])
    return await ollama_client.list_models(settings["ollama_url"])


async def stream_chat(model: str, instruction: str, context: str):
    settings = load_settings()
    provider, meta = _active(settings)

    if provider == "anthropic":
        chosen = model or settings["anthropic_model"]
        gen = anthropic_client.stream_chat(
            settings["anthropic_url"], settings["anthropic_api_key"], chosen, SYSTEM_PROMPT, instruction, context
        )
    elif provider == "openai":
        chosen = model or settings["openai_model"]
        gen = openai_client.stream_chat(
            settings["openai_url"], settings["openai_api_key"], chosen, SYSTEM_PROMPT, instruction, context
        )
    else:
        chosen = model or settings["ollama_model"]
        gen = ollama_client.stream_chat(settings["ollama_url"], chosen, SYSTEM_PROMPT, instruction, context)

    async for event in gen:
        yield event
