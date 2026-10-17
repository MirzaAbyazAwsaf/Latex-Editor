import { useMemo, useRef, useState } from 'react'

const BRAND = 'Local LaTeX Editor'

function parseDate(s) {
  if (!s) return null
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function relTime(s) {
  const d = parseDate(s)
  if (!d) return 'a while ago'
  const sec = Math.max(0, (Date.now() - d.getTime()) / 1000)
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [name, size] of units) {
    if (sec >= size) {
      const n = Math.floor(sec / size)
      return `${n} ${name}${n > 1 ? 's' : ''} ago`
    }
  }
  return 'just now'
}

function LeafLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.4 3.2c-.2-.2-.6-.3-1-.2C13.6 4.3 8.4 7 5.9 11c-1.6 2.5-1.8 5-.6 7l-1.9 1.9a1 1 0 0 0 1.4 1.4l1.9-1.9c1 .6 2.1.9 3.2.9 1.3 0 2.6-.4 3.8-1.2 4-2.5 6.7-7.7 8-13.5.1-.4 0-.8-.3-1.1zM11 17.5c-1.4.9-2.9 1-4.2.3 1.7-3.1 4.7-5.7 8.9-7.8-1.7 3.2-3.3 5.6-4.7 7.5z" />
    </svg>
  )
}

function FolderIcon({ size = 46 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">
      <path d="M5 12a3 3 0 0 1 3-3h10l3 4h19a3 3 0 0 1 3 3v22a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V12z" />
    </svg>
  )
}

function Dots() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  )
}

function CardMenu({ onRename, onDownload, onDelete, onClose, children }) {
  return (
    <>
      <div className="ol-menu-backdrop" onClick={(e) => { e.stopPropagation(); onClose() }} />
      <div className="ol-card-menu" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => { onClose(); onRename() }}>Rename</button>
        <button onClick={() => { onClose(); onDownload() }}>Download (.zip)</button>
        <div className="ol-menu-sep" />
        <button className="danger" onClick={() => { onClose(); onDelete() }}>Delete</button>
      </div>
      {children}
    </>
  )
}

