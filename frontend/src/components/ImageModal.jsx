import { useEffect } from 'react'

function useEscape(onClose) {
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}

export function ImagePreview({ path, name, url, onClose, onInsert }) {
  useEscape(onClose)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal image-preview" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{name}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="image-stage">
          <img src={url} alt={name} />
        </div>
        <div className="modal-foot">
          <code className="path-code">{path}</code>
          <button className="btn primary" onClick={() => onInsert(path)}>Insert into document</button>
        </div>
      </div>
    </div>
  )
}

export function ImagePicker({ images, resolveUrl, onClose, onInsert }) {
  useEscape(onClose)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal image-picker" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Insert image</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {images.length === 0 ? (
          <div className="picker-empty">
            No images yet. Upload one from the Files panel, then insert it here.
          </div>
        ) : (
          <div className="picker-grid">
            {images.map((p) => (
              <button key={p} className="picker-item" onClick={() => onInsert(p)} title={p}>
                <img src={resolveUrl(p)} alt={p} />
                <span className="picker-name">{p}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
