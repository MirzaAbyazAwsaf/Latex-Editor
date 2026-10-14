import { useEffect, useRef, useState } from 'react'

export default function MenuBar({ title, onRenameTitle, menus = [], children }) {
  const [open, setOpen] = useState(null)
  const barRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (barRef.current && barRef.current.contains(e.target)) return
      setOpen(null)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  return (
    <header className="menubar" ref={barRef}>
      <div className="menubar-left">
        <span className="logo">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
            <path d="M14 4v4h4" />
          </svg>
        </span>
        {menus.map((m) => (
          <div className="menu-wrap" key={m.label}>
            <button
              className={`menu-btn${open === m.label ? ' open' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(open === m.label ? null : m.label)
              }}
            >
              {m.label}
            </button>
            {open === m.label && (
              <div className="menu-drop" onClick={(e) => e.stopPropagation()}>
                {m.items.map((it, i) =>
                  it.sep ? (
                    <div className="menu-sep" key={`sep-${i}`} />
                  ) : (
                    <button
                      key={it.label}
                      className="menu-item"
                      disabled={it.disabled}
                      onClick={() => {
                        setOpen(null)
                        it.onClick?.()
                      }}
                    >
                      <span>{it.label}</span>
                      {it.hint && <span className="menu-hint">{it.hint}</span>}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <button className="menubar-title" onClick={onRenameTitle} title="Rename project">
        {title}
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div className="menubar-right">{children}</div>
    </header>
  )
}
