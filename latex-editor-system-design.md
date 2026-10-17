# Local LaTeX Editor with AI Assistant: System Design

A free, self-hosted, Overleaf-style LaTeX editor. Users write LaTeX with a slash-command menu, compile to PDF on request, and get help from a local open-source model (Ollama: Llama 3.2 or Qwen). Storage is SQLite plus the local disk. Multiple users can log in.

---

## 1. System Design Plan

### 1.1 Goals
- Write LaTeX in a browser editor with a `/` command menu (`/section`, `/itemize`, `/equation`, ...).
- Compile to PDF only when the user requests it.
- A local LLM helps users write LaTeX: generate, fix errors, rewrite.
- Multi-user: registration, login, private projects per user.
- Fully local and free: SQLite, local HDD, Ollama, TeX Live.

### 1.2 Non-goals for v1
- Real-time collaboration (Yjs)
- Sharing projects between users
- Git-style version history
- Cloud deployment

### 1.3 Functional requirements
| # | Requirement |
|---|---|
| F1 | Register, log in, log out |
| F2 | Create, list, rename, delete projects |
| F3 | Create, edit, upload, delete files in a project (`.tex`, `.bib`, images) |
| F4 | Editor with syntax highlighting and `/` command menu |
| F5 | Compile on demand; show PDF and parsed errors |
| F6 | AI actions: Generate, Fix error, Rewrite selection |
| F7 | Choose LaTeX engine per project (pdflatex, xelatex, lualatex) |
| F8 | Download PDF and project zip |

### 1.3.1 Non-functional requirements
- **Security:** sandboxed compilation, hashed passwords, per-user data isolation.
- **Performance:** incremental compile under about 3 s for a small document; AI tokens streamed.
- **Reliability:** a failed compile or AI call never loses the user's text.
- **Simplicity:** runs on one machine with `docker-compose up`.

### 1.4 Technology choices
| Layer | Choice |
|---|---|
| Frontend | React (Vite), CodeMirror 6, PDF.js |
| Backend | FastAPI (Python) |
| Database | SQLite (WAL mode) |
| File storage | Local disk |
| LaTeX | TeX Live + latexmk in Docker |
| AI | Ollama (`qwen2.5-coder:7b` or `llama3.2:3b`) |
| Auth | Cookie sessions, argon2 password hashing |

### 1.5 Build phases
1. Backend skeleton, schema, auth, project and file CRUD
2. Editor UI, slash menu, compile endpoint, PDF preview
3. Error log parsing, uploads, engine selection
4. Ollama integration (Generate, Fix, Rewrite) with preview/accept flow
5. Polish: auto-compile, SyncTeX, templates, zip export, sharing

---

## 2. System Architecture Plan

### 2.1 High-level diagram

```
Browser (React + CodeMirror 6 + PDF.js)
        |  HTTP JSON + streaming (SSE)
        v
Backend API (FastAPI)
 |- Auth module
 |- Projects/Files module
 |- Compile service ----> Docker container (TeX Live, no network)
 |- AI service ---------> Ollama (localhost:11434)
        |
        v
SQLite (metadata)  +  Local disk (file contents, builds)
```

### 2.2 Components
| Component | Responsibility |
|---|---|
| Web client | Editor, file tree, PDF preview, error/AI panels |
| API server | Auth, access control, file I/O, orchestration |
| Compile worker | Runs latexmk in an isolated container, returns PDF and log |
| AI service | Builds prompts, calls Ollama, streams results back |
| SQLite | Users, sessions, projects, file metadata, run history |
| Disk | Source files and build outputs |

### 2.3 Key flows

**Compile**
1. User clicks Compile; client sends current editor content.
2. API checks ownership, saves files to `src/`.
3. API acquires the project's compile lock and starts the worker container.
4. Worker runs latexmk (30 s timeout, no network, memory/CPU caps).
5. API parses `main.log`, stores a `compile_runs` row, returns status, errors, and PDF URL.
6. Client displays the PDF and clickable errors.

**AI assist**
1. User types `/ai ...`, selects text, or clicks "Fix error".
2. Client sends the instruction plus nearby context (about 50 lines or the error and its surroundings).
3. API builds a prompt with a strict system message and calls Ollama with streaming.
4. Tokens stream to the client, which shows a preview.
5. User accepts or rejects; only accepted text enters the document.

### 2.4 Deployment (single machine)
`docker-compose` with services `app` (API + static frontend) and `latex-worker` (TeX Live image). Ollama runs on the host and is reached at `host.docker.internal:11434`. Data lives in a mounted `./data` volume.

