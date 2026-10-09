import { useEffect, useRef, useState } from 'react'
import { streamAi } from '../api'

export default function AiTerminal({ context, prefill, onApply, models, model, onModelChange }) {
  const [entries, setEntries] = useState([]) // {role:'user'|'ai'|'system', text, done?}
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [pending, setPending] = useState(null) // finished AI text awaiting accept/reject
  const ctrlRef = useRef(null)
  const logRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (prefill != null) {
      setInput(prefill)
      inputRef.current?.focus()
    }
  }, [prefill])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [entries])

  const send = () => {
    const instruction = input.trim()
    if (!instruction || streaming) return
    setInput('')
    setPending(null)
    setEntries((e) => [...e, { role: 'user', text: instruction }, { role: 'ai', text: '' }])
    setStreaming(true)

    let acc = ''
    ctrlRef.current = streamAi(
      { instruction, context: context || '', model },
      {
        onToken: (t) => {
          acc += t
          setEntries((e) => {
            const copy = [...e]
            copy[copy.length - 1] = { role: 'ai', text: acc }
            return copy
          })
        },
        onError: (msg) => {
          setStreaming(false)
          setEntries((e) => [...e, { role: 'system', text: 'Error: ' + msg }])
        },
        onDone: () => {
          setStreaming(false)
          setPending(acc)
        },
      },
    )
  }

  const stop = () => {
    ctrlRef.current?.abort()
    setStreaming(false)
  }

  const accept = () => {
    onApply(pending)
    setEntries((e) => [...e, { role: 'system', text: '✓ Applied to document' }])
    setPending(null)
  }

  const reject = () => {
    setEntries((e) => [...e, { role: 'system', text: '✗ Discarded' }])
    setPending(null)
  }

  return (
    <div className="ai-terminal">
      <div className="ai-log" ref={logRef}>
        {entries.length === 0 && (
          <div className="panel-empty">
            AI terminal — type an instruction.
            <br />
            Example: "add a table of contents" or "fix the error"
          </div>
        )}
        {entries.map((e, i) => (
          <div key={i} className={`ai-entry ${e.role}`}>
            <span className="ai-prompt-tag">
              {e.role === 'user' ? '❯' : e.role === 'ai' ? 'ai' : '·'}
            </span>
            <pre className="ai-text">{e.text}</pre>
          </div>
        ))}
        {streaming && <div className="ai-cursor">▍</div>}
      </div>

      {pending != null && !streaming && (
        <div className="ai-actions">
          <button className="btn primary" onClick={accept}>Apply</button>
          <button className="btn" onClick={reject}>Discard</button>
        </div>
      )}

      <div className="ai-input-row">
        <select value={model} onChange={(e) => onModelChange(e.target.value)} className="ai-model">
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
          {models.length === 0 && <option value={model}>{model}</option>}
        </select>
        <textarea
          ref={inputRef}
          className="ai-input"
          rows={2}
          placeholder="Instruction for the AI… (Enter to send, Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        {streaming ? (
          <button className="btn danger" onClick={stop}>Stop</button>
        ) : (
          <button className="btn primary" onClick={send} disabled={!input.trim()}>Send</button>
        )}
      </div>
    </div>
  )
}
