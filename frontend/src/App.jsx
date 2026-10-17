import { useCallback, useEffect, useRef, useState } from 'react'
import { undo, redo, selectAll } from '@codemirror/commands'
import { api } from './api'
import Editor from './components/Editor'
import Home from './components/Home'
import FileTree from './components/FileTree'
import PdfViewer from './components/PdfViewer'
import ErrorPanel from './components/ErrorPanel'
import AiTerminal from './components/AiTerminal'
import AiSettings from './components/AiSettings'
import { ImagePicker, ImagePreview } from './components/ImageModal'
import TrashPanel from './components/TrashPanel'
import Outline from './components/Outline'
import MenuBar from './components/MenuBar'
import NavStrip from './components/NavStrip'
import EditorTabBar from './components/EditorTabBar'
import SelectionToolbar from './components/SelectionToolbar'
import './App.css'

const ENGINES = ['pdflatex', 'xelatex', 'lualatex']
const AUTOSAVE_MS = 1500
const AUTOCOMPILE_MS = 1000
const IMAGE_RE = /\.(png|jpe?g|gif|svg|bmp|webp)$/i

const isImage = (p) => IMAGE_RE.test(p)

function collectImages(nodes, acc = []) {
  for (const n of nodes) {
    if (n.kind === 'folder') collectImages(n.children || [], acc)
    else if (isImage(n.path)) acc.push(n.path)
  }
  return acc
}

const FIGURE_TPL = '\\begin{figure}[htbp]\n\\centering\n\\includegraphics[width=0.8\\linewidth]{${}}\n\\caption{}\n\\label{}\n\\end{figure}'
const TABLE_TPL = '\\begin{table}[htbp]\n\\centering\n\\begin{tabular}{${ll}}\n & \\\\\n\\end{tabular}\n\\caption{}\n\\label{}\n\\end{table}'
const EQUATION_TPL = '\\begin{equation}\n${}\n\\end{equation}'

const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

function loadWidth(key, fallback) {
  const v = Number(localStorage.getItem(key))
  return Number.isFinite(v) && v > 0 ? v : fallback
}

