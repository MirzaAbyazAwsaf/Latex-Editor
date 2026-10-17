const JSON_HEADERS = { 'Content-Type': 'application/json' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const RETRY_STATUS = new Set([502, 503, 504])

async function req(url, options = {}, { retries = 2 } = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const idempotent = method === 'GET' || method === 'HEAD'
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, options)
      if (res.ok) return res.json()
      if (RETRY_STATUS.has(res.status) && attempt < retries) {
        await sleep(300 * (attempt + 1))
        continue
      }
      let detail = res.statusText
      try {
        const body = await res.json()
        detail = body.detail || JSON.stringify(body)
      } catch {}
      throw new Error(`${res.status}: ${detail}`)
    } catch (e) {
      if (e.name === 'TypeError' && idempotent && attempt < retries) {
        await sleep(300 * (attempt + 1))
        continue
      }
      throw e
    }
  }
}

export const api = {
  listProjects: () => req('/api/projects'),
  createProject: (name) =>
    req('/api/projects', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ name }) }),
  importProject: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return req('/api/projects/import', { method: 'POST', body: fd })
  },
  patchProject: (id, body) =>
    req(`/api/projects/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) }),
  deleteProject: (id) => req(`/api/projects/${id}`, { method: 'DELETE' }),
  readFile: (id, path = 'main.tex') =>
    req(`/api/projects/${id}/files/content?path=${encodeURIComponent(path)}`),
  writeFile: (id, content, path = 'main.tex') =>
    req(`/api/projects/${id}/files/content?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ content }),
    }),
  getTree: (id) => req(`/api/projects/${id}/tree`),
  uploadFile: (id, file, dir = '') => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('dir', dir)
    return req(`/api/projects/${id}/upload`, { method: 'POST', body: fd })
  },
  rawUrl: (id, path) => `/api/projects/${id}/raw?path=${encodeURIComponent(path)}`,
  pdfUrl: (id, t = Date.now()) => `/api/projects/${id}/pdf?t=${t}`,
  exportUrl: (id) => `/api/projects/${id}/export.zip`,
  createFile: (id, path) =>
    req(`/api/projects/${id}/files`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ path }),
    }),
  createFolder: (id, path) =>
    req(`/api/projects/${id}/folders`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ path }),
    }),
  renameEntry: (id, fromPath, toPath) =>
    req(`/api/projects/${id}/files`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ from_path: fromPath, to_path: toPath }),
    }),
  deleteEntry: (id, path) =>
    req(`/api/projects/${id}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
  listTrash: (id) => req(`/api/projects/${id}/trash`),
  restoreTrash: (id, trashId) =>
    req(`/api/projects/${id}/trash/${trashId}/restore`, { method: 'POST' }),
  purgeTrash: (id, trashId) =>
    req(`/api/projects/${id}/trash/${trashId}`, { method: 'DELETE' }),
  emptyTrash: (id) => req(`/api/projects/${id}/trash/empty`, { method: 'POST' }),
  compile: (id) => req(`/api/projects/${id}/compile`, { method: 'POST' }),
  synctexView: (id, file, line) =>
    req(`/api/projects/${id}/synctex/view?file=${encodeURIComponent(file)}&line=${line}`),
  synctexEdit: (id, page, x, y) =>
    req(`/api/projects/${id}/synctex/edit?page=${page}&x=${x}&y=${y}`),
  aiModels: () => req('/api/ai/models'),
  aiSettings: () => req('/api/ai/settings'),
  saveAiSettings: (body) =>
    req('/api/ai/settings', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(body) }),
}

export function streamAi(body, { onToken, onError, onDone }) {
  const ctrl = new AbortController()
  fetch('/api/ai/chat', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    signal: ctrl.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        let detail = res.statusText
        try {
          detail = (await res.json()).detail || detail
        } catch {}
        throw new Error(detail)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop()
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          try {
            const ev = JSON.parse(line.slice(5).trim())
            if (ev.type === 'token') onToken(ev.text)
            else if (ev.type === 'error') onError(ev.message)
            else if (ev.type === 'done') onDone()
          } catch {}
        }
      }
      onDone()
    })
    .catch((e) => {
      if (e.name !== 'AbortError') onError(e.message)
    })
  return ctrl
}
