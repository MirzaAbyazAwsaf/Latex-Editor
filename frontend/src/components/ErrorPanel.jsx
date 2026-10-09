export default function ErrorPanel({ errors, onJump }) {
  if (!errors || errors.length === 0) {
    return <div className="panel-empty">No errors. Compile to check.</div>
  }
  return (
    <ul className="error-list">
      {errors.map((e, i) => (
        <li key={i} onClick={() => e.line && onJump(e.line)} className={e.line ? 'clickable' : ''}>
          <span className="error-loc">{e.file}{e.line ? `:${e.line}` : ''}</span>
          <span className="error-msg">{e.message}</span>
        </li>
      ))}
    </ul>
  )
}
