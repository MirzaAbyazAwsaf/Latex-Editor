import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import Editor from './components/Editor'
import PdfViewer from './components/PdfViewer'
import ErrorPanel from './components/ErrorPanel'
import AiTerminal from './components/AiTerminal'
import './App.css'

const ENGINES = ['pdflatex', 'xelatex', 'lualatex']
const AUTOSAVE_MS = 1500

export default function App() {
  const [projects, setProjects] = useState([])
  const [project, setProject] = useState(null)
  const [doc, setDoc] = useState('')
  const [saveState, setSaveState] = useState('saved') // saved | saving | dirty | error
  const [compile, setCompile] = useState({ running: false, result: null, elapsed: 0 })
  const [pdfUrl, setPdfUrl] = useState(null)
  const [rightTab, setRightTab] = useState('pdf') // pdf | errors | ai
  const [aiPrefill, setAiPrefill] = useState(null)
  const [aiModels, setAiModels] = useState([])
  const [aiModel, setAiModel] = useState('')
  const [engine, setEngine] = useState('pdflatex')

  const editorViewRef = useRef(null)
  const saveTimerRef = useRef(null)
  const docRef = useRef('')
  const lastErrorRef = useRef(null)
  const compileTimerRef = useRef(null)
  docRef.current = doc

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

  // ---------- boot ----------
  useEffect(() => {
    ;(async () => {
      let list = await api.listProjects()
      if (list.length === 0) list = [await api.createProject('My First Document')]
      setProjects(list)
      await openProject(list[0])
      const m = await api.aiModels()
      setAiModels(m.models)
      setAiModel(m.default)
    })().catch((e) => alert('Failed to load: ' + e.message))
  }, [])

  const openProject = async (p) => {
    const file = await api.readFile(p.id)
    setProject(p)
    setEngine(p.engine)
    setDoc(file.content)
    setSaveState('saved')
    setPdfUrl(`/api/projects/${p.id}/pdf?t=${Date.now()}`)
    setCompile({ running: false, result: null, elapsed: 0 })
  }

  // ---------- save ----------
  const saveNow = useCallback(async () => {
    if (!project) return
    clearTimeout(saveTimerRef.current)
    setSaveState('saving')
    try {
      await api.writeFile(project.id, docRef.current)
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
    saveTimerRef.current = setTimeout(() => saveNow(), AUTOSAVE_MS)
  }, [saveNow])

  // ---------- compile ----------
  const doCompile = useCallback(async () => {
    if (!project || compile.running) return
    clearTimeout(saveTimerRef.current)
    await saveNow()
    setCompile({ running: true, result: null, elapsed: 0 })
    setRightTab('errors')
    const start = Date.now()
    compileTimerRef.current = setInterval(() => {
      setCompile((c) => (c.running ? { ...c, elapsed: Date.now() - start } : c))
    }, 100)
    try {
      const res = await api.compile(project.id)
      lastErrorRef.current = res.errors?.[0] ?? null
      setCompile({ running: false, result: res, elapsed: res.duration_ms })
      if (res.pdf_url) setPdfUrl(`/api/projects/${project.id}/pdf?t=${Date.now()}`)
      if (res.status === 'ok') setRightTab('pdf')
    } catch (e) {
      setCompile({
        running: false,
        result: { status: 'error', errors: [{ file: '', line: null, message: e.message }], duration_ms: 0 },
        elapsed: 0,
      })
    } finally {
      clearInterval(compileTimerRef.current)
    }
  }, [project, compile.running, saveNow])

  // ---------- editor ready / jump ----------
  const onEditorReady = (view) => {
    editorViewRef.current = view
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

  if (!project) return <div className="boot">Loading…</div>

  const result = compile.result
  const statusBadge = {
    ok: 'badge ok',
    error: 'badge err',
    timeout: 'badge err',
  }

  return (
    <div className="app">
      <header className="toolbar">
        <span className="logo">⟨LaTeX⟩</span>
        <span className="proj-name">{project.name}</span>

        <div className="toolbar-right">
          <span className={`save-ind ${saveState}`}>
            {saveState === 'saved' && 'Saved ✓'}
            {saveState === 'saving' && 'Saving…'}
            {saveState === 'dirty' && 'Unsaved'}
            {saveState === 'error' && 'Save failed!'}
          </span>

          <select value={engine} onChange={(e) => changeEngine(e.target.value)} className="engine-select">
            {ENGINES.map((en) => (
              <option key={en} value={en}>{en}</option>
            ))}
          </select>

          <button className="btn primary compile-btn" onClick={doCompile} disabled={compile.running}>
            {compile.running ? `Compiling… ${(compile.elapsed / 1000).toFixed(1)}s` : '▶ Compile'}
          </button>

          {result && (
            <span className={statusBadge[result.status] || 'badge'}>
              {result.status === 'ok' ? `OK ${result.duration_ms}ms` : result.status.toUpperCase()}
            </span>
          )}
        </div>
      </header>

      <main className="workspace">
        <section className="editor-pane">
          <Editor
            key={project.id}
            doc={doc}
            onChange={onChange}
            onSave={saveNow}
            onCompile={doCompile}
            onReady={onEditorReady}
            onAiAction={startAiAction}
          />
        </section>

        <aside className="right-pane">
          <nav className="tabs">
            <button className={rightTab === 'pdf' ? 'active' : ''} onClick={() => setRightTab('pdf')}>PDF</button>
            <button className={rightTab === 'errors' ? 'active' : ''} onClick={() => setRightTab('errors')}>
              Errors {result?.errors?.length ? `(${result.errors.length})` : ''}
            </button>
            <button className={rightTab === 'ai' ? 'active' : ''} onClick={() => setRightTab('ai')}>AI</button>
          </nav>

          <div className="tab-body">
            {rightTab === 'pdf' && <PdfViewer pdfUrl={pdfUrl} />}
            {rightTab === 'errors' && (
              <ErrorPanel errors={result?.errors || (compile.running ? [] : null)} onJump={jumpToLine} />
            )}
            {rightTab === 'ai' && (
              <AiTerminal
                context={contextForAi()}
                prefill={aiPrefill}
                onApply={applyAiText}
                models={aiModels}
                model={aiModel}
                onModelChange={setAiModel}
              />
            )}
          </div>
        </aside>
      </main>
    </div>
  )
}
