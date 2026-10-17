function Icon({ name }) {
  const p = {
    files: <><path d="M4 4h6l2 2h8v14H4z" /></>,
    outline: <><path d="M4 6h2M4 12h2M4 18h2" /><path d="M9 6h11M9 12h11M9 18h11" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></>,
    share: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="m8 11 8-4M8 13l8 4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></>,
    moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></>,
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {p[name]}
    </svg>
  )
}

export default function NavStrip({ filesOpen, outlineOpen, onToggleFiles, onToggleOutline, onHistory, onShare, theme, onToggleTheme }) {
  const dark = theme !== 'light'
  return (
    <nav className="nav-strip">
      <button className={`nav-btn${filesOpen ? ' active' : ''}`} title="Files" onClick={onToggleFiles}>
        <Icon name="files" />
      </button>
      <button className={`nav-btn${outlineOpen ? ' active' : ''}`} title="Outline" onClick={onToggleOutline}>
        <Icon name="outline" />
      </button>
      <button className="nav-btn" title="History" onClick={onHistory}>
        <Icon name="history" />
      </button>
      <button className="nav-btn" title="Share" onClick={onShare}>
        <Icon name="share" />
      </button>
      <div className="nav-spacer" />
      <button
        className="nav-btn"
        title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={onToggleTheme}
      >
        <Icon name={dark ? 'sun' : 'moon'} />
      </button>
    </nav>
  )
}
