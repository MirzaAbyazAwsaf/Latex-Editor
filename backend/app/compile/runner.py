import os
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

from ..config import COMPILE_TIMEOUT_S, ENGINES
from ..files.paths import build_dir, src_dir
from .log_parser import parse_log

MIKTEX_BIN = Path(
    os.environ.get(
        "MIKTEX_BIN",
        r"C:\Users\Awsaf\AppData\Local\Programs\MiKTeX\miktex\bin\x64",
    )
)


@dataclass
class CompileOutcome:
    status: str  # ok | error | timeout
    duration_ms: int
    errors: list
    log_excerpt: str
    pdf_exists: bool


def _env() -> dict:
    env = dict(os.environ)
    env["PATH"] = f"{MIKTEX_BIN}{os.pathsep}{env.get('PATH', '')}"
    return env


def _engine_path(engine: str) -> str:
    name = ENGINES.get(engine, "pdflatex")
    candidate = MIKTEX_BIN / f"{name}.exe"
    return str(candidate) if candidate.exists() else name


def run_compile(project_id: int, engine: str, main_file: str) -> CompileOutcome:
    src = src_dir(project_id)
    out = build_dir(project_id)
    out.mkdir(parents=True, exist_ok=True)

    for stale in out.glob("*.pdf"):
        try:
            stale.unlink()
        except OSError:
            pass

    stem = Path(main_file).stem
    cmd = [
        _engine_path(engine),
        "-interaction=nonstopmode",
        "-no-shell-escape",
        f"-output-directory={out}",
        str(src / main_file),
    ]

    start = time.monotonic()
    log_text = ""
    returncode = 0
    timed_out = False

    try:
        for _ in range(2):  # second pass resolves refs/TOC
            proc = subprocess.run(
                cmd,
                cwd=str(src),
                env=_env(),
                capture_output=True,
                text=True,
                errors="replace",
                timeout=COMPILE_TIMEOUT_S,
            )
            returncode = proc.returncode
            log_file = out / f"{stem}.log"
            if log_file.exists():
                log_text = log_file.read_text(encoding="utf-8", errors="replace")
    except subprocess.TimeoutExpired:
        timed_out = True

    duration_ms = int((time.monotonic() - start) * 1000)
    pdf_path = out / f"{stem}.pdf"
    pdf_exists = pdf_path.exists() and pdf_path.stat().st_size > 0

    parsed = parse_log(log_text, main_file)
    errors = [
        {"file": e.file, "line": e.line, "message": e.message}
        for e in parsed.errors
    ]

    if timed_out:
        status = "timeout"
    elif pdf_exists:
        status = "ok"
    else:
        status = "error"
        if not errors:
            errors = [
                {
                    "file": main_file,
                    "line": None,
                    "message": "Compilation failed with no parseable error.",
                }
            ]

    return CompileOutcome(
        status=status,
        duration_ms=duration_ms,
        errors=errors,
        log_excerpt=log_text[-20000:],
        pdf_exists=pdf_exists,
    )
