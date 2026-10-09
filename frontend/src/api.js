const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function req(url, options = {}) {
  const res = await fetch(url, options)
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || JSON.stringify(body)
    } catch {}
    throw new Error(`${res.status}: ${detail}`)
  }
  return res.json()
}

export const api = {
  listProjects: () => req('/api/projects'),
  createProject: (name) =>
    req('/api/projects', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ name }) }),
  patchProject: (id, body) =>
    req(`/api/projects/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) }),
  readFile: (id, path = 'main.tex') =>
    req(`/api/projects/${id}/files/content?path=${encodeURIComponent(path)}`),
  writeFile: (id, content, path = 'main.tex') =>
    req(`/api/projects/${id}/files/content?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ content }),
    }),
  compile: (id) => req(`/api/projects/${id}/compile`, { method: 'POST' }),
  aiModels: () => req('/api/ai/models'),
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
