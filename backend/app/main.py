import io
import json
import re
import shutil
import time
import zipfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from .ai import service as ai_service
from .compile.runner import run_compile
from .config import (
    ASSET_EXTS,
    ENGINES,
    IMAGE_EXTS,
    MAX_FILE_BYTES,
    MAX_UPLOAD_BYTES,
    MEDIA_TYPES,
    UPLOAD_EXTS,
)
from .db import connect, init_db
from .files.paths import (
    PathValidationError,
    build_dir,
    resolve_in_src,
    src_dir,
    trash_dir,
    validate_relative_path,
)

app = FastAPI(title="Local LaTeX Editor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_TEX = r"""\documentclass{article}
\usepackage[utf8]{inputenc}

\title{Untitled Document}
\author{}
\date{}

\begin{document}
\maketitle

\section{Introduction}
Start writing here.

\end{document}
"""


class ProjectOut(BaseModel):
    id: int
    name: str
    main_file: str
    engine: str


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class ProjectPatch(BaseModel):
    name: str | None = None
    engine: str | None = None
    main_file: str | None = None


class FilePut(BaseModel):
    content: str


class PathBody(BaseModel):
    path: str = Field(min_length=1, max_length=255)


class RenameBody(BaseModel):
    from_path: str = Field(min_length=1, max_length=255)
    to_path: str = Field(min_length=1, max_length=255)


def build_tree(base: Path, rel: str = "") -> list[dict]:
    current = base / rel if rel else base
    if not current.exists():
        return []
    nodes: list[dict] = []
    for entry in sorted(current.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
        if entry.name.startswith("."):
            continue
        child_rel = f"{rel}/{entry.name}" if rel else entry.name
        if entry.is_dir():
            nodes.append(
                {
                    "name": entry.name,
                    "path": child_rel,
                    "kind": "folder",
                    "children": build_tree(base, child_rel),
                }
            )
        else:
            nodes.append(
                {
                    "name": entry.name,
                    "path": child_rel,
                    "kind": "file",
                    "size": entry.stat().st_size,
                }
            )
    return nodes


def _unique_trash_name(trash: Path, name: str) -> str:
    base = f"{int(time.time() * 1000)}_{name}"
    candidate = base
    counter = 1
    while (trash / candidate).exists():
        candidate = f"{base}_{counter}"
        counter += 1
    return candidate


def _reindex_path(con, project_id: int, target: Path, src: Path) -> None:
    files = [target] if target.is_file() else [p for p in target.rglob("*") if p.is_file()]
    for f in files:
        rel = f.relative_to(src).as_posix()
        con.execute(
            """INSERT INTO files (project_id, path, kind, size)
               VALUES (?,?,?,?)
               ON CONFLICT(project_id, path)
               DO UPDATE SET size=excluded.size, updated_at=CURRENT_TIMESTAMP""",
            (project_id, rel, "tex" if rel.endswith(".tex") else "other", f.stat().st_size),
        )


def _safe_upload_name(name: str) -> str:
    name = Path(name or "").name.strip()
    cleaned = re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip(". ")
    return cleaned or "image"


def _unique_in_src(target: Path) -> Path:
    if not target.exists():
        return target
    stem, suffix = target.stem, target.suffix
    counter = 1
    while True:
        candidate = target.with_name(f"{stem}-{counter}{suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


def _free_restore_path(project_id: int, original_path: str) -> Path:
    src = src_dir(project_id)
    try:
        dst = resolve_in_src(project_id, original_path)
    except PathValidationError:
        dst = src / Path(original_path).name
    if not dst.exists():
        return dst
    stem, suffix = dst.stem, dst.suffix
    counter = 1
    while True:
        candidate = dst.with_name(f"{stem} (restored {counter}){suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


class AiRequest(BaseModel):
    instruction: str = Field(min_length=1)
    context: str = ""
    model: str = ""


class AiSettingsIn(BaseModel):
    provider: str | None = None
    model: str | None = None
    url: str | None = None
    api_key: str | None = None


@app.on_event("startup")
def startup() -> None:
    init_db()


# ---------- projects ----------

@app.get("/api/projects", response_model=list[ProjectOut])
def list_projects():
    with connect() as con:
        rows = con.execute("SELECT * FROM projects ORDER BY id").fetchall()
        return [dict(r) for r in rows]


@app.post("/api/projects", response_model=ProjectOut)
def create_project(body: ProjectCreate):
    with connect() as con:
        cur = con.execute(
            "INSERT INTO projects (name) VALUES (?)", (body.name,)
        )
        project_id = cur.lastrowid
    src = src_dir(project_id)
    src.mkdir(parents=True, exist_ok=True)
    (src / "main.tex").write_text(DEFAULT_TEX, encoding="utf-8")
    with connect() as con:
        con.execute(
            "INSERT INTO files (project_id, path, kind, size) VALUES (?,?,?,?)",
            (project_id, "main.tex", "tex", len(DEFAULT_TEX)),
        )
        row = con.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    return dict(row)


@app.get("/api/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: int):
    with connect() as con:
        row = con.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    if not row:
        raise HTTPException(404, "project not found")
    return dict(row)


@app.patch("/api/projects/{project_id}", response_model=ProjectOut)
def patch_project(project_id: int, body: ProjectPatch):
    sets, vals = [], []
    if body.name is not None:
        sets.append("name=?")
        vals.append(body.name)
    if body.engine is not None:
        if body.engine not in ENGINES:
            raise HTTPException(400, f"unknown engine: {body.engine}")
        sets.append("engine=?")
        vals.append(body.engine)
    if body.main_file is not None:
        try:
            resolve_in_src(project_id, body.main_file)
        except PathValidationError as e:
            raise HTTPException(400, str(e))
        sets.append("main_file=?")
        vals.append(body.main_file)
    if not sets:
        raise HTTPException(400, "nothing to update")
    vals.append(project_id)
    with connect() as con:
        cur = con.execute(
            f"UPDATE projects SET {', '.join(sets)}, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            vals,
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "project not found")
        row = con.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    return dict(row)


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int):
    with connect() as con:
        cur = con.execute("DELETE FROM projects WHERE id=?", (project_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "project not found")

    pdir = src_dir(project_id).parent
    if pdir.exists():
        shutil.rmtree(pdir, ignore_errors=True)
    return {"ok": True}


# ---------- files ----------

@app.get("/api/projects/{project_id}/files")
def list_files(project_id: int):
    with connect() as con:
        rows = con.execute(
            "SELECT path, kind, size, updated_at FROM files WHERE project_id=? ORDER BY path",
            (project_id,),
        ).fetchall()
        return [dict(r) for r in rows]


@app.get("/api/projects/{project_id}/files/content")
def read_file(project_id: int, path: str = "main.tex"):
    try:
        target = resolve_in_src(project_id, path)
    except PathValidationError as e:
        raise HTTPException(400, str(e))
    if not target.exists():
        raise HTTPException(404, "file not found")
    return {"path": path, "content": target.read_text(encoding="utf-8", errors="replace")}


@app.put("/api/projects/{project_id}/files/content")
def write_file(project_id: int, body: FilePut, path: str = "main.tex"):
    if len(body.content.encode("utf-8")) > MAX_FILE_BYTES:
        raise HTTPException(413, "file too large")
    try:
        target = resolve_in_src(project_id, path)
    except PathValidationError as e:
        raise HTTPException(400, str(e))
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".tmp")
    tmp.write_text(body.content, encoding="utf-8")
    tmp.replace(target)

    size = len(body.content.encode("utf-8"))
    with connect() as con:
        con.execute(
            """INSERT INTO files (project_id, path, kind, size)
               VALUES (?,?,?,?)
               ON CONFLICT(project_id, path)
               DO UPDATE SET size=excluded.size, updated_at=CURRENT_TIMESTAMP""",
            (project_id, path, "tex" if path.endswith(".tex") else "other", size),
        )
        con.execute(
            "UPDATE projects SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (project_id,)
        )
    return {"ok": True, "size": size}


@app.get("/api/projects/{project_id}/tree")
def get_tree(project_id: int):
    return build_tree(src_dir(project_id))


@app.post("/api/projects/{project_id}/upload")
async def upload_asset(project_id: int, file: UploadFile = File(...), dir: str = Form("")):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in UPLOAD_EXTS:
        raise HTTPException(400, f"unsupported file type: {ext or 'unknown'}")

    folder = (dir or "").replace("\\", "/").strip("/")
    name = _safe_upload_name(file.filename)
    rel = f"{folder}/{name}" if folder else name
    try:
        target = _unique_in_src(resolve_in_src(project_id, rel))
    except PathValidationError as e:
        raise HTTPException(400, str(e))

    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.parent / (target.name + ".part")
    size = 0
    try:
        with tmp.open("wb") as fh:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "file too large")
                fh.write(chunk)
    except HTTPException:
        tmp.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
    tmp.replace(target)

    src = src_dir(project_id).resolve()
    relpath = target.relative_to(src).as_posix()
    if ext in IMAGE_EXTS:
        kind = "image"
    elif ext == ".tex":
        kind = "tex"
    elif ext == ".bib":
        kind = "bib"
    else:
        kind = "other"
    with connect() as con:
        con.execute(
            """INSERT INTO files (project_id, path, kind, size)
               VALUES (?,?,?,?)
               ON CONFLICT(project_id, path)
               DO UPDATE SET size=excluded.size, updated_at=CURRENT_TIMESTAMP""",
            (project_id, relpath, kind, size),
        )
        con.execute("UPDATE projects SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (project_id,))
    return {"ok": True, "path": relpath, "size": size}


@app.get("/api/projects/{project_id}/raw")
def raw_asset(project_id: int, path: str):
    try:
        target = resolve_in_src(project_id, path)
    except PathValidationError as e:
        raise HTTPException(400, str(e))
    if not target.exists() or not target.is_file():
        raise HTTPException(404, "not found")
    ext = target.suffix.lower()
    if ext not in ASSET_EXTS:
        raise HTTPException(415, "not a viewable asset")
    return FileResponse(target, media_type=MEDIA_TYPES.get(ext, "application/octet-stream"))


@app.post("/api/projects/{project_id}/files")
def create_file(project_id: int, body: PathBody):
    try:
        target = resolve_in_src(project_id, body.path)
    except PathValidationError as e:
        raise HTTPException(400, str(e))
    if target.exists():
        raise HTTPException(409, "already exists")
    target.parent.mkdir(parents=True, exist_ok=True)
    content = ""
    target.write_text(content, encoding="utf-8")
    size = len(content.encode("utf-8"))
    with connect() as con:
        con.execute(
            """INSERT INTO files (project_id, path, kind, size)
               VALUES (?,?,?,?)
               ON CONFLICT(project_id, path)
               DO UPDATE SET size=excluded.size, updated_at=CURRENT_TIMESTAMP""",
            (project_id, body.path, "tex" if body.path.endswith(".tex") else "other", size),
        )
        con.execute(
            "UPDATE projects SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (project_id,)
        )
    return {"ok": True, "path": body.path}


@app.post("/api/projects/{project_id}/folders")
def create_folder(project_id: int, body: PathBody):
    try:
        target = resolve_in_src(project_id, body.path)
    except PathValidationError as e:
        raise HTTPException(400, str(e))
    if target.exists():
        raise HTTPException(409, "already exists")
    target.mkdir(parents=True, exist_ok=True)
    return {"ok": True, "path": body.path}


@app.patch("/api/projects/{project_id}/files")
def rename_entry(project_id: int, body: RenameBody):
    try:
        src = resolve_in_src(project_id, body.from_path)
        dst = resolve_in_src(project_id, body.to_path)
    except PathValidationError as e:
        raise HTTPException(400, str(e))
    if not src.exists():
        raise HTTPException(404, "not found")
    if dst.exists():
        raise HTTPException(409, "target already exists")
    dst.parent.mkdir(parents=True, exist_ok=True)
    src.rename(dst)
    prefix = body.from_path + "/"
    with connect() as con:
        rows = con.execute(
            "SELECT id, path FROM files WHERE project_id=?", (project_id,)
        ).fetchall()
        for row in rows:
            p = row["path"]
            if p == body.from_path:
                newp = body.to_path
            elif p.startswith(prefix):
                newp = body.to_path + p[len(body.from_path):]
            else:
                continue
            con.execute("UPDATE files SET path=? WHERE id=?", (newp, row["id"]))
        con.execute(
            "UPDATE projects SET main_file=? WHERE id=? AND main_file=?",
            (body.to_path, project_id, body.from_path),
        )
        con.execute(
            "UPDATE projects SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (project_id,)
        )
    return {"ok": True, "path": body.to_path}


@app.delete("/api/projects/{project_id}/files")
def delete_entry(project_id: int, path: str):
    try:
        target = resolve_in_src(project_id, path)
    except PathValidationError as e:
        raise HTTPException(400, str(e))
    if not target.exists():
        raise HTTPException(404, "not found")

    trash = trash_dir(project_id)
    trash.mkdir(parents=True, exist_ok=True)
    stored_name = _unique_trash_name(trash, target.name)
    shutil.move(str(target), str(trash / stored_name))

    is_folder = (trash / stored_name).is_dir()
    kind = "folder" if is_folder else "file"
    size = 0 if is_folder else (trash / stored_name).stat().st_size
    prefix = path + "/"
    with connect() as con:
        con.execute(
            "DELETE FROM files WHERE project_id=? AND (path=? OR path LIKE ?)",
            (project_id, path, prefix),
        )
        con.execute(
            "INSERT INTO trash (project_id, original_path, stored_name, kind, size) VALUES (?,?,?,?,?)",
            (project_id, path, stored_name, kind, size),
        )
        proj = con.execute("SELECT main_file FROM projects WHERE id=?", (project_id,)).fetchone()
        if proj and (proj["main_file"] == path or proj["main_file"].startswith(prefix)):
            nxt = con.execute(
                "SELECT path FROM files WHERE project_id=? AND path LIKE '%.tex' ORDER BY path LIMIT 1",
                (project_id,),
            ).fetchone()
            con.execute(
                "UPDATE projects SET main_file=? WHERE id=?",
                (nxt["path"] if nxt else "main.tex", project_id),
            )
        con.execute("UPDATE projects SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (project_id,))
    return {"ok": True}


# ---------- recycle bin ----------

@app.get("/api/projects/{project_id}/trash")
def list_trash(project_id: int):
    with connect() as con:
        rows = con.execute(
            "SELECT id, original_path, kind, size, deleted_at FROM trash WHERE project_id=? ORDER BY deleted_at DESC, id DESC",
            (project_id,),
        ).fetchall()
        return [dict(r) for r in rows]


@app.post("/api/projects/{project_id}/trash/{trash_id}/restore")
def restore_trash(project_id: int, trash_id: int):
    with connect() as con:
        row = con.execute(
            "SELECT * FROM trash WHERE id=? AND project_id=?", (trash_id, project_id)
        ).fetchone()
    if not row:
        raise HTTPException(404, "trash item not found")

    stored = trash_dir(project_id) / row["stored_name"]
    if not stored.exists():
        raise HTTPException(410, "backing files are missing")

    dst = _free_restore_path(project_id, row["original_path"])
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(stored), str(dst))

    src = src_dir(project_id).resolve()
    with connect() as con:
        _reindex_path(con, project_id, dst, src)
        con.execute("DELETE FROM trash WHERE id=?", (trash_id,))
        con.execute("UPDATE projects SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (project_id,))
    return {"ok": True, "path": dst.relative_to(src).as_posix()}


@app.delete("/api/projects/{project_id}/trash/{trash_id}")
def purge_trash(project_id: int, trash_id: int):
    with connect() as con:
        row = con.execute(
            "SELECT * FROM trash WHERE id=? AND project_id=?", (trash_id, project_id)
        ).fetchone()
        if not row:
            raise HTTPException(404, "trash item not found")
        con.execute("DELETE FROM trash WHERE id=?", (trash_id,))

    stored = trash_dir(project_id) / row["stored_name"]
    if stored.is_dir():
        shutil.rmtree(stored, ignore_errors=True)
    elif stored.exists():
        stored.unlink()
    return {"ok": True}


@app.post("/api/projects/{project_id}/trash/empty")
def empty_trash(project_id: int):
    with connect() as con:
        con.execute("DELETE FROM trash WHERE project_id=?", (project_id,))
    tdir = trash_dir(project_id)
    if tdir.exists():
        shutil.rmtree(tdir, ignore_errors=True)
    return {"ok": True}


# ---------- compile ----------

@app.post("/api/projects/{project_id}/compile")
def compile_project(project_id: int):
    with connect() as con:
        proj = con.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    if not proj:
        raise HTTPException(404, "project not found")

    outcome = run_compile(project_id, proj["engine"], proj["main_file"])

    with connect() as con:
        con.execute(
            "INSERT INTO compile_runs (project_id, status, log_excerpt, duration_ms) VALUES (?,?,?,?)",
            (project_id, outcome.status, outcome.log_excerpt, outcome.duration_ms),
        )

    return {
        "status": outcome.status,
        "duration_ms": outcome.duration_ms,
        "errors": outcome.errors,
        "pdf_url": f"/api/projects/{project_id}/pdf" if outcome.pdf_exists else None,
    }


@app.get("/api/projects/{project_id}/pdf")
def get_pdf(project_id: int, _t: int | None = None):
    pdfs = sorted(build_dir(project_id).glob("*.pdf"), key=lambda p: p.stat().st_mtime)
    if not pdfs:
        raise HTTPException(404, "no PDF yet")
    return FileResponse(pdfs[-1], media_type="application/pdf")


@app.get("/api/projects/{project_id}/log")
def get_log(project_id: int):
    logs = sorted(build_dir(project_id).glob("*.log"), key=lambda p: p.stat().st_mtime)
    if not logs:
        raise HTTPException(404, "no log yet")
    return {"log": logs[-1].read_text(encoding="utf-8", errors="replace")}


@app.get("/api/projects/{project_id}/export.zip")
def export_zip(project_id: int):
    with connect() as con:
        proj = con.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    if not proj:
        raise HTTPException(404, "project not found")
    src = src_dir(project_id)
    if not src.exists():
        raise HTTPException(404, "nothing to export")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(src.rglob("*")):
            if f.is_file():
                zf.write(f, f.relative_to(src).as_posix())
    buf.seek(0)

    name = re.sub(r"[^A-Za-z0-9._ -]", "_", proj["name"]).strip() or "project"
    headers = {"Content-Disposition": f'attachment; filename="{name}.zip"'}
    return StreamingResponse(buf, media_type="application/zip", headers=headers)


# ---------- ai ----------

@app.get("/api/ai/settings")
async def ai_settings_get():
    return ai_service.public_settings()


@app.put("/api/ai/settings")
async def ai_settings_put(body: AiSettingsIn):
    return ai_service.update_settings(
        provider=body.provider,
        model=body.model,
        url=body.url,
        api_key=body.api_key,
    )


@app.get("/api/ai/models")
async def ai_models():
    return {
        "models": await ai_service.list_models(),
        "default": ai_service.default_model(),
        "provider": ai_service.public_settings()["provider"],
    }


@app.post("/api/ai/chat")
async def ai_chat(body: AiRequest):
    async def gen():
        async for ev in ai_service.stream_chat(body.model, body.instruction, body.context):
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
