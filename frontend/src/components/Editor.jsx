import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
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
  startCompletion,
} from '@codemirror/autocomplete'
import { bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { StreamLanguage } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { tags as tg } from '@lezer/highlight'
import { SLASH_COMMANDS } from '../slashCommands'

const EDITOR_BG = '#1b222c'
const EDITOR_FG = '#e6edf3'

const latexTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '14px',
      backgroundColor: EDITOR_BG,
      color: EDITOR_FG,
    },
    '.cm-scroller': { fontFamily: "'Cascadia Code', Consolas, monospace" },
    '.cm-content': {
      paddingBottom: '40vh',
      caretColor: EDITOR_FG,
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: EDITOR_FG },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#2e4a66',
    },
    '.cm-selectionMatch': { backgroundColor: '#7aa2f740' },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: '#7aa2f740',
      outline: '1px solid #7aa2f7',
    },
  },
  { dark: true },
)

const latexHighlight = HighlightStyle.define([
  { tag: tg.keyword, color: '#c792ea' },
  { tag: tg.controlKeyword, color: '#c792ea' },
  { tag: tg.comment, color: '#7c8b9a', fontStyle: 'italic' },
  { tag: tg.lineComment, color: '#7c8b9a', fontStyle: 'italic' },
  { tag: tg.blockComment, color: '#7c8b9a', fontStyle: 'italic' },
  { tag: tg.string, color: '#c3e88d' },
  { tag: tg.special(tg.string), color: '#f78c6c' },
  { tag: tg.number, color: '#f78c6c' },
  { tag: tg.bool, color: '#f78c6c' },
  { tag: tg.operator, color: '#89ddff' },
  { tag: tg.bracket, color: '#89ddff' },
  { tag: tg.squareBracket, color: '#89ddff' },
  { tag: tg.brace, color: '#89ddff' },
  { tag: tg.tagName, color: '#82aaff' },
  { tag: tg.typeName, color: '#ffcb6b' },
  { tag: tg.attributeName, color: '#ffcb6b' },
  { tag: tg.meta, color: '#ffcb6b' },
  { tag: tg.variableName, color: EDITOR_FG },
  { tag: tg.definition(tg.variableName), color: '#82aaff' },
])

function slashCompletionSource(context) {
  const word = context.matchBefore(/\/[\w-]*/)
  if (!word || (word.from === word.to && !context.explicit)) return null
  const query = word.text.slice(1).toLowerCase()
  const options = SLASH_COMMANDS.filter((cmd) => {
    if (!query) return true
    if (cmd.label.slice(1).toLowerCase().includes(query)) return true
    return (cmd.keywords || []).some((k) => k.toLowerCase().includes(query))
  }).map((cmd) => ({
    label: cmd.label,
    detail: cmd.detail,
    type: cmd.type || 'keyword',
    boost: cmd.boost || 0,
    apply: (view, completion, from, to) => {
      if (cmd.pickImage) {
        view.dispatch({ changes: { from, to, insert: '' } })
        handlers.current.onInsertImage?.()
        return
      }
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
  }))
  return { from: word.from, options }
}

export default function Editor({ doc, onChange, onSave, onCompile, onAiAction, onInsertImage, onReady }) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)
  const handlers = useRef({ onChange, onSave, onCompile, onAiAction, onInsertImage })
  handlers.current = { onChange, onSave, onCompile, onAiAction, onInsertImage }
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
        EditorView.lineWrapping,
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        syntaxHighlighting(latexHighlight),
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
              view.dispatch(view.state.replaceSelection('/'))
              startCompletion(view)
              return true
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
        latexTheme,
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
