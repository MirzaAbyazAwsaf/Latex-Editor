const Undo = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </svg>
)
const Redo = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" />
  </svg>
)

export default function EditorTabBar({ path, onUndo, onRedo, onBold, onItalic, onUnderline, onCode }) {
  return (
    <div className="editor-tabbar">
      <div className="editor-tab">
        <span className="tab-file-icon">TeX</span>
        {path}
      </div>
      <div className="editor-format">
        <button className="fmt-btn" title="Undo (Ctrl+Z)" onClick={onUndo}><Undo /></button>
        <button className="fmt-btn" title="Redo (Ctrl+Y)" onClick={onRedo}><Redo /></button>
        <span className="fmt-sep" />
        <button className="fmt-btn fw-bold" title="Bold (\textbf)" onClick={onBold}>B</button>
        <button className="fmt-btn fst-italic" title="Italic (\textit)" onClick={onItalic}>I</button>
        <button className="fmt-btn fst-under" title="Underline (\underline)" onClick={onUnderline}>U</button>
        <button className="fmt-btn" title="Code (\texttt)" onClick={onCode}>&lt;/&gt;</button>
      </div>
    </div>
  )
}
