import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'

function fmtSize(n) {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function TrashPanel({ projectId, onClose, onChanged }) {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems(await api.listTrash(projectId))
    } catch (e) {
      alert('Could not load recycle bin: ' + e.message)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const restore = async (id) => {
    setBusy(true)
    try {
      await api.restoreTrash(projectId, id)
      await load()
      onChanged?.()
    } catch (e) {
      alert('Restore failed: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  const purge = async (id) => {
    if (!window.confirm('Delete permanently? This cannot be undone.')) return
    setBusy(true)
    try {
      await api.purgeTrash(projectId, id)
      await load()
    } catch (e) {
      alert('Delete failed: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  const empty = async () => {
    if (!items.length) return
    if (!window.confirm('Permanently delete all items in the recycle bin?')) return
    setBusy(true)
    try {
      await api.emptyTrash(projectId)
      await load()
    } catch (e) {
      alert('Empty failed: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal trash-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Recycle Bin</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {items.length === 0 ? (
          <div className="picker-empty">The recycle bin is empty.</div>
        ) : (
          <div className="trash-list">
            {items.map((it) => (
              <div className="trash-row" key={it.id}>
                <span className="trash-icon">{it.kind === 'folder' ? '▣' : '▤'}</span>
                <span className="trash-name" title={it.original_path}>{it.original_path}</span>
                <span className="trash-size">{it.kind === 'folder' ? '—' : fmtSize(it.size)}</span>
                <button className="btn" disabled={busy} onClick={() => restore(it.id)}>Restore</button>
                <button className="btn danger" disabled={busy} onClick={() => purge(it.id)}>Delete</button>
              </div>
            ))}
          </div>
        )}

        <div className="modal-foot">
          <button className="btn danger" disabled={busy || !items.length} onClick={empty}>
            Empty recycle bin
          </button>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