---

## 3. Backend Layout

Suggested structure:

```
backend/
  app/
    main.py
    config.py
    db.py
    auth/        routes.py, security.py, deps.py
    projects/    routes.py, service.py
    files/       routes.py, service.py, paths.py
    compile/     routes.py, runner.py, log_parser.py
    ai/          routes.py, prompts.py, ollama_client.py
    models.py
  tests/
  data/          (runtime: SQLite file, user projects)
```

### 3.1 Databases & Storage Foundation

**SQLite settings:** `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;`

**Schema**

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT UNIQUE NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE projects (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  main_file   TEXT NOT NULL DEFAULT 'main.tex',
  engine      TEXT NOT NULL DEFAULT 'pdflatex',
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE files (
  id          INTEGER PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  kind        TEXT NOT NULL,          -- tex | bib | image | other
  size        INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, path)
);

CREATE TABLE compile_runs (
  id           INTEGER PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status       TEXT NOT NULL,         -- ok | error | timeout
  log_excerpt  TEXT,
  duration_ms  INTEGER,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ai_requests (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,          -- generate | fix | rewrite
  model       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_runs_project  ON compile_runs(project_id, created_at);
```

**Disk layout**

```
data/
  app.db
  users/<user_id>/projects/<project_id>/
      src/     main.tex, refs.bib, images/...
      build/   main.pdf, main.log, main.synctex.gz
```

**Storage rules**
- Database holds metadata; disk holds contents.
- Build every path from numeric IDs plus a validated relative file path.
- Reject paths containing `..`, absolute paths, symlinks, or disallowed extensions.
- Write files atomically (write to temp file, then rename).
- Enforce per-user quota (for example 200 MB) and per-file size limit (for example 10 MB).
- Periodic cleanup of old `build/` artifacts.

### 3.2 Auth & Permissions Foundation

**Authentication**
- Passwords hashed with argon2 (bcrypt acceptable). Minimum length enforced.
- Login creates a random session token; only its hash is stored in `sessions`.
- Token delivered as cookie: `HttpOnly`, `SameSite=Lax`, `Secure` when served over HTTPS.
- Session expiry (for example 7 days) with sliding renewal; logout deletes the session row.
- Login rate limiting (for example 5 attempts per minute per IP and per username).
- CSRF protection for state-changing requests (SameSite plus a CSRF token or custom header).

**Permissions**
- Single rule for v1: a user can access only resources where `project.user_id == current_user.id`.
- Implemented once as a dependency (`get_owned_project`) used by every project, file, compile, and AI endpoint.
- Return 404 (not 403) for other users' resources to avoid leaking existence.
- Roles: `user` and `admin` (admin can manage users and quotas). Add a `role` column when needed.

**Future:** a `project_members(project_id, user_id, role)` table for sharing with viewer/editor roles.

### 3.3 APIs & Backend Logic Foundation

**Endpoints**

| Area | Endpoint |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Projects | `GET /projects`, `POST /projects`, `GET /projects/{id}`, `PATCH /projects/{id}`, `DELETE /projects/{id}` |
| Files | `GET /projects/{id}/files`, `GET /projects/{id}/files/{path}`, `PUT /projects/{id}/files/{path}`, `DELETE /projects/{id}/files/{path}`, `POST /projects/{id}/upload` |
| Compile | `POST /projects/{id}/compile`, `GET /projects/{id}/pdf`, `GET /projects/{id}/log` |
| Export | `GET /projects/{id}/export.zip` |
| AI | `POST /ai/generate`, `POST /ai/fix`, `POST /ai/rewrite`, `GET /ai/models` |

**Compile logic**
- Command: `latexmk -pdf -interaction=nonstopmode -halt-on-error -no-shell-escape <main>` (engine flag chosen from project setting).
- Docker flags: `--network none --memory 1g --cpus 1 --pids-limit 256 --read-only` with only the project directory mounted writable.
- Timeout of 30 s; kill the container on expiry and return status `timeout`.
- One compile per project at a time (lock); a global limit of 2 to 3 concurrent compiles through a small queue.
- Log parser extracts `{file, line, message}` entries from lines starting with `!` and `file:line:` patterns.
- Keep `build/` between runs for incremental compilation.

**AI logic**
- Strict system prompt: output only valid LaTeX, no explanations, no markdown fences.
- Context window control: send the selection or about 50 lines around the cursor or error, never the whole project.
- Stream via Server-Sent Events.
- Post-process: strip stray code fences, trim chatter.
- Optional verification: compile the suggestion in a scratch directory and, if it fails, retry once with the error.
- One active AI request per user; request timeout; log each call in `ai_requests`.
- Model name read from config; list of installed models fetched from Ollama (`/api/tags`).

**Cross-cutting**
- Input validation with Pydantic models.
- Consistent error format: `{ "error": { "code": "...", "message": "..." } }`.
- Structured logging; request IDs.
- Automated tests for auth, path validation, permissions, and log parsing.

---

## 4. Frontend Layout

### 4.1 Pages
1. **Login / Register**
2. **Project list:** create, rename, delete, open
3. **Editor workspace** (main screen)
4. **Settings:** engine default, AI model, theme

### 4.2 Editor workspace

```
+--------------------------------------------------------------+
| Toolbar: [Project v] [Compile] [Engine v] [AI model v] [User v]|
+---------+-----------------------------+----------------------+
| File    |  Editor (CodeMirror 6)      |  PDF preview         |
| tree    |  - LaTeX highlighting       |  (PDF.js)            |
|         |  - "/" command menu         +----------------------+
|         |  - AI preview/accept bar    |  Tabs: Errors | AI   |
+---------+-----------------------------+----------------------+
```

### 4.3 Key UI components
| Component | Notes |
|---|---|
| `FileTree` | Create, rename, delete, upload; shows main file |
| `Editor` | CodeMirror 6 with LaTeX language support, autosave (debounced 1 to 2 s) |
| `SlashMenu` | Autocomplete triggered by `/`; inserts snippets and places cursor inside braces |
| `PdfViewer` | PDF.js; keeps scroll position across recompiles |
| `ErrorPanel` | Parsed errors; click to jump to line |
| `AiPanel` | Prompt box, streaming output, Accept / Reject / Retry |
| `SelectionToolbar` | Appears on selected text: Rewrite, Shorten, Fix grammar, Explain |

### 4.4 Slash command set (starter)
`/section`, `/subsection`, `/subsubsection`, `/itemize`, `/enumerate`, `/equation`, `/align`, `/figure`, `/table`, `/bold`, `/italic`, `/cite`, `/ref`, `/label`, `/frac`, `/sum`, `/integral`, `/ai`, `/fix`, `/rewrite`.

Each entry has `label`, `detail`, and `insert` with a cursor placeholder, for example:
```js
{ label: "/section", detail: "Section heading", insert: "\\section{${}}" }
```

### 4.5 State and data handling
- Client state: current user, project, open file, editor text, compile status, AI stream.
- Save on change (debounced) and always before compile.
- Compile button disabled while a compile is running; show progress and elapsed time.
- Never discard editor text on an API failure; show a retry banner.
- Basic keyboard shortcuts: `Ctrl+Enter` compile, `Ctrl+S` save.

---
#5.Frontend Design
Editor Design
  1. Top Global Navigation Bar
    Menu Options: Features the Overleaf logo icon followed by drop-down menus: File, Edit, Insert, View, Format, and Help, along with an Upgrade button.

    Project Title: Displays the document title (AVC Documentaion) with a drop-down arrow in the center.

    Action Controls: Houses project-level buttons on the right, including History, Layout, Share, settings, chat, review panel, and the AI assistant icon.

    2. Left Sidebar & File Tree
    Icon Navigation Strip: A vertical tool bar on the far left with shortcuts for file search, project navigation, the file tree, comments, and integrations.

    File Outline Panel: Displays a structured, collapsible table of contents outlining document sections from 1. Introduction down to 7. Conclusion.

  3. Center Panel (LaTeX Code Editor)
  File Tab & Quick Actions: Shows the active file tab (main.tex) alongside formatting tools for undo, redo, bold, and italic text.

  Editor Mode Toggle: A segmented switch letting you toggle between Code and Visual editor views.

  Code Workspace: Displays numbered lines of LaTeX source code (lines 37–78 visible) with full syntax highlighting.

  4. Right Panel (Live PDF Preview)
  Preview Toolbar: Features a green Recompile button, synchronization tools, a download button, color-invert options, and a zoom selector set to 50%.

  Document Viewer: Renders the compiled PDF output page in real time, showing sections for the system architecture, workflow, and features.


## Open decisions
- Backend language: FastAPI (Python) assumed; Node/Express is an equal alternative.
- Default model: `qwen2.5-coder:7b` (8 GB+ RAM) or `llama3.2:3b` (lighter machines).
- Session cookies (assumed) versus JWT.

##commands
python -m uvicorn app.main:app --reload 