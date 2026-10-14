import { useState } from 'react'
import { api } from '../api'

export default function AiSettings({ settings, onClose, onSaved }) {
  const [provider, setProvider] = useState(settings.provider)
  const [model, setModel] = useState(settings.model || '')
  const [url, setUrl] = useState(settings.url || '')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const meta = settings.providers.find((p) => p.id === provider) || { requires_key: false }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const body = {
        provider,
        model: model.trim() || null,
        url: url.trim() || null,
      }
      if (meta.requires_key) body.api_key = apiKey.trim() ? apiKey.trim() : null
      const next = await api.saveAiSettings(body)
      onSaved(next)
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal ai-settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">AI settings</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          <label className="field">
            <span className="field-label">Provider</span>
            <select
              className="engine-select"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value)
                setModel('')
                setUrl('')
                setApiKey('')
              }}
            >
              {settings.providers.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Model</span>
            <input
              className="field-input"
              value={model}
              placeholder={settings.model}
              onChange={(e) => setModel(e.target.value)}
              spellCheck={false}
            />
          </label>

          <label className="field">
            <span className="field-label">{provider === 'ollama' ? 'Ollama URL' : 'API base URL'}</span>
            <input
              className="field-input"
              value={url}
              placeholder={settings.url}
              onChange={(e) => setUrl(e.target.value)}
              spellCheck={false}
            />
          </label>

          {meta.requires_key && (
            <label className="field">
              <span className="field-label">API key</span>
              <input
                type="password"
                className="field-input"
                value={apiKey}
                placeholder={settings.has_key ? '•••••••• (saved — leave blank to keep)' : 'Paste your API key'}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
              <span className="field-hint">
                Stored locally on this machine (gitignored). Only sent to the selected provider.
              </span>
            </label>
          )}

          {error && <div className="settings-error">{error}</div>}
        </div>

        <div className="modal-foot">
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
