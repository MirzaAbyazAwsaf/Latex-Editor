from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "app.db"

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
