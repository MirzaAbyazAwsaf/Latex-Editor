import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const BASE_SCALE = 1.5

export default function PdfViewer({ pdfUrl, onRecompile, compiling }) {
  const scrollRef = useRef(null)
  const docRef = useRef(null)
  const pageRef = useRef(1)
  const [status, setStatus] = useState('idle')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [invert, setInvert] = useState(false)

  useEffect(() => {
    pageRef.current = page
  }, [page])

  useEffect(() => {
    const container = scrollRef.current
    if (!pdfUrl) {
      docRef.current = null
      setStatus('idle')
      setTotal(0)
      if (container) container.innerHTML = ''
      return
    }
    let cancelled = false
    setStatus('loading')
    const task = pdfjs.getDocument({ url: pdfUrl })
    task.promise
      .then((doc) => {
        if (cancelled) return
        docRef.current = doc
        setPage(1)
        setTotal(doc.numPages)
        setStatus('ready')
      })
      .catch((e) => {
        if (!cancelled) setStatus('error: ' + e.message)
      })
    return () => {
      cancelled = true
      task.destroy?.().catch(() => {})
      docRef.current = null
    }
  }, [pdfUrl])

  useEffect(() => {
    const doc = docRef.current
    const container = scrollRef.current
    if (status !== 'ready' || !doc || !container) return
    let cancelled = false
    container.innerHTML = ''

    const render = async () => {
      for (let n = 1; n <= doc.numPages; n++) {
        if (cancelled) return
        let pdfPage
        try {
          pdfPage = await doc.getPage(n)
        } catch {
          return
        }
        const viewport = pdfPage.getViewport({ scale: BASE_SCALE * zoom })
        const canvas = document.createElement('canvas')
        canvas.dataset.page = String(n)
        canvas.setAttribute('role', 'img')
        canvas.setAttribute('aria-label', `Page ${n}`)
        canvas.width = viewport.width
        canvas.height = viewport.height
        container.appendChild(canvas)
        try {
          await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
        } catch {
          return
        }
      }
      if (cancelled) return
      const target = container.querySelector(`canvas[data-page="${pageRef.current}"]`)
      if (target) container.scrollTop = target.offsetTop
    }
    render()
    return () => {
      cancelled = true
    }
  }, [status, total, zoom])

  const onScroll = () => {
    const c = scrollRef.current
    if (!c) return
    const mid = c.scrollTop + c.clientHeight / 2
    const canvases = c.querySelectorAll('canvas')
    for (const cv of canvases) {
      if (cv.offsetTop <= mid && mid < cv.offsetTop + cv.offsetHeight) {
        setPage(Number(cv.dataset.page))
        break
      }
    }
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        {onRecompile && (
          <button className="pdf-recompile" onClick={onRecompile} disabled={compiling} title="Recompile">
            {compiling ? '…' : '▶'} Recompile
          </button>
        )}
        <span className="pdf-page-ind">Page {total ? page : '-'} / {total || '-'}</span>

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
      <div
        className={`pdf-scroll${invert ? ' invert' : ''}`}
        ref={scrollRef}
        onScroll={onScroll}
      >
        {!pdfUrl && <div className="pdf-placeholder">Compile to see the PDF</div>}
      </div>
    </div>
  )
}
