import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from .ai.ollama_client import list_models, stream_chat
from .compile.runner import run_compile
from .config import DEFAULT_AI_MODEL, ENGINES, MAX_FILE_BYTES
from .db import connect, init_db
from .files.paths import (
    PathValidationError,
    build_dir,
    resolve_in_src,
    src_dir,
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


class FilePut(BaseModel):
    content: str


class AiRequest(BaseModel):
    instruction: str = Field(min_length=1)
    context: str = ""
    model: str = DEFAULT_AI_MODEL


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
    import shutil

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


# ---------- ai ----------

@app.get("/api/ai/models")
async def ai_models():
    return {"models": await list_models(), "default": DEFAULT_AI_MODEL}


@app.post("/api/ai/chat")
async def ai_chat(body: AiRequest):
    async def gen():
        async for ev in stream_chat(body.model, body.instruction, body.context):
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
