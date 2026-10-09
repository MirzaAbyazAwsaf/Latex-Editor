import { useEffect, useRef } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { StreamLanguage } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { SLASH_COMMANDS } from '../slashCommands'

function slashCompletionSource(context) {
  const word = context.matchBefore(/\/\w*/)
  if (!word || (word.from === word.to && !context.explicit)) return null
  return {
    from: word.from,
    options: SLASH_COMMANDS.map((cmd) => ({
      label: cmd.label,
      detail: cmd.detail,
      type: 'keyword',
      apply: (view, completion, from, to) => {
        if (cmd.aiAction) {
          view.dispatch({ changes: { from, to, insert: '' } })
          handlers.current.onAiAction?.(cmd.aiAction)
          return
        }
        const text = cmd.insert.replace('${}', '')
        const cursorOffset = cmd.insert.indexOf('${}')
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + (cursorOffset === -1 ? text.length : cursorOffset) },
        })
      },
    })),
  }
}

export default function Editor({ doc, onChange, onSave, onCompile, onAiAction, onReady }) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)
  const handlers = useRef({ onChange, onSave, onCompile, onAiAction })
  handlers.current = { onChange, onSave, onCompile, onAiAction }
  const loadedRef = useRef(null)

  useEffect(() => {
    const completion = autocompletion({
      override: [slashCompletionSource],
      activateOnTyping: true,
      icons: false,
    })

    const state = EditorState.create({
      doc: doc ?? '',
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        StreamLanguage.define(stex),
        completion,
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              handlers.current.onSave()
              return true
            },
          },
          {
            key: 'Mod-Enter',
            run: () => {
              handlers.current.onCompile()
              return true
            },
          },
          {
            key: '/',
            run: (view) => {
              const r = EditorView.autocomplete(view)
              if (!r) {
                view.dispatch(view.state.replaceSelection('/'))
                EditorView.autocomplete(view)
                return true
              }
              return false
            },
          },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && loadedRef.current === 'ready') {
            handlers.current.onChange(update.state.doc.toString())
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px' },
          '.cm-scroller': { fontFamily: "'Cascadia Code', Consolas, monospace" },
          '.cm-content': { paddingBottom: '40vh' },
        }),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    loadedRef.current = 'ready'
    onReady?.(view)

    return () => {
      view.destroy()
      viewRef.current = null
      loadedRef.current = null
    }
  }, [])

  // External doc load (project switch / file open)
  useEffect(() => {
    const view = viewRef.current
    if (!view || doc == null) return
    if (view.state.doc.toString() === doc) return
    loadedRef.current = 'loading'
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: doc },
      selection: { anchor: Math.min(view.state.selection.main.anchor, doc.length) },
    })
    loadedRef.current = 'ready'
  }, [doc])

  return <div ref={containerRef} className="editor-host" />
}