export default function Home({
  projects,
  onOpen,
  onCreate,
  onImport,
  onRename,
  onDelete,
  onDownload,
  theme,
  onToggleTheme,
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('last-updated')
  const [view, setView] = useState('grid')
  const [newOpen, setNewOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [menuId, setMenuId] = useState(null)
  const fileRef = useRef(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : [...projects]
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
    else list.sort((a, b) => (parseDate(b.updated_at)?.getTime() || 0) - (parseDate(a.updated_at)?.getTime() || 0))
    return list
  }, [projects, query, sort])

  const submitNew = async (e) => {
    e.preventDefault()
    const n = name.trim()
    if (!n || busy) return
    setBusy(true)
    setError('')
    try {
      await onCreate(n)
      setCreating(false)
      setName('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    try {
      await onImport(file)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const openBlank = () => {
    setNewOpen(false)
    setError('')
    setName('')
    setCreating(true)
  }

  const upload = () => {
    setNewOpen(false)
    fileRef.current?.click()
  }

  const createExample = async () => {
    setNewOpen(false)
    setError('')
    setBusy(true)
    try {
      const p = await onCreate('Example Project')
      if (p) onOpen(p)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const renderMeta = (p) => `Last modified ${relTime(p.updated_at)}`

  return (
    <div className="home">
      <header className="ol-nav">
        <div className="ol-brand">
          <LeafLogo />
          <span className="ol-brand-name">{BRAND}</span>
        </div>
        <div className="ol-nav-right">
          <button className="ol-nav-link" onClick={() => window.alert('Local LaTeX Editor — a self-hosted, Overleaf-style editor.')}>
            Help
          </button>
          <button className="ol-nav-icon" onClick={onToggleTheme} title="Toggle theme" aria-label="Toggle theme">
            {theme === 'light' ? '☾' : '☀'}
          </button>
          <span className="ol-avatar" title="You">L</span>
        </div>
      </header>

      <main className="ol-main">
        <h1 className="ol-h1">Your Projects</h1>

        <div className="ol-toolbar">
          <div className="ol-search">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              aria-label="Search projects"
            />
          </div>

          <div className="ol-sort">
            <label htmlFor="ol-sort">Sort by</label>
            <select id="ol-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="last-updated">Last modified</option>
              <option value="name">Name</option>
            </select>
          </div>

          <div className="ol-viewtoggle" role="group" aria-label="View">
            <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} title="Grid view" aria-label="Grid view">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} title="List view" aria-label="List view">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <rect x="3" y="4" width="18" height="3" rx="1" />
                <rect x="3" y="10.5" width="18" height="3" rx="1" />
                <rect x="3" y="17" width="18" height="3" rx="1" />
              </svg>
            </button>
          </div>

          <div className="ol-newproject">
            <button className="ol-btn-green" onClick={() => setNewOpen((v) => !v)} disabled={busy}>
              <span className="ol-plus">+</span> New Project <span className="ol-caret">▾</span>
            </button>
            {newOpen && (
              <>
                <div className="ol-menu-backdrop" onClick={() => setNewOpen(false)} />
                <div className="ol-newproject-menu">
                  <button onClick={openBlank}>Blank Project</button>
                  <button onClick={createExample}>Example Project</button>
                  <button onClick={upload}>Upload Project</button>
                </div>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".zip,.tex" hidden onChange={onFile} />
        </div>

        {error && <div className="ol-error">{error}</div>}

        {filtered.length === 0 ? (
          <div className="ol-empty">
            <div className="ol-empty-icon"><FolderIcon size={64} /></div>
            <h2>{projects.length === 0 ? 'Create your first project' : 'No projects found'}</h2>
            <p>
              {projects.length === 0
                ? 'Start from a blank project, use an example, or upload a .zip / .tex file.'
                : 'Try a different search term.'}
            </p>
            {projects.length === 0 && (
              <button className="ol-btn-green" onClick={openBlank}>New Project</button>
            )}
          </div>
        ) : view === 'grid' ? (
          <div className="ol-grid">
            {filtered.map((p) => (
              <div className="ol-card" key={p.id} onClick={() => onOpen(p)}>
                <div className="ol-thumb"><FolderIcon /></div>
                <div className="ol-card-meta">
                  <div className="ol-card-name" title={p.name}>{p.name}</div>
                  <div className="ol-card-sub">{renderMeta(p)}</div>
                </div>
                <div className="ol-card-actions">
                  <button
                    className="ol-iconbtn"
                    title="More"
                    onClick={(e) => { e.stopPropagation(); setMenuId(menuId === p.id ? null : p.id) }}
                  >
                    <Dots />
                  </button>
                  {menuId === p.id && (
                    <CardMenu
                      onClose={() => setMenuId(null)}
                      onRename={() => onRename(p)}
                      onDownload={() => onDownload(p)}
                      onDelete={() => onDelete(p)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="ol-list">
            {filtered.map((p) => (
              <div className="ol-list-row" key={p.id} onClick={() => onOpen(p)}>
                <span className="ol-list-icon"><FolderIcon size={22} /></span>
                <span className="ol-list-name" title={p.name}>{p.name}</span>
                <span className="ol-list-sub">{renderMeta(p)}</span>
                <span className="ol-card-actions ol-list-actions">
                  <button
                    className="ol-iconbtn"
                    title="More"
                    onClick={(e) => { e.stopPropagation(); setMenuId(menuId === p.id ? null : p.id) }}
                  >
                    <Dots />
                  </button>
                  {menuId === p.id && (
                    <CardMenu
                      onClose={() => setMenuId(null)}
                      onRename={() => onRename(p)}
                      onDownload={() => onDownload(p)}
                      onDelete={() => onDelete(p)}
                    />
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {error && !creating && <div className="ol-error">{error}</div>}
      </main>

      {creating && (
        <div className="ol-overlay" onClick={() => setCreating(false)}>
          <form className="ol-dialog" onClick={(e) => e.stopPropagation()} onSubmit={submitNew}>
            <div className="ol-dialog-head">
              <span>New Project</span>
              <button type="button" className="ol-dialog-close" onClick={() => setCreating(false)}>✕</button>
            </div>
            <div className="ol-dialog-body">
              <label className="ol-field">
                <span>Project name</span>
                <input
                  autoFocus
                  value={name}
                  placeholder="Untitled Project"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              {error && <div className="ol-dialog-error">{error}</div>}
            </div>
            <div className="ol-dialog-foot">
              <button type="button" className="ol-btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
              <button type="submit" className="ol-btn-green" disabled={busy || !name.trim()}>
                {busy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
