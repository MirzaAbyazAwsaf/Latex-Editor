"""Thin wrapper around the MiKTeX/TeX Live ``synctex`` command-line tool.

Forward search: source (file, line) -> PDF (page, x, y).
Inverse search: PDF (page, x, y) -> source (file, line).

Coordinates are in PDF points (72 dpi) with the origin at the top-left of the
page and y growing downwards, which is what PDF.js viewport pixels divided by
the render scale produce.
"""

import os
import subprocess
from pathlib import Path

from ..files.paths import build_dir, src_dir

MIKTEX_BIN = Path(
    os.environ.get(
        "MIKTEX_BIN",
        r"C:\Users\Awsaf\AppData\Local\Programs\MiKTeX\miktex\bin\x64",
    )
)
SYNCTEX_TIMEOUT_S = 10


def _bin() -> str:
    candidate = MIKTEX_BIN / "synctex.exe"
    return str(candidate) if candidate.exists() else "synctex"


def _env() -> dict:
    env = dict(os.environ)
    env["PATH"] = f"{MIKTEX_BIN}{os.pathsep}{env.get('PATH', '')}"
    return env


def _run(args: list[str], cwd: Path) -> dict:
    try:
        proc = subprocess.run(
            [_bin(), *args],
            cwd=str(cwd),
            env=_env(),
            capture_output=True,
            text=True,
            errors="replace",
            timeout=SYNCTEX_TIMEOUT_S,
        )
    except (subprocess.TimeoutExpired, OSError):
        return {}
    out: dict[str, str] = {}
    for line in proc.stdout.splitlines():
        line = line.strip()
        if ":" in line and not line.startswith(("This is", "SyncTeX result")):
            key, _, value = line.partition(":")
            out.setdefault(key.strip(), value.strip())
    return out


def _synctex_exists(project_id: int, main_file: str) -> bool:
    return (build_dir(project_id) / f"{Path(main_file).stem}.synctex.gz").exists()


def _normalize_input(raw: str, project_id: int) -> str:
    """Map a synctex input path back to a project-relative POSIX path."""
    if not raw:
        return ""
    p = raw.replace("\\", "/").lstrip("./")
    src = src_dir(project_id).resolve()
    try:
        abs_p = Path(raw).resolve() if Path(raw).is_absolute() else (src / raw).resolve()
        if abs_p.is_relative_to(src):
            return abs_p.relative_to(src).as_posix()
    except (OSError, ValueError):
        pass
    return p


def _pdf_path(project_id: int, main_file: str) -> Path:
    return build_dir(project_id) / f"{Path(main_file).stem}.pdf"


def forward(project_id: int, main_file: str, src_file: str, line: int, column: int = 0) -> dict | None:
    if not _synctex_exists(project_id, main_file):
        return None
    abs_src = src_dir(project_id) / src_file
    out = _run(
        ["view", "-i", f"{line}:{column}:{abs_src}", "-o", str(_pdf_path(project_id, main_file))],
        cwd=src_dir(project_id),
    )
    if not out.get("Page"):
        return None
    try:
        return {
            "page": int(out["Page"]),
            "x": float(out.get("x", out.get("h", 0))),
            "y": float(out.get("y", out.get("v", 0))),
            "width": float(out.get("W", 0)),
            "height": float(out.get("H", 0)),
        }
    except ValueError:
        return None


def inverse(project_id: int, main_file: str, page: int, x: float, y: float) -> dict | None:
    if not _synctex_exists(project_id, main_file):
        return None
    out = _run(
        ["edit", "-o", f"{page}:{x}:{y}:{_pdf_path(project_id, main_file)}"],
        cwd=src_dir(project_id),
    )
    if not out.get("Line"):
        return None
    try:
        line = int(out["Line"])
    except ValueError:
        return None
    return {"file": _normalize_input(out.get("Input", ""), project_id), "line": line}

