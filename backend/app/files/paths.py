import re
from pathlib import Path

from ..config import DATA_DIR

SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9._ -]+$")
DISALLOWED_EXT = {".exe", ".bat", ".cmd", ".sh", ".ps1", ".dll", ".com", ".scr"}


class PathValidationError(ValueError):
    pass


def project_dir(project_id: int) -> Path:
    return DATA_DIR / "users" / "1" / "projects" / str(project_id)


def src_dir(project_id: int) -> Path:
    return project_dir(project_id) / "src"


def build_dir(project_id: int) -> Path:
    return project_dir(project_id) / "build"


def validate_relative_path(rel: str) -> str:
    if not rel or len(rel) > 255:
        raise PathValidationError("invalid path")
    rel = rel.replace("\\", "/").strip("/")
    if rel.startswith("/") or re.match(r"^[A-Za-z]:", rel):
        raise PathValidationError("absolute paths not allowed")
    if ".." in rel.split("/"):
        raise PathValidationError("path traversal not allowed")
    parts = rel.split("/")
    for part in parts:
        if not SAFE_SEGMENT.match(part):
            raise PathValidationError(f"invalid character in path: {part}")
    if Path(rel).suffix.lower() in DISALLOWED_EXT:
        raise PathValidationError("file type not allowed")
    return rel


def resolve_in_src(project_id: int, rel: str) -> Path:
    rel = validate_relative_path(rel)
    src = src_dir(project_id).resolve()
    target = (src / rel).resolve()
    if src not in target.parents and target != src:
        raise PathValidationError("path escapes project directory")
    return target
