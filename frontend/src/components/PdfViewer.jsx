import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

export default function PdfViewer({ pdfUrl }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const scrollRatioRef = useRef(0)
  const taskRef = useRef(null)

  useEffect(() => {
    if (!pdfUrl || !canvasRef.current) return
    let cancelled = false

    const scrollEl = wrapRef.current
    if (scrollEl && scrollEl.scrollHeight > scrollEl.clientHeight) {
      scrollRatioRef.current = scrollEl.scrollTop / scrollEl.scrollHeight
    }

    setStatus('loading')
    const task = pdfjs.getDocument({ url: pdfUrl + '?t=' + Date.now() })
    taskRef.current = task

    task.promise
      .then(async (doc) => {
        if (cancelled) return
        setTotal(doc.numPages)
        const p = Math.min(page, doc.numPages)
        const pdfPage = await doc.getPage(p)
        const viewport = pdfPage.getViewport({ scale: 1.5 })
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
  }, [pdfUrl])

  const goPage = async (n) => {
    if (n < 1 || n > total) return
    setPage(n)
    // re-render trigger via pdfUrl not changing: manual reload
    if (!pdfUrl) return
    try {
      const doc = await pdfjs.getDocument({ url: pdfUrl + '?t=' + Date.now() }).promise
      const pdfPage = await doc.getPage(n)
      const viewport = pdfPage.getViewport({ scale: 1.5 })
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
        <button onClick={() => goPage(page - 1)} disabled={page <= 1}>‹</button>
        <span className="pdf-page-ind">Page {total ? page : '-'} / {total || '-'}</span>
        <button onClick={() => goPage(page + 1)} disabled={page >= total}>›</button>
        {status === 'loading' && <span className="pdf-status">Rendering…</span>}
        {status.startsWith('error') && <span className="pdf-status error">{status}</span>}
      </div>
      <div className="pdf-scroll" ref={wrapRef}>
        {!pdfUrl && <div className="pdf-placeholder">Compile to see the PDF</div>}
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
