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

OLLAMA_URL = "http://localhost:11434"
DEFAULT_AI_MODEL = "qwen2.5:7b-instruct-q4_K_M"
