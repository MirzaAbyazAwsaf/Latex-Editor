import { useMemo } from 'react'

const LEVEL = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
}

export default function Outline({ doc, onJump }) {
  const headings = useMemo(() => {
    const out = []
    if (!doc) return out
    const re = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\{([^}]*)\}/g
    let m
    while ((m = re.exec(doc)) !== null) {
      const line = doc.slice(0, m.index).split('\n').length
      out.push({ level: LEVEL[m[1]] ?? 2, title: m[2].trim() || '(untitled)', line })
    }
    return out
  }, [doc])

  return (
    <div className="outline">
      <div className="outline-header">
        <span className="tree-title">Outline</span>
      </div>
      <div className="outline-body">
        {headings.length === 0 ? (
          <div className="tree-empty">No sections yet</div>
        ) : (
          headings.map((h, i) => (
            <button
              key={`${h.line}-${i}`}
              className="outline-item"
              style={{ paddingLeft: 10 + h.level * 12 }}
              onClick={() => onJump(h.line)}
              title={h.title}
            >
              {h.title}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
