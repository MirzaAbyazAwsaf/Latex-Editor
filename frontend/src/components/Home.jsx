import { useEffect, useMemo, useRef, useState } from 'react'

const BRAND = 'Local LaTeX Editor'

const NAV = [
  { id: 'all', label: 'Your projects' },
  { id: 'shared', label: 'Shared with you' },
  { id: 'archived', label: 'Archived projects' },
]

function parseDate(s) {
  if (!s) return null
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function relTime(s) {
  const d = parseDate(s)
  if (!d) return '—'
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

function loadSet(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || '[]'))
  } catch {
    return new Set()
  }
}
function loadList(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function loadObj(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}
function save(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch {
    /* ignore */
  }
}

const ICONS = {
  leaf: (
    <path d="M20.4 3.2c-.2-.2-.6-.3-1-.2C13.6 4.3 8.4 7 5.9 11c-1.6 2.5-1.8 5-.6 7l-1.9 1.9a1 1 0 0 0 1.4 1.4l1.9-1.9c1 .6 2.1.9 3.2.9 1.3 0 2.6-.4 3.8-1.2 4-2.5 6.7-7.7 8-13.5.1-.4 0-.8-.3-1.1zM11 17.5c-1.4.9-2.9 1-4.2.3 1.7-3.1 4.7-5.7 8.9-7.8-1.7 3.2-3.3 5.6-4.7 7.5z" />
  ),
  folder: (
    <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" />
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 12 5 5 5-5" />
      <path d="M4 21h16" />
    </>
  ),
  pdf: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-3zm0 0v5" />
      <path d="M15 13v5" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </>
  ),
  unarchive: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M12 17v-6m0 0-2.5 2.5M12 11l2.5 2.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </>
  ),
  tag: (
    <>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 2.8 12V4A1.2 1.2 0 0 1 4 2.8H12c.5 0 1 .2 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  restore: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </>
  ),
  tag: (
    <>
      <path d="M3 11V5a2 2 0 0 1 2-2h6l9 9-8 8-9-9z" />
      <circle cx="8" cy="8" r="1.4" />
    </>
  ),
  library: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h2v18H6a2 2 0 0 1-2-2V5z" />
      <path d="M11 3h2v18h-2z" />
      <path d="m16 4 4 1-4 15-3-.8z" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
}

