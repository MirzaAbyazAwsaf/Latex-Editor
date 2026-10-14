from pathlib import Path

import json

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "app.db"
SETTINGS_PATH = DATA_DIR / "settings.json"

PDFLATEX_BIN = "pdflatex"
XELATEX_BIN = "xelatex"
LUALATEX_BIN = "lualatex"
ENGINES = {
    "pdflatex": PDFLATEX_BIN,
    "xelatex": XELATEX_BIN,
    "lualatex": LUALATEX_BIN,
}

COMPILE_TIMEOUT_S = 30
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".bmp", ".webp"}
ASSET_EXTS = IMAGE_EXTS | {".pdf", ".eps"}
UPLOAD_EXTS = ASSET_EXTS | {
    ".tex",
    ".bib",
    ".sty",
    ".cls",
    ".txt",
    ".csv",
    ".md",
    ".json",
}

MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".eps": "application/postscript",
}

OLLAMA_URL = "http://localhost:11434"
DEFAULT_AI_MODEL = "qwen2.5:7b-instruct-q4_K_M"

# AI providers. Ollama is local/free by default; a cloud provider can be opted in
# with an API key. Keys are stored locally in data/settings.json (gitignored) and
# never returned to the client in full.
AI_PROVIDERS = ("ollama", "anthropic", "openai")

DEFAULT_SETTINGS = {
    "provider": "ollama",
    "ollama_url": OLLAMA_URL,
    "ollama_model": DEFAULT_AI_MODEL,
    "anthropic_url": "https://api.anthropic.com/v1",
    "anthropic_model": "claude-sonnet-4-5",
    "anthropic_api_key": "",
    "openai_url": "https://api.openai.com/v1",
    "openai_model": "gpt-4o-mini",
    "openai_api_key": "",
}

_SECRET_FIELDS = ("anthropic_api_key", "openai_api_key")


def load_settings() -> dict:
    data = dict(DEFAULT_SETTINGS)
    try:
        if SETTINGS_PATH.exists():
            stored = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
            if isinstance(stored, dict):
                data.update({k: v for k, v in stored.items() if k in DEFAULT_SETTINGS})
    except Exception:
        pass
    return data


def save_settings(updates: dict) -> dict:
    data = load_settings()
    for key, value in updates.items():
        if key in DEFAULT_SETTINGS and value is not None:
            data[key] = value
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data

