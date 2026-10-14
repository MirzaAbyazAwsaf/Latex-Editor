import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const BASE_SCALE = 1.5

export default function PdfViewer({ pdfUrl, onRecompile, compiling }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [invert, setInvert] = useState(false)
  const scrollRatioRef = useRef(0)
  const taskRef = useRef(null)

  useEffect(() => {
    if (!pdfUrl) {
      setStatus('idle')
      setTotal(0)
      const canvas = canvasRef.current
      if (canvas) {
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }
    if (!canvasRef.current) return
    let cancelled = false

    const scrollEl = wrapRef.current
    if (scrollEl && scrollEl.scrollHeight > scrollEl.clientHeight) {
      scrollRatioRef.current = scrollEl.scrollTop / scrollEl.scrollHeight
    }

    setStatus('loading')
    const task = pdfjs.getDocument({ url: pdfUrl })
    taskRef.current = task

    task.promise
      .then(async (doc) => {
        if (cancelled) return
        setTotal(doc.numPages)
        const p = Math.min(page, doc.numPages)
        const pdfPage = await doc.getPage(p)
        const viewport = pdfPage.getViewport({ scale: BASE_SCALE * zoom })
        const canvas = canvasRef.current
        if (!canvas || cancelled) return
        const ctx = canvas.getContext('2d')
        canvas.width = viewport.width
        canvas.height = viewport.height
        await pdfPage.render({ canvasContext: ctx, viewport }).promise
        if (cancelled) return
        setStatus('ready')
        requestAnimationFrame(() => {
          if (scrollEl) scrollEl.scrollTop = scrollRatioRef.current * scrollEl.scrollHeight
        })
        doc.destroy?.()
      })
      .catch((e) => {
        if (!cancelled) setStatus('error: ' + e.message)
      })

    return () => {
      cancelled = true
      task.destroy?.().catch(() => {})
    }
  }, [pdfUrl, zoom])

  const goPage = async (n) => {
    if (n < 1 || n > total) return
    setPage(n)
    if (!pdfUrl) return
    try {
      const doc = await pdfjs.getDocument({ url: pdfUrl }).promise
      const pdfPage = await doc.getPage(n)
      const viewport = pdfPage.getViewport({ scale: BASE_SCALE * zoom })
      const canvas = canvasRef.current
      canvas.width = viewport.width
      canvas.height = viewport.height
      await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      doc.destroy?.()
    } catch {}
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        {onRecompile && (
          <button className="pdf-recompile" onClick={onRecompile} disabled={compiling} title="Recompile">
            {compiling ? '…' : '▶'} Recompile
          </button>
        )}
        <button onClick={() => goPage(page - 1)} disabled={page <= 1}>‹</button>
        <span className="pdf-page-ind">Page {total ? page : '-'} / {total || '-'}</span>
        <button onClick={() => goPage(page + 1)} disabled={page >= total}>›</button>

        <span className="pdf-toolbar-spacer" />

        <button
          className={`pdf-tool-btn${invert ? ' active' : ''}`}
          title="Invert colors"
          onClick={() => setInvert((v) => !v)}
        >
          ◐
        </button>
        {pdfUrl && (
          <a className="pdf-dl" href={pdfUrl} download="document.pdf" title="Download PDF">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <path d="m7 12 5 5 5-5" />
              <path d="M4 21h16" />
            </svg>
          </a>
        )}
        <select
          className="pdf-zoom"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          title="Zoom"
        >
          {ZOOMS.map((z) => (
            <option key={z} value={z}>{Math.round(z * 100)}%</option>
          ))}
        </select>

        {status === 'loading' && <span className="pdf-status">…</span>}
        {status.startsWith('error') && <span className="pdf-status error">{status}</span>}
      </div>
      <div className="pdf-scroll" ref={wrapRef}>
        {!pdfUrl && <div className="pdf-placeholder">Compile to see the PDF</div>}
        <canvas ref={canvasRef} className={invert ? 'invert' : ''} />
      </div>
    </div>
  )
}