export default function App() {
  const [projects, setProjects] = useState([])
  const [view, setView] = useState('home') // home | editor
  const [project, setProject] = useState(null)
  const [tree, setTree] = useState([])
  const [activePath, setActivePath] = useState('main.tex')
  const [doc, setDoc] = useState('')
  const [saveState, setSaveState] = useState('saved') // saved | saving | dirty | error
  const [compile, setCompile] = useState({ running: false, result: null, elapsed: 0 })
  const [pdfUrl, setPdfUrl] = useState(null)
  const [rightTab, setRightTab] = useState('pdf') // pdf | errors | log | ai
  const [aiPrefill, setAiPrefill] = useState(null)
  const [aiModels, setAiModels] = useState([])
  const [aiModel, setAiModel] = useState('')
  const [aiSettings, setAiSettings] = useState(null)
  const [showAiSettings, setShowAiSettings] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('latex-theme') || 'dark')
  const [engine, setEngine] = useState('pdflatex')
  const [preview, setPreview] = useState(null)
  const [showPicker, setShowPicker] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
  const [filesOpen, setFilesOpen] = useState(true)
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [selection, setSelection] = useState('')
  const [sidebarW, setSidebarW] = useState(() => loadWidth('sidebarW', 240))
  const [rightW, setRightW] = useState(() =>
    loadWidth('rightW', Math.min(720, Math.round(window.innerWidth * 0.42))),
  )

  const editorViewRef = useRef(null)
  const saveTimerRef = useRef(null)
  const docRef = useRef('')
  const activePathRef = useRef('main.tex')
  const lastErrorRef = useRef(null)
  const compileTimerRef = useRef(null)
  const autoCompileTimerRef = useRef(null)
  const doCompileRef = useRef(null)
  const pendingJumpRef = useRef(null)
  const [syncTarget, setSyncTarget] = useState(null)
  const [autoCompile, setAutoCompile] = useState(() => {
    try {
      return localStorage.getItem('latex-auto-compile') !== 'false'
    } catch {
      return true
    }
  })
  docRef.current = doc
  activePathRef.current = activePath

  const contextForAi = useCallback(() => {
    const view = editorViewRef.current
    if (!view) return docRef.current.slice(0, 3000)
    const sel = view.state.selection.main
    if (!sel.empty) return view.state.doc.sliceString(sel.from, sel.to)
    const line = view.state.doc.lineAt(sel.head)
    const from = Math.max(1, line.number - 25)
    const to = Math.min(view.state.doc.lines, line.number + 25)
    return view.state.doc.sliceString(view.state.doc.line(from).from, view.state.doc.line(to).to)
  }, [])

  // ---------- theme ----------
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('latex-theme', theme) } catch {}
  }, [theme])

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

  useEffect(() => {
    try { localStorage.setItem('latex-auto-compile', autoCompile ? 'true' : 'false') } catch {}
  }, [autoCompile])

  // ---------- boot ----------
  useEffect(() => {
    ;(async () => {
      const list = await api.listProjects()
      setProjects(list)
      const [m, s] = await Promise.all([api.aiModels(), api.aiSettings()])
      setAiModels(m.models)
      setAiModel(m.default || m.models[0] || '')
      setAiSettings(s)
    })().catch((e) =>
      alert(
        'Could not reach the backend.\n\n' +
          'Make sure it is running:\n' +
          '  python -m uvicorn app.main:app --reload --app-dir backend\n\n' +
          `Details: ${e.message}`
      )
    )
  }, [])

  const refreshProjects = useCallback(async () => {
    const list = await api.listProjects()
    setProjects(list)
    return list
  }, [])

  const refreshAi = async (settings) => {
    const [m, s] = await Promise.all([api.aiModels(), settings ? Promise.resolve(settings) : api.aiSettings()])
    setAiModels(m.models)
    setAiModel((prev) => (m.models.includes(prev) ? prev : m.default || m.models[0] || prev))
    setAiSettings(s)
  }

  const openProject = async (p) => {
    const file = await api.readFile(p.id, p.main_file)
    const treeData = await api.getTree(p.id)
    setProject(p)
    setEngine(p.engine)
    setActivePath(p.main_file)
    setDoc(file.content)
    setTree(treeData)
    setSaveState('saved')
    setPdfUrl(`/api/projects/${p.id}/pdf?t=${Date.now()}`)
    setCompile({ running: false, result: null, elapsed: 0 })
  }

  const refreshTree = useCallback(async () => {
    if (!project) return
    setTree(await api.getTree(project.id))
  }, [project])

  // ---------- save ----------
  const saveNow = useCallback(async () => {
    if (!project) return
    clearTimeout(saveTimerRef.current)
    setSaveState('saving')
    try {
      await api.writeFile(project.id, docRef.current, activePathRef.current)
      setSaveState('saved')
    } catch (e) {
      setSaveState('error')
      console.error(e)
    }
  }, [project])

  const onChange = useCallback((text) => {
    setDoc(text)
    setSaveState('dirty')
    clearTimeout(saveTimerRef.current)
    clearTimeout(autoCompileTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveNow(), AUTOSAVE_MS)
    if (autoCompile) {
      autoCompileTimerRef.current = setTimeout(() => {
        doCompileRef.current?.({ manual: false })
      }, AUTOCOMPILE_MS)
    }
  }, [saveNow, autoCompile])

  // ---------- file tree actions ----------
  const openFile = useCallback(
    async (path) => {
      if (!project || path === activePathRef.current) return
      if (isImage(path)) {
        setPreview(path)
        return
      }
      if (/\.pdf$/i.test(path)) {
        window.open(api.rawUrl(project.id, path), '_blank')
        return
      }
      await saveNow()
      const file = await api.readFile(project.id, path)
      setActivePath(path)
      setDoc(file.content)
    },
    [project, saveNow],
  )

  const uploadImage = useCallback(
    async (file, dir) => {
      if (!project) return
      try {
        await api.uploadFile(project.id, file, dir)
        await refreshTree()
      } catch (e) {
        alert('Upload failed: ' + e.message)
      }
    },
    [project, refreshTree],
  )

  const insertImage = useCallback(
    (path) => {
      setPreview(null)
      setShowPicker(false)
      const view = editorViewRef.current
      if (!view) return
      const snippet = `\\includegraphics[width=\\linewidth]{${path}}`
      const sel = view.state.selection.main
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: snippet },
        selection: { anchor: sel.from + snippet.length },
      })
      view.focus()
      setSaveState('dirty')
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => saveNow(), AUTOSAVE_MS)
    },
    [saveNow],
  )

  const createFile = useCallback(
    async (path) => {
      if (!project) return
      try {
        await api.createFile(project.id, path)
        await refreshTree()
        await openFile(path)
      } catch (e) {
        alert('Could not create file: ' + e.message)
      }
    },
    [project, refreshTree, openFile],
  )

  const createFolder = useCallback(
    async (path) => {
      if (!project) return
      try {
        await api.createFolder(project.id, path)
        await refreshTree()
      } catch (e) {
        alert('Could not create folder: ' + e.message)
      }
    },
    [project, refreshTree],
  )

  const renameEntry = useCallback(
    async (from, to) => {
      if (!project) return
      try {
        await api.renameEntry(project.id, from, to)
        setActivePath((cur) =>
          cur === from ? to : cur.startsWith(from + '/') ? to + cur.slice(from.length) : cur,
        )
        setProject((p) => (p && p.main_file === from ? { ...p, main_file: to } : p))
        await refreshTree()
      } catch (e) {
        alert('Could not rename: ' + e.message)
      }
    },
    [project, refreshTree],
  )

  const deleteEntry = useCallback(
    async (node) => {
      if (!project) return
      const label = node.kind === 'folder' ? `folder "${node.name}" and its contents` : `"${node.name}"`
      if (!window.confirm(`Move ${label} to the recycle bin?`)) return
      try {
        await api.deleteEntry(project.id, node.path)
        const wasActive = activePathRef.current === node.path || activePathRef.current.startsWith(node.path + '/')
        await refreshTree()
        if (wasActive) {
          const fallback = project.main_file.startsWith(node.path + '/') || project.main_file === node.path ? null : project.main_file
          setActivePath(fallback || 'main.tex')
          try {
            const file = await api.readFile(project.id, fallback || 'main.tex')
            setDoc(file.content)
          } catch {
            setDoc('')
          }
        }
      } catch (e) {
        alert('Could not delete: ' + e.message)
      }
    },
    [project, refreshTree],
  )

  const setMainFile = useCallback(
    async (path) => {
      if (!project) return
      const p = await api.patchProject(project.id, { main_file: path })
      setProject(p)
    },
    [project],
  )

  const renameProject = async () => {
    if (!project) return
    const name = window.prompt('Project name:', project.name)
    if (!name || name === project.name) return
    const p = await api.patchProject(project.id, { name })
    setProject(p)
  }

  const deleteProject = async () => {
    if (!project) return
    if (!window.confirm(`Delete project "${project.name}"? This cannot be undone.`)) return
    await api.deleteProject(project.id)
    setProject(null)
    setView('home')
    await refreshProjects()
  }

  // ---------- home ----------
  const openFromHome = async (p) => {
    await openProject(p)
    setView('editor')
  }

  const createFromHome = async (name) => {
    const p = await api.createProject(name)
    await refreshProjects()
    return p
  }

  const importFromHome = async (file) => {
    await api.importProject(file)
    await refreshProjects()
  }

  const renameFromHome = async (p) => {
    const name = window.prompt('Project name:', p.name)
    if (!name || name === p.name) return
    await api.patchProject(p.id, { name })
    await refreshProjects()
  }

  const deleteFromHome = async (p) => {
    if (!window.confirm(`Delete project "${p.name}"? This cannot be undone.`)) return
    await api.deleteProject(p.id)
    await refreshProjects()
  }

  const downloadFromHome = (p) => window.open(api.exportUrl(p.id), '_blank')

  const goHome = async () => {
    await saveNow()
    setView('home')
    refreshProjects()
  }

  // ---------- pane resize ----------
  const onDragStart = (which) => (e) => {
    e.preventDefault()
    const startX = e.clientX
    const startSidebar = sidebarW
    const startRight = rightW
    const move = (ev) => {
      const dx = ev.clientX - startX
      if (which === 'sidebar') setSidebarW(clamp(startSidebar + dx, 150, 480))
      else setRightW(clamp(startRight - dx, 240, window.innerWidth - 240))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setSidebarW((w) => {
        localStorage.setItem('sidebarW', String(w))
        return w
      })
      setRightW((w) => {
        localStorage.setItem('rightW', String(w))
        return w
      })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // ---------- compile ----------
  const doCompile = useCallback(async (opts) => {
    const manual = opts?.manual ?? true
    if (!project || compile.running) return
    clearTimeout(saveTimerRef.current)
    await saveNow()
    setCompile({ running: true, result: null, elapsed: 0 })
    if (manual) setRightTab('errors')
    const start = Date.now()
    compileTimerRef.current = setInterval(() => {
      setCompile((c) => (c.running ? { ...c, elapsed: Date.now() - start } : c))
    }, 100)
    try {
      const res = await api.compile(project.id)
      lastErrorRef.current = res.errors?.[0] ?? null
      setCompile({ running: false, result: res, elapsed: res.duration_ms })
      if (res.pdf_url) setPdfUrl(`/api/projects/${project.id}/pdf?t=${Date.now()}`)
      else setPdfUrl(null)
      if (manual && res.status === 'ok') setRightTab('pdf')
      if (!manual && res.status !== 'ok') setRightTab('errors')
    } catch (e) {
      setCompile({
        running: false,
        result: { status: 'error', errors: [{ file: '', line: null, message: e.message }], duration_ms: 0 },
        elapsed: 0,
      })
      if (!manual) setRightTab('errors')
    } finally {
      clearInterval(compileTimerRef.current)
    }
  }, [project, compile.running, saveNow])
  doCompileRef.current = doCompile

  // ---------- editor ready / jump ----------
  const onEditorReady = (view) => {
    editorViewRef.current = view
    const pending = pendingJumpRef.current
    if (pending != null) {
      pendingJumpRef.current = null
      const line = view.state.doc.line(Math.min(pending, view.state.doc.lines))
      view.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: true })
      view.focus()
    }
  }

  const jumpToLine = (lineNo) => {
    const view = editorViewRef.current
    if (!view || !lineNo) return
    const line = view.state.doc.line(Math.min(lineNo, view.state.doc.lines))
    view.dispatch({
      selection: { anchor: line.from, head: line.to },
      scrollIntoView: true,
      effects: [],
    })
    view.focus()
  }

  // ---------- synctex ----------
  const syncToPdf = useCallback(async () => {
    const view = editorViewRef.current
    if (!project || !view) return
    const line = view.state.doc.lineAt(view.state.selection.main.head).number
    try {
      const res = await api.synctexView(project.id, activePathRef.current, line)
      setSyncTarget({ ...res, token: Date.now() })
      setRightTab('pdf')
    } catch {
      setRightTab('pdf')
    }
  }, [project])

  const inverseSearch = useCallback(
    async ({ page, x, y }) => {
      if (!project) return
      try {
        const res = await api.synctexEdit(project.id, page, x, y)
        if (!res?.file) return
        if (res.file !== activePathRef.current) {
          pendingJumpRef.current = res.line
          await openFile(res.file)
        } else {
          jumpToLine(res.line)
        }
      } catch {
        /* no synctex data yet */
      }
    },
    [project, openFile],
  )

  // ---------- AI actions ----------
  const startAiAction = useCallback(
    (action) => {
      setRightTab('ai')
      const err = lastErrorRef.current
      if (action === 'fix') {
        if (err) {
          setAiPrefill(
            `Fix this LaTeX error${err.line ? ` at line ${err.line}` : ''}: ${err.message}\nContext:\n${contextForAi()}`,
          )
        } else {
          setAiPrefill('Fix any errors in this document:\n' + contextForAi())
        }
      } else if (action === 'rewrite') {
        setAiPrefill('Rewrite the following to improve clarity while keeping the meaning:\n' + contextForAi())
      } else {
        setAiPrefill('')
      }
    },
    [contextForAi],
  )

  const applyAiText = (text) => {
    const view = editorViewRef.current
    if (!view || !text) return
    const sel = view.state.selection.main
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: text },
      selection: { anchor: sel.from, head: sel.from + text.length },
    })
    setSaveState('dirty')
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveNow(), 200)
  }

  // ---------- editor commands (toolbar / menus) ----------
  const markDirty = useCallback(() => {
    setSaveState('dirty')
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveNow(), AUTOSAVE_MS)
  }, [saveNow])

  const runEditor = useCallback((fn) => {
    const view = editorViewRef.current
    if (!view) return
    fn(view)
    view.focus()
  }, [])

  const insertTemplate = useCallback(
    (tpl) => {
      const view = editorViewRef.current
      if (!view) return
      const sel = view.state.selection.main
      const m = tpl.match(/\$\{([^}]*)\}/)
      let text = tpl
      let selFrom = tpl.length
      let selTo = tpl.length
      if (m) {
        const before = tpl.slice(0, m.index)
        const after = tpl.slice(m.index + m[0].length)
        text = before + m[1] + after
        selFrom = before.length
        selTo = before.length + m[1].length
      }
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: text },
        selection: { anchor: sel.from + selFrom, head: sel.from + selTo },
      })
      view.focus()
      markDirty()
    },
    [markDirty],
  )

  const wrapSelection = useCallback(
    (before, after = before) => {
      const view = editorViewRef.current
      if (!view) return
      const sel = view.state.selection.main
      const text = view.state.sliceDoc(sel.from, sel.to)
      const insert = before + text + after
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert },
        selection: { anchor: sel.from + before.length, head: sel.from + before.length + text.length },
      })
      view.focus()
      markDirty()
    },
    [markDirty],
  )

  const onSelectionAction = (kind) => {
    const text = selection
    if (!text) return
    setRightTab('ai')
    const prompts = {
      rewrite: 'Rewrite the following LaTeX to improve clarity while keeping the meaning:',
      shorten: 'Shorten the following LaTeX while keeping its meaning:',
      grammar: 'Fix grammar and spelling in the following LaTeX text:',
      explain: 'Explain what the following LaTeX does:',
    }
    setAiPrefill(`${prompts[kind]}\n${text}`)
  }

  // ---------- engine ----------
  const changeEngine = async (eng) => {
    setEngine(eng)
    if (project) {
      const p = await api.patchProject(project.id, { engine: eng })
      setProject(p)
    }
  }

  // ---------- keyboard ----------
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        doCompile()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveNow()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [doCompile, saveNow])

  if (view === 'home' || !project) {
    return (
      <Home
        projects={projects}
        onOpen={openFromHome}
        onCreate={createFromHome}
        onImport={importFromHome}
        onRename={renameFromHome}
        onDelete={deleteFromHome}
        onDownload={downloadFromHome}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    )
  }

  const result = compile.result
  const charCount = doc ? doc.length : 0
  const wordCount = doc && doc.trim() ? doc.trim().split(/\s+/).length : 0

  const menus = [
    {
      label: 'File',
      items: [
        { label: 'All projects', onClick: goHome },
        { sep: true },
        { label: 'Rename project…', onClick: renameProject },
        { label: 'Download PDF', onClick: () => window.open(api.pdfUrl(project.id), '_blank') },
        { label: 'Download project (.zip)', onClick: () => window.open(api.exportUrl(project.id), '_blank') },
        { sep: true },
        { label: 'Delete project', onClick: deleteProject },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', hint: 'Ctrl+Z', onClick: () => runEditor(undo) },
        { label: 'Redo', hint: 'Ctrl+Y', onClick: () => runEditor(redo) },
        { sep: true },
        { label: 'Select all', hint: 'Ctrl+A', onClick: () => runEditor(selectAll) },
      ],
    },
    {
      label: 'Insert',
      items: [
        { label: 'Image…', onClick: () => setShowPicker(true) },
        { label: 'Figure', onClick: () => insertTemplate(FIGURE_TPL) },
        { label: 'Table', onClick: () => insertTemplate(TABLE_TPL) },
        { label: 'Equation', onClick: () => insertTemplate(EQUATION_TPL) },
        { sep: true },
        { label: 'Citation', onClick: () => insertTemplate('\\cite{${}}') },
        { label: 'Reference', onClick: () => insertTemplate('\\ref{${}}') },
        { label: 'Label', onClick: () => insertTemplate('\\label{${}}') },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Show files', onClick: () => setFilesOpen((v) => !v) },
        { label: 'Show outline', onClick: () => setOutlineOpen((v) => !v) },
        { label: 'Show PDF', onClick: () => setRightTab('pdf') },
        { label: 'Show errors', onClick: () => setRightTab('errors') },
        { label: 'Show log', onClick: () => setRightTab('log') },
        { label: 'Show AI', onClick: () => setRightTab('ai') },
        { sep: true },
        { label: 'Sync to PDF', hint: 'cursor → PDF', onClick: syncToPdf },
        { label: 'Auto-compile', onClick: () => setAutoCompile((v) => !v) },
      ],
    },
    {
      label: 'Format',
      items: [
        { label: 'Bold', hint: 'Ctrl+B', onClick: () => wrapSelection('\\textbf{', '}') },
        { label: 'Italic', onClick: () => wrapSelection('\\textit{', '}') },
        { label: 'Underline', onClick: () => wrapSelection('\\underline{', '}') },
        { label: 'Code', onClick: () => wrapSelection('\\texttt{', '}') },
        { sep: true },
        { label: 'Section', onClick: () => insertTemplate('\\section{${}}') },
        { label: 'Itemize', onClick: () => insertTemplate('\\begin{itemize}\n\\item ${}\n\\end{itemize}') },
      ],
    },
    {
      label: 'Help',
      items: [
        {
          label: 'Keyboard shortcuts',
          onClick: () => window.alert('Ctrl+S save · Ctrl+Enter compile · / slash menu · Ctrl+Z undo'),
        },
        { label: 'About', onClick: () => window.alert('Local LaTeX Editor — a self-hosted, Overleaf-style editor.') },
      ],
    },
  ]

  return (
    <div className="app">
      <MenuBar title={project.name} onRenameTitle={renameProject} menus={menus}>
        <select
          value={engine}
          onChange={(e) => changeEngine(e.target.value)}
          className="engine-select"
          title="Compiler engine"
        >
          {ENGINES.map((en) => (
            <option key={en} value={en}>{en}</option>
          ))}
        </select>

        <button className="btn primary compile-btn" onClick={doCompile} disabled={compile.running}>
          {compile.running ? `Compiling… ${(compile.elapsed / 1000).toFixed(1)}s` : 'Recompile'}
        </button>

        <a className="btn" href={api.exportUrl(project.id)} title="Download project as ZIP">ZIP</a>
      </MenuBar>

      <main className="workspace">
        <NavStrip
          filesOpen={filesOpen}
          outlineOpen={outlineOpen}
          onToggleFiles={() => setFilesOpen((v) => !v)}
          onToggleOutline={() => setOutlineOpen((v) => !v)}
          onHistory={() => window.alert('Version history is not available yet.')}
          onShare={() => window.alert('Sharing is not available yet.')}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        {(filesOpen || outlineOpen) && (
          <>
            <aside className="sidebar" style={{ flex: `0 0 ${sidebarW}px` }}>
              {filesOpen && (
                <FileTree
                  tree={tree}
                  activePath={activePath}
                  mainFile={project.main_file}
                  onOpen={openFile}
                  onCreateFile={createFile}
                  onCreateFolder={createFolder}
                  onRename={renameEntry}
                  onDelete={deleteEntry}
                  onSetMain={setMainFile}
                  onUpload={uploadImage}
                  onOpenTrash={() => setShowTrash(true)}
                />
              )}
              {outlineOpen && <Outline doc={doc} onJump={jumpToLine} />}
            </aside>

            <div className="resizer" onMouseDown={onDragStart('sidebar')} />
          </>
        )}

        <section className="editor-pane">
          <EditorTabBar
            path={activePath}
            onUndo={() => runEditor(undo)}
            onRedo={() => runEditor(redo)}
            onBold={() => wrapSelection('\\textbf{', '}')}
            onItalic={() => wrapSelection('\\textit{', '}')}
            onUnderline={() => wrapSelection('\\underline{', '}')}
            onCode={() => wrapSelection('\\texttt{', '}')}
          />
          <SelectionToolbar visible={!!selection} onAction={onSelectionAction} />
          <Editor
            key={`${project.id}:${activePath}`}
            doc={doc}
            theme={theme}
            onChange={onChange}
            onSave={saveNow}
            onCompile={doCompile}
            onReady={onEditorReady}
            onAiAction={startAiAction}
            onInsertImage={() => setShowPicker(true)}
            onSelection={setSelection}
          />
        </section>

        <div className="resizer" onMouseDown={onDragStart('right')} />

        <aside className="right-pane" style={{ flex: `0 0 ${rightW}px` }}>
          <nav className="tabs">
            <button className={rightTab === 'pdf' ? 'active' : ''} onClick={() => setRightTab('pdf')}>
              <span className="tab-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                  <path d="M14 3v5h5" />
                  <path d="M9 13h6M9 17h4" />
                </svg>
              </span>
              PDF
            </button>
            <button className={rightTab === 'errors' ? 'active' : ''} onClick={() => setRightTab('errors')}>
              <span className="tab-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
              </span>
              Errors {result?.errors?.length ? `(${result.errors.length})` : ''}
            </button>
            <button className={rightTab === 'log' ? 'active' : ''} onClick={() => setRightTab('log')}>
              <span className="tab-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                  <path d="M14 3v5h5" />
                  <path d="M16 13H8M16 17H8M10 9H8" />
                </svg>
              </span>
              Log
            </button>
            <button className={rightTab === 'ai' ? 'active' : ''} onClick={() => setRightTab('ai')}>
              <span className="tab-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
                  <path d="M12 8.5 13.4 11 16 12l-2.6 1L12 15.5 10.6 13 8 12l2.6-1z" />
                </svg>
              </span>
              AI
            </button>
          </nav>

          <div className="tab-body">
            {rightTab === 'pdf' && (
              <PdfViewer
                pdfUrl={pdfUrl}
                onRecompile={doCompile}
                compiling={compile.running}
                onForward={syncToPdf}
                onInverse={pdfUrl ? inverseSearch : null}
                sync={syncTarget}
              />
            )}
            {rightTab === 'errors' && (
              <ErrorPanel errors={result?.errors || (compile.running ? [] : null)} onJump={jumpToLine} />
            )}
            {rightTab === 'log' && (
              <div className="compile-log" style={{ overflow: 'auto', padding: 'var(--space-3)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                {compile.running ? 'Compiling...' : (result?.log_excerpt || 'No log available')}
              </div>
            )}
            {rightTab === 'ai' && (
              <AiTerminal
                context={contextForAi()}
                prefill={aiPrefill}
                onApply={applyAiText}
                models={aiModels}
                model={aiModel}
                onModelChange={setAiModel}
                providerLabel={
                  aiSettings?.providers?.find((p) => p.id === aiSettings.provider)?.label || aiSettings?.provider
                }
                onOpenSettings={() => setShowAiSettings(true)}
              />
            )}
          </div>
        </aside>
      </main>

      <footer className="statusbar">
        <span className="sb-item" title="Active file">{activePath || '—'}</span>
        <span className="sb-sep" />
        <span className="sb-item">{engine}</span>
        <span className="sb-sep" />
        <span className="sb-item">{wordCount} words · {charCount} chars</span>
        <span className="sb-spacer" />
        {compile.running && (
          <span className="sb-item sb-run"><span className="sb-dot" />Compiling…</span>
        )}
        {!compile.running && result && (
          <span className={`sb-item ${result.status === 'ok' ? 'sb-ok' : 'sb-err'}`}>
            <span className="sb-dot" />
            {result.status === 'ok'
              ? `Compiled in ${result.duration_ms}ms`
              : `${result.status.toUpperCase()}${result.errors?.length ? ` · ${result.errors.length} error${result.errors.length > 1 ? 's' : ''}` : ''}`}
          </span>
        )}
        <span className="sb-sep" />
        <span className={`sb-item sb-save ${saveState}`}>
          {saveState === 'saved' && 'Saved'}
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'dirty' && 'Unsaved'}
          {saveState === 'error' && 'Save failed'}
        </span>
      </footer>

      {preview && (
        <ImagePreview
          path={preview}
          name={preview.split('/').pop()}
          url={api.rawUrl(project.id, preview)}
          onClose={() => setPreview(null)}
          onInsert={insertImage}
        />
      )}

      {showPicker && (
        <ImagePicker
          images={collectImages(tree)}
          resolveUrl={(p) => api.rawUrl(project.id, p)}
          onClose={() => setShowPicker(false)}
          onInsert={insertImage}
        />
      )}

      {showTrash && (
        <TrashPanel
          projectId={project.id}
          onClose={() => setShowTrash(false)}
          onChanged={refreshTree}
        />
      )}

      {showAiSettings && aiSettings && (
        <AiSettings
          settings={aiSettings}
          onClose={() => setShowAiSettings(false)}
          onSaved={(s) => refreshAi(s)}
        />
      )}
    </div>
  )
}
