import { useEffect, useRef, useState } from 'react'

function InlineInput({ defaultValue = '', placeholder, onCommit, onCancel }) {
  const ref = useRef(null)
  const done = useRef(false)
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const commit = () => {
    if (done.current) return
    done.current = true
    const v = value.trim()
    if (v) onCommit(v)
    else onCancel()
  }
  const cancel = () => {
    if (done.current) return
    done.current = true
    onCancel()
  }

  return (
    <input
      ref={ref}
      className="tree-input"
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancel()
        }
      }}
    />
  )
}

function icon(node) {
  if (node.kind === 'folder') return '▣'
  if (node.name.endsWith('.tex')) return 'TeX'
  if (node.name.endsWith('.bib')) return 'Bib'
  if (/\.(png|jpe?g|gif|svg|pdf)$/i.test(node.name)) return 'Img'
  return '·'
}

export default function FileTree({
  tree = [],
  activePath,
  mainFile,
  onOpen,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
  onSetMain,
  onUpload,
}) {
  const [menu, setMenu] = useState(null)
  const [creating, setCreating] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [collapsed, setCollapsed] = useState({})
  const [dragging, setDragging] = useState(false)
  const uploadParentRef = useRef('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menu])

  const pickUpload = (parent) => {
    setMenu(null)
    uploadParentRef.current = parent
    fileInputRef.current?.click()
  }

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length || !onUpload) return
    files.forEach((file) => onUpload(file, uploadParentRef.current))
  }

  const startCreate = (parent, kind) => {
    setMenu(null)
    setCreating({ parent, kind })
    if (parent) setCollapsed((c) => ({ ...c, [parent]: false }))
  }

  const commitCreate = (parent, kind, name) => {
    setCreating(null)
    const full = parent ? `${parent}/${name}` : name
    if (kind === 'folder') {
      onCreateFolder(full)
    } else {
      onCreateFile(full.includes('.') ? full : `${full}.tex`)
    }
  }

  const commitRename = (node, name) => {
    setRenaming(null)
    const parts = node.path.split('/')
    parts[parts.length - 1] = name
    const to = parts.join('/')
    if (to !== node.path) onRename(node.path, to)
  }

  const createRow = (parent, depth) => (
    <div className="tree-row tree-create" style={{ paddingLeft: 10 + depth * 14 }} key={`new-${parent}`}>
      <span className="tree-caret" />
      <span className="tree-icon">{creating.kind === 'folder' ? '▣' : 'TeX'}</span>
      <InlineInput
        placeholder={creating.kind === 'folder' ? 'folder name' : 'file name'}
        onCommit={(name) => commitCreate(parent, creating.kind, name)}
        onCancel={() => setCreating(null)}
      />
    </div>
  )

  const renderList = (nodes, depth, parent) => {
    const items = []
    if (creating && creating.parent === parent) items.push(createRow(parent, depth))
    nodes.forEach((node) => items.push(renderNode(node, depth)))
    if (nodes.length === 0 && !(creating && creating.parent === parent)) {
      items.push(
        <div className="tree-empty" style={{ paddingLeft: 10 + depth * 14 }} key={`empty-${parent}`}>
          empty
        </div>,
      )
    }
    return items
  }

  const renderNode = (node, depth) => {
    const isFolder = node.kind === 'folder'
    const isOpen = !collapsed[node.path]
    const isRenaming = renaming === node.path
    return (
      <div key={node.path}>
        <div
          className={`tree-row${activePath === node.path ? ' active' : ''}`}
          style={{ paddingLeft: 10 + depth * 14 }}
          onClick={() => (isFolder ? setCollapsed((c) => ({ ...c, [node.path]: isOpen })) : onOpen(node.path))}
        >
          <span className="tree-caret">{isFolder ? (isOpen ? '▾' : '▸') : ''}</span>
          <span className={`tree-icon i-${isFolder ? 'folder' : node.name.split('.').pop()}`}>{icon(node)}</span>
          {isRenaming ? (
            <InlineInput
              defaultValue={node.name}
              onCommit={(name) => commitRename(node, name)}
              onCancel={() => setRenaming(null)}
            />
          ) : (
            <span className="tree-name">{node.name}</span>
          )}
          {mainFile === node.path && <span className="tree-main">main</span>}
          <button
            className="tree-kebab"
            title="More"
            onClick={(e) => {
              e.stopPropagation()
              setMenu(menu === node.path ? null : node.path)
            }}
          >
            ⋯
          </button>
          {menu === node.path && (
            <div className="tree-menu" onClick={(e) => e.stopPropagation()}>
              {isFolder && (
                <>
                  <button onClick={() => startCreate(node.path, 'file')}>New file</button>
                  <button onClick={() => startCreate(node.path, 'folder')}>New folder</button>
                  <button onClick={() => pickUpload(node.path)}>Upload image…</button>
                  <div className="tree-menu-sep" />
                </>
              )}
              <button
                onClick={() => {
                  setMenu(null)
                  setRenaming(node.path)
                }}
              >
                Rename
              </button>
              {!isFolder && (
                <button
                  onClick={() => {
                    setMenu(null)
                    onSetMain(node.path)
                  }}
                >
                  Set as main
                </button>
              )}
              <button
                className="danger"
                onClick={() => {
                  setMenu(null)
                  onDelete(node)
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
        {isFolder && isOpen && <div className="tree-children">{renderList(node.children || [], depth + 1, node.path)}</div>}
      </div>
    )
  }

  return (
    <div className="file-tree">
      <div className="tree-header">
        <span className="tree-title">Files</span>
        <button
          className="tree-add"
          title="New…"
          onClick={(e) => {
            e.stopPropagation()
            setMenu(menu === '__header__' ? null : '__header__')
          }}
        >
          ＋
        </button>
      </div>

      {menu === '__header__' && (
        <div className="tree-menu header-menu" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => startCreate('', 'file')}>New file</button>
          <button onClick={() => startCreate('', 'folder')}>New folder</button>
          <button onClick={() => pickUpload('')}>Upload image…</button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />

      <div
        className={`tree-body${dragging ? ' drop-active' : ''}`}
        onDragOver={(e) => {
          if (!onUpload) return
          e.preventDefault()
          if (!dragging) setDragging(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget)) return
          setDragging(false)
        }}
        onDrop={(e) => {
          if (!onUpload) return
          e.preventDefault()
          setDragging(false)
          uploadParentRef.current = ''
          handleFiles(e.dataTransfer.files)
        }}
      >
        {renderList(tree, 0, '')}
      </div>
    </div>
  )
}
