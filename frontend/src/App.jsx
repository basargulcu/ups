import { useState, useEffect, useCallback, useRef, createRef } from 'react'
import Draggable from 'react-draggable'
import './App.css'

let idCounter = 0
let arrowCounter = 0
let subnoteCounter = 0

const URL_RE = /https?:\/\/[^\s]+/g

function renderWithLinks(text) {
  const parts = []
  let last = 0
  let m
  URL_RE.lastIndex = 0
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const url = m[0]
    parts.push(
      <a
        key={m.index}
        href={url}
        title="⌘+Click to open"
        onClick={e => { if (e.metaKey) { e.stopPropagation(); window.open(url, '_blank') } else { e.preventDefault() } }}
        className="text-link"
      >{url}</a>
    )
    last = m.index + url.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export default function App() {
  const [boxes, setBoxes] = useState([])
  const [positions, setPositions] = useState({})
  const [arrows, setArrows] = useState([])
  const [connecting, setConnecting] = useState(null)
  const [selectedBoxes, setSelectedBoxes] = useState(new Set())
  const [addingTo, setAddingTo] = useState(null)
  const [draft, setDraft] = useState('')
  const [editingNote, setEditingNote] = useState(null)
  const [editingSubnote, setEditingSubnote] = useState(null) // { boxId, subnoteId }
  const [showStartup, setShowStartup] = useState(true)
  const [backendDown, setBackendDown] = useState(false)
  const [selectionRect, setSelectionRect] = useState(null)
  const [expandedSubnotes, setExpandedSubnotes] = useState(new Set())
  const canvasRef = useRef(null)
  const loadInputRef = useRef(null)
  const draftRef = useRef(null)
  const fileHandleRef = useRef(null)
  const editRef = useRef(null)
  const subnoteEditRef = useRef(null)
  const wasDraggedRef = useRef(false)
  const suppressCanvasClickRef = useRef(false)
  const backendFileRef = useRef(null)

  const handlePaste = useCallback((e) => {
    if (addingTo || editingNote || editingSubnote) return
    const text = e.clipboardData?.getData('text')
    if (!text?.trim()) return
    e.preventDefault()

    const canvas = canvasRef.current.getBoundingClientRect()
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const newBoxes = []
    const newPositions = {}
    for (const line of lines) {
      const id = ++idCounter
      const x = 40 + ((id - 1) * 24) % Math.max(canvas.width - 320, 40)
      const y = 40 + ((id - 1) * 24) % Math.max(canvas.height - 200, 40)
      newBoxes.push({ id, text: line, subnotes: [], nodeRef: createRef() })
      newPositions[id] = { x, y }
    }
    setBoxes(prev => [...prev, ...newBoxes])
    setPositions(prev => ({ ...prev, ...newPositions }))
  }, [addingTo, editingNote, editingSubnote])

  const applyCanvasData = useCallback((data) => {
    idCounter = data.idCounter ?? 0
    arrowCounter = data.arrowCounter ?? 0
    subnoteCounter = data.subnoteCounter ?? 0
    setBoxes(data.boxes.map(b => ({ ...b, subnotes: b.subnotes ?? [], color: b.color ?? null, nodeRef: createRef() })))
    setPositions(data.positions ?? {})
    setArrows(data.arrows ?? [])
    setConnecting(null)
    setAddingTo(null)
  }, [])

  const setFileHandle = useCallback((handle) => {
    fileHandleRef.current = handle
    document.title = handle.name
    const url = new URL(window.location)
    url.searchParams.set('file', handle.name)
    history.replaceState(null, '', url)
  }, [])

  const handleStartupOpen = useCallback(async () => {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        multiple: false,
      })
      setFileHandle(handle)
      const file = await handle.getFile()
      applyCanvasData(JSON.parse(await file.text()))
    } catch (e) {
      if (e.name !== 'AbortError') throw e
      return
    }
    setShowStartup(false)
  }, [applyCanvasData, setFileHandle])

  const handleStartupNew = useCallback(async () => {
    const params = new URLSearchParams(window.location.search)
    const fileName = params.get('file')
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName ?? 'canvas.json',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      })
      setFileHandle(handle)
    } catch (e) {
      if (e.name !== 'AbortError') throw e
      return
    }
    setShowStartup(false)
  }, [setFileHandle])

  useEffect(() => {
    fetch('/api/health').catch(() => setBackendDown(true))
  }, [])

  useEffect(() => {
    const fileName = new URLSearchParams(window.location.search).get('file')
    if (!fileName) return
    fetch(`/api/file?name=${encodeURIComponent(fileName)}`)
      .then(r => { if (!r.ok) return null; return r.json() })
      .then(data => {
        if (!data) return
        backendFileRef.current = fileName
        document.title = fileName
        applyCanvasData(data)
        setShowStartup(false)
      })
      .catch(() => {})
  }, [applyCanvasData])

  useEffect(() => {
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  useEffect(() => {
    const down = (e) => { if (e.key === 'Meta') document.body.classList.add('cmd-down') }
    const up = (e) => { if (e.key === 'Meta') document.body.classList.remove('cmd-down') }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])


  useEffect(() => {
    if (addingTo && draftRef.current) draftRef.current.focus()
  }, [addingTo])

  useEffect(() => {
    if (editingNote && editRef.current) {
      const el = editRef.current
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editingNote])

  const commitNoteEdit = useCallback((id, text) => {
    if (text.trim()) {
      setBoxes(prev => prev.map(b => b.id === id ? { ...b, text: text.trim() } : b))
    }
    setEditingNote(null)
  }, [])

  const commitSubnoteEdit = useCallback((boxId, subnoteId, text) => {
    if (text.trim()) {
      setBoxes(prev => prev.map(b =>
        b.id !== boxId ? b : {
          ...b,
          subnotes: b.subnotes.map(s => s.id === subnoteId ? { ...s, text: text.trim() } : s),
        }
      ))
    }
    setEditingSubnote(null)
  }, [])

  useEffect(() => {
    if (!editingSubnote) return

    const el = subnoteEditRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }

    const onMouseDown = (e) => {
      if (!subnoteEditRef.current?.contains(e.target)) {
        commitSubnoteEdit(editingSubnote.boxId, editingSubnote.subnoteId, subnoteEditRef.current?.value ?? '')
      }
    }
    document.addEventListener('mousedown', onMouseDown, true)
    return () => document.removeEventListener('mousedown', onMouseDown, true)
  }, [editingSubnote, commitSubnoteEdit])

  const removeBox = useCallback((id) => {
    setBoxes(prev => prev.filter(b => b.id !== id))
    setPositions(prev => { const p = { ...prev }; delete p[id]; return p })
    setArrows(prev => prev.filter(a => a.fromId !== id && a.toId !== id))
    setConnecting(prev => prev === id ? null : prev)
    setSelectedBoxes(prev => { const s = new Set(prev); s.delete(id); return s })
    setAddingTo(prev => prev === id ? null : prev)
  }, [])

  const handleDrag = useCallback((id, data) => {
    wasDraggedRef.current = true
    setPositions(prev => {
      const old = prev[id] ?? { x: 0, y: 0 }
      const dx = data.x - old.x
      const dy = data.y - old.y
      const next = { ...prev, [id]: { x: data.x, y: data.y } }
      if (selectedBoxes.has(id)) {
        selectedBoxes.forEach(otherId => {
          if (otherId !== id) {
            const op = prev[otherId] ?? { x: 0, y: 0 }
            next[otherId] = { x: op.x + dx, y: op.y + dy }
          }
        })
      }
      return next
    })
  }, [selectedBoxes])

  const startConnecting = useCallback((e, id) => {
    e.stopPropagation()
    setConnecting(id)
  }, [])

  const handleNoteClick = useCallback((e, id) => {
    if (wasDraggedRef.current) { wasDraggedRef.current = false; e.stopPropagation(); return }
    if (e.shiftKey) {
      e.stopPropagation()
      setSelectedBoxes(prev => {
        const s = new Set(prev)
        s.has(id) ? s.delete(id) : s.add(id)
        return s
      })
      return
    }
    if (!connecting) { setSelectedBoxes(new Set()); return }
    e.stopPropagation()
    if (connecting === id) { setConnecting(null); return }
    const sources = selectedBoxes.has(connecting) && selectedBoxes.size > 1
      ? [...selectedBoxes]
      : [connecting]
    setArrows(prev => [...prev, ...sources.map(srcId => ({ id: ++arrowCounter, fromId: srcId, toId: id }))])
    setConnecting(null)
    setSelectedBoxes(new Set())
  }, [connecting, selectedBoxes])

  const getCenter = useCallback((id, boxList) => {
    const box = boxList.find(b => b.id === id)
    const pos = positions[id] ?? { x: 0, y: 0 }
    const el = box?.nodeRef?.current
    return {
      x: pos.x + (el ? el.offsetWidth : 160) / 2,
      y: pos.y + (el ? el.offsetHeight : 60) / 2,
    }
  }, [positions])

  const openSubnote = useCallback((e, id) => {
    e.stopPropagation()
    setAddingTo(id)
    setDraft('')
  }, [])

  const commitSubnote = useCallback((boxId) => {
    if (!draft.trim()) { setAddingTo(null); setDraft(''); return }
    setBoxes(prev => prev.map(b =>
      b.id !== boxId ? b : {
        ...b,
        subnotes: [...(b.subnotes ?? []), { id: ++subnoteCounter, text: draft.trim() }],
      }
    ))
    setAddingTo(null)
    setDraft('')
  }, [draft])

  const setNoteColor = useCallback((id, color) => {
    setBoxes(prev => prev.map(b => b.id === id ? { ...b, color: b.color === color ? null : color } : b))
  }, [])

  const setSubnoteColor = useCallback((boxId, subnoteId, color) => {
    setBoxes(prev => prev.map(b =>
      b.id !== boxId ? b : {
        ...b,
        subnotes: b.subnotes.map(s =>
          s.id !== subnoteId ? s : { ...s, color: s.color === color ? null : color }
        ),
      }
    ))
  }, [])

  const removeSubnote = useCallback((boxId, subnoteId) => {
    setBoxes(prev => prev.map(b =>
      b.id !== boxId ? b : { ...b, subnotes: b.subnotes.filter(s => s.id !== subnoteId) }
    ))
  }, [])

  const handleCanvasMouseDown = useCallback((e) => {
    if (e.target !== canvasRef.current) return
    if (connecting) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setSelectionRect({ startX: x, startY: y, currentX: x, currentY: y })
  }, [connecting])

  const handleCanvasMouseMove = useCallback((e) => {
    if (!selectionRect) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setSelectionRect(prev => prev ? { ...prev, currentX: x, currentY: y } : null)
  }, [selectionRect])

  const handleCanvasMouseUp = useCallback(() => {
    if (!selectionRect) return
    const { startX, startY, currentX, currentY } = selectionRect
    const left = Math.min(startX, currentX)
    const top = Math.min(startY, currentY)
    const right = Math.max(startX, currentX)
    const bottom = Math.max(startY, currentY)
    if (right - left > 5 || bottom - top > 5) {
      const selected = new Set()
      boxes.forEach(box => {
        const pos = positions[box.id] ?? { x: 0, y: 0 }
        const el = box.nodeRef?.current
        const w = el ? el.offsetWidth : 200
        const h = el ? el.offsetHeight : 80
        if (pos.x < right && pos.x + w > left && pos.y < bottom && pos.y + h > top) {
          selected.add(box.id)
        }
      })
      if (selected.size > 0) {
        setSelectedBoxes(selected)
        suppressCanvasClickRef.current = true
      }
    }
    setSelectionRect(null)
  }, [selectionRect, boxes, positions])

  const handleAutoArrange = useCallback(() => {
    if (boxes.length === 0) return

    const H_GAP = 60
    const V_GAP = 40
    const START_X = 60
    const START_Y = 60

    // Build graph
    const inDeg = {}
    const adj = {}
    boxes.forEach(b => { inDeg[b.id] = 0; adj[b.id] = [] })
    arrows.forEach(a => {
      if (adj[a.fromId] !== undefined && inDeg[a.toId] !== undefined) {
        adj[a.fromId].push(a.toId)
        inDeg[a.toId]++
      }
    })

    // BFS layer assignment (Kahn's), sort within each wave by current Y to preserve top-to-bottom order
    const layerOf = {}
    let wave = boxes.filter(b => inDeg[b.id] === 0).map(b => b.id)
    wave.sort((a, b) => (positions[a]?.y ?? 0) - (positions[b]?.y ?? 0))

    let depth = 0
    while (wave.length > 0) {
      wave.forEach(id => { layerOf[id] = depth })
      const next = []
      wave.forEach(id => {
        adj[id].forEach(toId => {
          if (--inDeg[toId] === 0) next.push(toId)
        })
      })
      next.sort((a, b) => (positions[a]?.y ?? 0) - (positions[b]?.y ?? 0))
      wave = next
      depth++
    }
    // Nodes in cycles: last layer; fully disconnected: handled separately
    const connectedIds = new Set(arrows.flatMap(a => [a.fromId, a.toId]))
    boxes.forEach(b => {
      if (layerOf[b.id] === undefined && connectedIds.has(b.id)) layerOf[b.id] = depth
    })

    // Group by layer (connected nodes only)
    const byLayer = {}
    boxes.forEach(b => {
      const l = layerOf[b.id]
      if (l === undefined) return
      if (!byLayer[l]) byLayer[l] = []
      byLayer[l].push(b.id)
    })

    // Lay out connected group: each layer is a column, nodes stack vertically within it
    const newPositions = {}
    const sortedLayers = Object.keys(byLayer).map(Number).sort((a, b) => a - b)
    let x = START_X

    sortedLayers.forEach(layerNum => {
      const ids = byLayer[layerNum]
      let y = START_Y
      let maxW = 0
      ids.forEach(id => {
        const box = boxes.find(b => b.id === id)
        const el = box?.nodeRef?.current
        const w = el ? el.offsetWidth : 200
        const h = el ? el.offsetHeight : 80
        newPositions[id] = { x, y }
        y += h + V_GAP
        maxW = Math.max(maxW, w)
      })
      x += maxW + H_GAP
    })

    // Place isolated notes in a column to the right of the connected group
    let iy = START_Y
    boxes.forEach(b => {
      if (connectedIds.has(b.id)) return
      const el = b.nodeRef?.current
      const h = el ? el.offsetHeight : 80
      newPositions[b.id] = { x, y: iy }
      iy += h + V_GAP
    })

    setPositions(prev => ({ ...prev, ...newPositions }))
  }, [boxes, arrows, positions])

  const buildSaveData = useCallback(() => ({
    boxes: boxes.map(b => ({ id: b.id, text: b.text, subnotes: b.subnotes ?? [], color: b.color ?? null })),
    positions,
    arrows,
    idCounter,
    arrowCounter,
    subnoteCounter,
  }), [boxes, positions, arrows])

  const writeToHandle = useCallback(async (handle, json) => {
    const writable = await handle.createWritable()
    await writable.write(json)
    await writable.close()
  }, [])

  const handleSave = useCallback(async () => {
    const json = JSON.stringify(buildSaveData(), null, 2)

    if (backendFileRef.current) {
      await fetch(`/api/file?name=${encodeURIComponent(backendFileRef.current)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: json,
      })
      return
    }

    if (window.showSaveFilePicker) {
      try {
        const handle = fileHandleRef.current ?? await window.showSaveFilePicker({
          suggestedName: 'canvas.json',
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        })
        fileHandleRef.current = handle
        await writeToHandle(handle, json)
      } catch (e) {
        if (e.name !== 'AbortError') throw e
      }
    } else {
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'canvas.json'
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [boxes, positions, arrows, buildSaveData, writeToHandle])

  useEffect(() => {
    const id = setInterval(async () => {
      const json = JSON.stringify(buildSaveData(), null, 2)
      if (backendFileRef.current) {
        fetch(`/api/file?name=${encodeURIComponent(backendFileRef.current)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: json,
        }).catch(() => {})
        return
      }
      if (!fileHandleRef.current) return
      try {
        await writeToHandle(fileHandleRef.current, json)
      } catch {}
    }, 30000)
    return () => clearInterval(id)
  }, [buildSaveData, writeToHandle])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setConnecting(null)
        setSelectedBoxes(new Set())
        setAddingTo(null)
        setDraft('')
        setEditingNote(null)
        setEditingSubnote(null)
      }
      if (e.key === 's' && e.metaKey) {
        e.preventDefault()
        handleSave()
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBoxes.size > 0) {
        const active = document.activeElement
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
        selectedBoxes.forEach(id => removeBox(id))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedBoxes, removeBox, handleSave])

  const handleLoad = useCallback(async () => {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
          multiple: false,
        })
        setFileHandle(handle)
        const file = await handle.getFile()
        applyCanvasData(JSON.parse(await file.text()))
      } catch (e) {
        if (e.name !== 'AbortError') throw e
      }
    } else {
      loadInputRef.current.click()
    }
  }, [applyCanvasData, setFileHandle])

  const handleLoadFallback = useCallback((e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try { applyCanvasData(JSON.parse(ev.target.result)) } catch {}
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [applyCanvasData])

  if (backendDown) {
    return (
      <div className="startup-overlay">
        <div className="startup-dialog">
          <h2>Backend not running</h2>
          <p>Start the backend server first:</p>
          <pre style={{ textAlign: 'left', background: '#1a1a1a', padding: '12px', borderRadius: '6px', fontSize: '13px' }}>
{`cd backend
uv run uvicorn main:app --reload`}
          </pre>
          <p style={{ fontSize: '13px', opacity: 0.6 }}>Then refresh this page.</p>
        </div>
      </div>
    )
  }

  if (showStartup) {
    const hasFileParam = !!new URLSearchParams(window.location.search).get('file')
    return (
      <div className="startup-overlay">
        <div className="startup-dialog">
          <h2>Canvas Notes</h2>
          <p>Open an existing canvas or create a new one.</p>
          <div className="startup-actions">
            <button className="toolbar-btn" onClick={handleStartupOpen}>Open file…</button>
            <button className="toolbar-btn" onClick={handleStartupNew}>{hasFileParam ? 'Create new…' : 'New canvas…'}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={canvasRef}
      className={`canvas${connecting ? ' is-connecting' : ''}`}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleCanvasMouseMove}
      onMouseUp={handleCanvasMouseUp}
      onClick={() => {
        if (suppressCanvasClickRef.current) { suppressCanvasClickRef.current = false; return }
        setConnecting(null)
        setSelectedBoxes(new Set())
      }}
    >
      <div className="toolbar" onClick={e => e.stopPropagation()}>
        <button className="toolbar-btn" onClick={handleSave}>Save</button>
        <button className="toolbar-btn" onClick={handleLoad}>Load</button>
        <button className="toolbar-btn" onClick={handleAutoArrange}>Auto Arrange</button>
        <input ref={loadInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleLoadFallback} />
      </div>

      <svg className="arrows">
        <defs>
          <marker id="ah" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#888" />
          </marker>
        </defs>
        {arrows.map(a => {
          const from = getCenter(a.fromId, boxes)
          const to = getCenter(a.toId, boxes)
          return (
            <g key={a.id} className="arrow-group" onClick={(e) => { e.stopPropagation(); setArrows(prev => prev.filter(x => x.id !== a.id)) }}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="transparent" strokeWidth="12" />
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#888" strokeWidth="1.5" markerEnd="url(#ah)" />
            </g>
          )
        })}
      </svg>

      {boxes.length === 0 && (
        <div className="hint">Paste text (Ctrl+V / ⌘V) to create a note</div>
      )}

      {selectionRect && (() => {
        const { startX, startY, currentX, currentY } = selectionRect
        return (
          <div className="rubber-band" style={{
            left: Math.min(startX, currentX),
            top: Math.min(startY, currentY),
            width: Math.abs(currentX - startX),
            height: Math.abs(currentY - startY),
          }} />
        )
      })()}

      {boxes.map(box => {
        const pos = positions[box.id] ?? { x: 0, y: 0 }
        const subnotes = box.subnotes ?? []
        const isAdding = addingTo === box.id
        return (
          <Draggable
            key={box.id}
            nodeRef={box.nodeRef}
            position={pos}
            onDrag={(_, data) => handleDrag(box.id, data)}
            bounds="parent"
          >
            <div
              ref={box.nodeRef}
              className={`textbox${connecting === box.id ? ' is-source' : ''}${selectedBoxes.has(box.id) ? ' is-selected' : ''}${box.color ? ` note-${box.color}` : ''}`}
              onClick={(e) => handleNoteClick(e, box.id)}
            >
              <div className="note-colors" onClick={e => e.stopPropagation()}>
                {['green', 'yellow', 'red'].map(c => (
                  <button
                    key={c}
                    className={`color-dot color-dot--${c}${box.color === c ? ' active' : ''}`}
                    onClick={() => setNoteColor(box.id, c)}
                  />
                ))}
              </div>
              <div className="textbox-actions">
                <button
                  className="action-btn"
                  title={connecting === box.id ? 'Cancel' : 'Draw arrow to…'}
                  onClick={(e) => startConnecting(e, box.id)}
                >⟶</button>
                <button
                  className="action-btn"
                  title="Edit note"
                  onClick={(e) => { e.stopPropagation(); setEditingNote(box.id) }}
                >✎</button>
                <button
                  className="action-btn"
                  onClick={(e) => { e.stopPropagation(); removeBox(box.id) }}
                >×</button>
              </div>

              <div className={`note-text-wrapper${editingNote === box.id ? ' is-editing' : ''}`}>
                <pre className="note-text">{renderWithLinks(box.text)}</pre>
                <textarea
                  ref={editRef}
                  className="note-edit"
                  defaultValue={box.text}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => e.stopPropagation()}
                  onBlur={e => commitNoteEdit(box.id, e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { e.preventDefault(); setEditingNote(null) }
                  }}
                />
              </div>

              {(subnotes.length > 0 || isAdding) && (
                <div className="subnotes">
                  {subnotes.map(s => (
                    <div key={s.id} className={`subnote${s.color ? ` subnote-${s.color}` : ''}${expandedSubnotes.has(s.id) ? ' is-expanded' : ''}`}>
                      <button
                        className="subnote-toggle"
                        onClick={(e) => { e.stopPropagation(); setExpandedSubnotes(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n }) }}
                      >{expandedSubnotes.has(s.id) ? '▾' : '▸'}</button>
                      {editingSubnote?.subnoteId === s.id ? (
                        <textarea
                          ref={subnoteEditRef}
                          className="subnote-edit"
                          defaultValue={s.text}
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => {
                            if (e.key === 'Escape') { e.preventDefault(); setEditingSubnote(null) }
                          }}
                        />
                      ) : (
                        <span
                          onClick={(e) => { e.stopPropagation(); setEditingSubnote({ boxId: box.id, subnoteId: s.id }) }}
                        >{renderWithLinks(s.text)}</span>
                      )}
                      <div className="subnote-actions" onClick={e => e.stopPropagation()}>
                        {['green', 'yellow', 'red'].map(c => (
                          <button
                            key={c}
                            className={`color-dot color-dot--${c}${s.color === c ? ' active' : ''}`}
                            onClick={() => setSubnoteColor(box.id, s.id, c)}
                          />
                        ))}
                        <button className="subnote-del" onClick={() => removeSubnote(box.id, s.id)}>×</button>
                      </div>
                    </div>
                  ))}
                  {isAdding && (
                    <textarea
                      ref={draftRef}
                      className="subnote-input"
                      placeholder="Type a subnote… Enter to save"
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onBlur={() => commitSubnote(box.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitSubnote(box.id) }
                        if (e.key === 'Escape') { setAddingTo(null); setDraft('') }
                      }}
                    />
                  )}
                </div>
              )}

              <button
                className="add-subnote-btn"
                onClick={(e) => openSubnote(e, box.id)}
                title="Add subnote"
              >+ subnote</button>
            </div>
          </Draggable>
        )
      })}
    </div>
  )
}
