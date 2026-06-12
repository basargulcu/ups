import { useState, useEffect, useCallback, useRef, createRef } from 'react'
import Draggable from 'react-draggable'
import './App.css'

let idCounter = 0
let arrowCounter = 0
let subnoteCounter = 0

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
  const canvasRef = useRef(null)
  const loadInputRef = useRef(null)
  const draftRef = useRef(null)
  const editRef = useRef(null)
  const subnoteEditRef = useRef(null)

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

  useEffect(() => {
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [handlePaste])

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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
    setPositions(prev => ({ ...prev, [id]: { x: data.x, y: data.y } }))
  }, [])

  const startConnecting = useCallback((e, id) => {
    e.stopPropagation()
    setConnecting(id)
  }, [])

  const handleNoteClick = useCallback((e, id) => {
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

  const handleAutoArrange = useCallback(() => {
    if (boxes.length === 0) return

    const H_GAP = 40
    const V_GAP = 60
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

    // BFS layer assignment (Kahn's), sort within each wave by current X to preserve order
    const layerOf = {}
    let wave = boxes.filter(b => inDeg[b.id] === 0).map(b => b.id)
    wave.sort((a, b) => (positions[a]?.x ?? 0) - (positions[b]?.x ?? 0))

    let depth = 0
    while (wave.length > 0) {
      wave.forEach(id => { layerOf[id] = depth })
      const next = []
      wave.forEach(id => {
        adj[id].forEach(toId => {
          if (--inDeg[toId] === 0) next.push(toId)
        })
      })
      next.sort((a, b) => (positions[a]?.x ?? 0) - (positions[b]?.x ?? 0))
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

    // Lay out connected group, track rightmost edge
    const newPositions = {}
    const sortedLayers = Object.keys(byLayer).map(Number).sort((a, b) => a - b)
    let groupMaxX = START_X
    let y = START_Y

    sortedLayers.forEach(layerNum => {
      const ids = byLayer[layerNum]
      let x = START_X
      let maxH = 0
      ids.forEach(id => {
        const box = boxes.find(b => b.id === id)
        const el = box?.nodeRef?.current
        const w = el ? el.offsetWidth : 200
        const h = el ? el.offsetHeight : 80
        newPositions[id] = { x, y }
        x += w + H_GAP
        maxH = Math.max(maxH, h)
        groupMaxX = Math.max(groupMaxX, x)
      })
      y += maxH + V_GAP
    })

    // Place isolated notes in a column to the right of the connected group
    const isolatedX = groupMaxX + H_GAP * 2
    let iy = START_Y
    boxes.forEach(b => {
      if (connectedIds.has(b.id)) return
      const el = b.nodeRef?.current
      const h = el ? el.offsetHeight : 80
      newPositions[b.id] = { x: isolatedX, y: iy }
      iy += h + V_GAP
    })

    setPositions(prev => ({ ...prev, ...newPositions }))
  }, [boxes, arrows, positions])

  const handleSave = useCallback(() => {
    const data = {
      boxes: boxes.map(b => ({ id: b.id, text: b.text, subnotes: b.subnotes ?? [], color: b.color ?? null })),
      positions,
      arrows,
      idCounter,
      arrowCounter,
      subnoteCounter,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'canvas.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [boxes, positions, arrows])

  const handleLoad = useCallback((e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        idCounter = data.idCounter ?? 0
        arrowCounter = data.arrowCounter ?? 0
        subnoteCounter = data.subnoteCounter ?? 0
        setBoxes(data.boxes.map(b => ({ ...b, subnotes: b.subnotes ?? [], color: b.color ?? null, nodeRef: createRef() })))
        setPositions(data.positions ?? {})
        setArrows(data.arrows ?? [])
        setConnecting(null)
        setAddingTo(null)
      } catch {}
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  return (
    <div
      ref={canvasRef}
      className={`canvas${connecting ? ' is-connecting' : ''}`}
      onClick={() => { setConnecting(null); setSelectedBoxes(new Set()) }}
    >
      <div className="toolbar" onClick={e => e.stopPropagation()}>
        <button className="toolbar-btn" onClick={handleSave}>Save</button>
        <button className="toolbar-btn" onClick={() => loadInputRef.current.click()}>Load</button>
        <button className="toolbar-btn" onClick={handleAutoArrange}>Auto Arrange</button>
        <input ref={loadInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleLoad} />
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
                <pre className="note-text">{box.text}</pre>
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
                    <div key={s.id} className={`subnote${s.color ? ` subnote-${s.color}` : ''}`}>
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
                        >{s.text}</span>
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
