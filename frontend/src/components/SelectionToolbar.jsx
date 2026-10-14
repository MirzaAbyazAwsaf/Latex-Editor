export default function SelectionToolbar({ visible, onAction }) {
  if (!visible) return null
  return (
    <div className="selection-toolbar">
      <span className="sel-label">Selection:</span>
      <button onClick={() => onAction('rewrite')}>Rewrite</button>
      <button onClick={() => onAction('shorten')}>Shorten</button>
      <button onClick={() => onAction('grammar')}>Fix grammar</button>
      <button onClick={() => onAction('explain')}>Explain</button>
    </div>
  )
}