function Icon({ name, size = 16, fill = false, strokeWidth = 1.8 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
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
  onCopy,
  onViewPdf,
  theme,
  onToggleTheme,
}) {
  const [query, setQuery] = useState('')
  const [nav, setNav] = useState('all')
  const [selected, setSelected] = useState(() => new Set())
  const [newOpen, setNewOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [archived, setArchived] = useState(() => loadSet('ltx:archived'))
  const [trashed, setTrashed] = useState(() => loadSet('ltx:trash'))
  const [tags, setTags] = useState(() => loadList('ltx:tags'))
  const [ptags, setPtags] = useState(() => loadObj('ltx:ptags'))

  const fileRef = useRef(null)

  useEffect(() => save('ltx:archived', [...archived]), [archived])
  useEffect(() => save('ltx:trash', [...trashed]), [trashed])
  useEffect(() => save('ltx:tags', tags), [tags])
  useEffect(() => save('ltx:ptags', ptags), [ptags])

  const visible = useMemo(() => {
    let list
    if (nav === 'shared' || nav === 'library') list = []
    else if (nav === 'archived') list = projects.filter((p) => archived.has(p.id) && !trashed.has(p.id))
    else if (nav === 'trash') list = projects.filter((p) => trashed.has(p.id))
    else if (nav.startsWith('tag:')) {
      const t = nav.slice(4)
      list = projects.filter((p) => !archived.has(p.id) && !trashed.has(p.id) && (ptags[p.id] || []).includes(t))
    } else list = projects.filter((p) => !archived.has(p.id) && !trashed.has(p.id))

    const q = query.trim().toLowerCase()
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q))
    return [...list].sort(
      (a, b) => (parseDate(b.updated_at)?.getTime() || 0) - (parseDate(a.updated_at)?.getTime() || 0),
    )
  }, [projects, nav, query, archived, trashed, ptags])

  const heading =
    nav === 'archived'
      ? 'Archived projects'
      : nav === 'shared'
        ? 'Shared with you'
        : nav === 'library'
          ? 'Library'
          : nav === 'trash'
            ? 'Trash'
            : nav.startsWith('tag:')
              ? `Tag: ${nav.slice(4)}`
              : 'All projects'

  const allChecked = visible.length > 0 && visible.every((p) => selected.has(p.id))

  const toggleSelected = (id) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s)
      if (allChecked) visible.forEach((p) => n.delete(p.id))
      else visible.forEach((p) => n.add(p.id))
      return n
    })

  const mutateSet = (setter) => (ids, add = true) =>
    setter((s) => {
      const n = new Set(s)
      ids.forEach((id) => (add ? n.add(id) : n.delete(id)))
      return n
    })

  const setArchivedMany = mutateSet(setArchived)
  const setTrashedMany = mutateSet(setTrashed)

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

  const addTag = () => {
    const t = window.prompt('New tag name')
    if (!t || !t.trim()) return
    const clean = t.trim()
    setTags((a) => (a.includes(clean) ? a : [...a, clean]))
  }

  const editTags = (p) => {
    const cur = (ptags[p.id] || []).join(', ')
    const v = window.prompt('Tags for this project (comma separated)', cur)
    if (v == null) return
    const arr = v.split(',').map((x) => x.trim()).filter(Boolean)
    for (const t of arr) if (!tags.includes(t)) setTags((a) => [...a, t])
    setPtags((m) => ({ ...m, [p.id]: arr }))
  }

  const rowAction = (label, icon, onClick, extraClass = '') => (
    <button className={`ol-act ${extraClass}`} title={label} aria-label={label} onClick={onClick}>
      <Icon name={icon} size={16} />
    </button>
  )

  const renderRow = (p) => {
    const inTrash = trashed.has(p.id)
    return (
      <tr key={p.id} className="ol-row" onClick={() => (inTrash ? null : onOpen(p))}>
        <td className="ol-col-check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected.has(p.id)}
            onChange={() => toggleSelected(p.id)}
            aria-label={`Select ${p.name}`}
          />
        </td>
        <td
          className="ol-col-title"
          onDoubleClick={(e) => { e.stopPropagation(); onRename(p) }}
          title="Double-click to rename"
        >
          <span className="ol-title-icon"><Icon name="folder" size={16} fill /></span>
          <span className="ol-title-text" title={p.name}>{p.name}</span>
          {(ptags[p.id] || []).length > 0 && (
            <span className="ol-title-tags">
              {(ptags[p.id] || []).map((t) => (
                <span className="ol-pill" key={t}>{t}</span>
              ))}
            </span>
          )}
        </td>
        <td className="ol-col-owner">You</td>
        <td className="ol-col-date">{relTime(p.updated_at)}</td>
        <td className="ol-col-actions" onClick={(e) => e.stopPropagation()}>
          {inTrash ? (
            <>
              {rowAction('Restore', 'unarchive', () => setTrashedMany([p.id], false))}
              {rowAction('Delete forever', 'trash', () => onDelete(p), 'danger')}
            </>
          ) : (
            <>
              {rowAction('Make a copy', 'copy', () => onCopy(p))}
              {rowAction('Download (.zip)', 'download', () => onDownload(p))}
              {rowAction('View PDF', 'pdf', () => onViewPdf(p))}
              {rowAction('Tags', 'tag', () => editTags(p))}
              {nav === 'archived'
                ? rowAction('Unarchive', 'unarchive', () => setArchivedMany([p.id], false))
                : rowAction('Archive', 'archive', () => setArchivedMany([p.id], true))}
              {rowAction('Delete', 'trash', () => setTrashedMany([p.id], true), 'danger')}
            </>
          )}
        </td>
      </tr>
    )
  }

  const selectedIdsArr = visible.filter((p) => selected.has(p.id)).map((p) => p.id)

  return (
    <div className="home">
      <header className="ol-header">
        <div className="ol-brand">
          <span className="ol-logo"><Icon name="leaf" size={26} fill /></span>
          <span className="ol-brand-name">{BRAND}</span>
          <span className="ol-badge">Digital Science</span>
        </div>
        <nav className="ol-topnav">
          <button className="ol-toplink">Product</button>
          <button className="ol-toplink">Solutions</button>
          <button className="ol-toplink">Templates</button>
          <button className="ol-toplink">Pricing</button>
        </nav>
        <div className="ol-topright">
          <button className="ol-nav-icon" onClick={onToggleTheme} title="Toggle theme" aria-label="Toggle theme">
            {theme === 'light' ? '☾' : '☀'}
          </button>
          <button className="ol-account" title="Account">
            <span className="ol-avatar">L</span>
            <Icon name="chevron" size={14} />
          </button>
        </div>
      </header>

      <div className="ol-body">
        <aside className="ol-sidebar">
          <div className="ol-side-group">
            {NAV.map((n) => (
              <button
                key={n.id}
                className={`ol-side-link${nav === n.id ? ' active' : ''}`}
                onClick={() => setNav(n.id)}
              >
                {n.label}
              </button>
            ))}
            <button className="ol-side-link ol-newtag" onClick={addTag}>+ New tag</button>
            {tags.map((t) => (
              <button
                key={t}
                className={`ol-side-link ol-tag-link${nav === `tag:${t}` ? ' active' : ''}`}
                onClick={() => setNav(`tag:${t}`)}
                title={t}
              >
                <span className="ol-tag-dot" />
                <span className="ol-tag-name">{t}</span>
              </button>
            ))}
          </div>

          <div className="ol-side-group ol-side-lower">
            <button className={`ol-side-link${nav === 'library' ? ' active' : ''}`} onClick={() => setNav('library')}>
              Library
            </button>
            <button className={`ol-side-link${nav === 'trash' ? ' active' : ''}`} onClick={() => setNav('trash')}>
              Trash
            </button>
          </div>

          <div className="ol-side-foot">
            <button className="ol-side-link">Account</button>
            <button className="ol-side-link">Help</button>
          </div>
        </aside>

        <main className="ol-content">
          <div className="ol-toolbar">
            <h1 className="ol-h1">{heading}</h1>
            <span className="ol-plan">Free</span>
            <button className="ol-upgrade" onClick={() => window.alert('Upgrade is not available in this local build.')}>
              Upgrade
            </button>
            <div className="ol-search">
              <Icon name="search" size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search in all projects…"
                aria-label="Search projects"
              />
            </div>
            <div className="ol-newproject">
              <button className="ol-btn-green" onClick={() => setNewOpen((v) => !v)} disabled={busy || nav === 'trash'}>
                <span className="ol-plus">+</span> New project
              </button>
              {newOpen && (
                <>
                  <div className="ol-menu-backdrop" onClick={() => setNewOpen(false)} />
                  <div className="ol-newproject-menu">
                    <button onClick={() => { setNewOpen(false); setError(''); setName(''); setCreating(true) }}>
                      Blank project
                    </button>
                    <button onClick={createExample}>Example project</button>
                    <button onClick={() => { setNewOpen(false); fileRef.current?.click() }}>
                      Upload project
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {error && <div className="ol-error">{error}</div>}

          {selectedIdsArr.length > 0 && (
            <div className="ol-bulkbar">
              <span>{selectedIdsArr.length} selected</span>
              {nav !== 'trash' && (
                <>
                  <button onClick={() => { setArchivedMany(selectedIdsArr, true); setSelected(new Set()) }}>Archive</button>
                  <button onClick={() => { setTrashedMany(selectedIdsArr, true); setSelected(new Set()) }}>Move to Trash</button>
                </>
              )}
              {nav === 'trash' && (
                <button className="danger" onClick={() => { selectedIdsArr.forEach((id) => { const p = projects.find((x) => x.id === id); if (p) onDelete(p) }); setSelected(new Set()) }}>
                  Delete forever
                </button>
              )}
              <button onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}

          {visible.length === 0 ? (
            <div className="ol-empty">
              <div className="ol-empty-icon"><Icon name="folder" size={60} fill /></div>
              <h2>
                {nav === 'shared'
                  ? 'Nothing shared with you'
                  : nav === 'library'
                    ? 'Your library is empty'
                    : nav === 'trash'
                      ? 'Trash is empty'
                      : nav === 'archived'
                        ? 'No archived projects'
                        : projects.length === 0
                          ? 'Create your first project'
                          : 'No projects match your search'}
              </h2>
              <p>
                {nav === 'all' && projects.length === 0
                  ? 'Start from a blank project, use an example, or upload a .zip / .tex file.'
                  : nav === 'all'
                    ? 'Try a different search term.'
                    : ''}
              </p>
              {nav === 'all' && projects.length === 0 && (
                <button className="ol-btn-green" onClick={() => setCreating(true)}><span className="ol-plus">+</span> New project</button>
              )}
            </div>
          ) : (
            <div className="ol-tablewrap">
              <table className="ol-table">
                <thead>
                  <tr>
                    <th className="ol-col-check">
                      <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all" />
                    </th>
                    <th className="ol-col-title">Title</th>
                    <th className="ol-col-owner">Owner</th>
                    <th className="ol-col-date">Last modified</th>
                    <th className="ol-col-actions" />
                  </tr>
                </thead>
                <tbody>{visible.map(renderRow)}</tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      <input ref={fileRef} type="file" accept=".zip,.tex" hidden onChange={onFile} />

      {creating && (
        <div className="ol-overlay" onClick={() => setCreating(false)}>
          <form className="ol-dialog" onClick={(e) => e.stopPropagation()} onSubmit={submitNew_name}>
            <div className="ol-dialog-head">
              <span>New project</span>
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
