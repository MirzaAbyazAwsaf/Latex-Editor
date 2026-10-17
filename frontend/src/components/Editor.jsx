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
  startCompletion,
} from '@codemirror/autocomplete'
import { bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { StreamLanguage } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { tags as tg } from '@lezer/highlight'
import { SLASH_COMMANDS } from '../slashCommands'

const themeCompartment = new Compartment()

function editorTheme(light) {
  const bg = light ? '#ffffff' : '#1b222c'
  const fg = light ? '#1f2733' : '#e6edf3'
  const sel = light ? '#bcd3f7' : '#2e4a66'
  const match = light ? '#2f6fed33' : '#7aa2f740'
  const brk = light ? '#2f6fed' : '#7aa2f7'
  return EditorView.theme(
    {
      '&': { height: '100%', fontSize: '14px', backgroundColor: bg, color: fg },
      '.cm-scroller': { fontFamily: "'Cascadia Code', Consolas, monospace" },
      '.cm-content': { paddingBottom: '40vh', caretColor: fg },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: fg },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: sel,
      },
      '.cm-selectionMatch': { backgroundColor: match },
      '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
        backgroundColor: match,
        outline: `1px solid ${brk}`,
      },
    },
    { dark: !light },
  )
}

function highlightFor(light) {
  const c = light
    ? {
        keyword: '#a626a4',
        comment: '#8a94a6',
        string: '#50a14f',
        special: '#c18401',
        number: '#986801',
        operator: '#0184bc',
        tag: '#4078f2',
        type: '#c18401',
        variable: '#1f2733',
      }
    : {
        keyword: '#c792ea',
        comment: '#7c8b9a',
        string: '#c3e88d',
        special: '#f78c6c',
        number: '#f78c6c',
        operator: '#89ddff',
        tag: '#82aaff',
        type: '#ffcb6b',
        variable: '#e6edf3',
      }
  return HighlightStyle.define([
    { tag: tg.keyword, color: c.keyword },
    { tag: tg.controlKeyword, color: c.keyword },
    { tag: tg.comment, color: c.comment, fontStyle: 'italic' },
    { tag: tg.lineComment, color: c.comment, fontStyle: 'italic' },
    { tag: tg.blockComment, color: c.comment, fontStyle: 'italic' },
    { tag: tg.string, color: c.string },
    { tag: tg.special(tg.string), color: c.special },
    { tag: tg.number, color: c.number },
    { tag: tg.bool, color: c.number },
    { tag: tg.operator, color: c.operator },
    { tag: tg.bracket, color: c.operator },
    { tag: tg.squareBracket, color: c.operator },
    { tag: tg.brace, color: c.operator },
    { tag: tg.tagName, color: c.tag },
    { tag: tg.typeName, color: c.type },
    { tag: tg.attributeName, color: c.type },
    { tag: tg.meta, color: c.type },
    { tag: tg.variableName, color: c.variable },
    { tag: tg.definition(tg.variableName), color: c.tag },
  ])
}

function themeExtension(light) {
  return [editorTheme(light), syntaxHighlighting(highlightFor(light))]
}

function slashCompletionSource(context) {
  const word = context.matchBefore(/\/[\w*-]*/)
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
      const m = cmd.insert.match(/\$\{([^}]*)\}/)
      let text = cmd.insert
      let selFrom = cmd.insert.length
      let selTo = cmd.insert.length
      if (m) {
        const before = cmd.insert.slice(0, m.index)
        const after = cmd.insert.slice(m.index + m[0].length)
        text = before + m[1] + after
        selFrom = before.length
        selTo = before.length + m[1].length
      }
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + selFrom, head: from + selTo },
      })
    },
  }))
  return { from: word.from, options }
}

export default function Editor({ doc, theme = 'dark', onChange, onSave, onCompile, onAiAction, onInsertImage, onSelection, onReady }) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)
  const handlers = useRef({ onChange, onSave, onCompile, onAiAction, onInsertImage, onSelection })
  handlers.current = { onChange, onSave, onCompile, onAiAction, onInsertImage, onSelection }
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
          if ((update.selectionSet || update.docChanged) && loadedRef.current === 'ready') {
            const sel = update.state.selection.main
            const text = sel.empty ? '' : update.state.sliceDoc(sel.from, sel.to)
            handlers.current.onSelection?.(text)
          }
        }),
        themeCompartment.of(themeExtension(theme === 'light')),
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

  // Reconfigure theme on change
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: themeCompartment.reconfigure(themeExtension(theme === 'light')) })
  }, [theme])

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
