/**
 * components/DrawingViewer.jsx — CAD drawing image viewer.
 *
 * Features:
 *   • Renders Base64 PNG from the backend
 *   • SVG overlay for issue markers (interactive)
 *   • Click-to-add-issue (manager mode)
 *   • Selected issue highlighting
 *   • Coordinate mapping: pixel → CAD space
 */

import React, { useRef, useState, useCallback, useEffect } from 'react'
import { ZoomIn, ZoomOut, RotateCcw, Crosshair, Hand } from 'lucide-react'

const SEV_COLOR = {
  Critical: '#f85149',
  Warning:  '#d29922',
  Info:     '#79c0ff',
}

export default function DrawingViewer({
  imageB64,
  imageB64s    = [],
  issues       = [],
  bounds       = { min_x: 0, min_y: 0, max_x: 1000, max_y: 800 },
  selectedId   = null,
  onSelectIssue,
  onClickPosition,   // (cadX, cadY, pageIndex) → called when manager/employee clicks blank area
  managerMode  = false,
  canAnnotate  = false,
}) {
  const imgRef   = useRef(null)
  const wrapRef  = useRef(null)
  const scrollRef = useRef(null)
  const [scale,  setScale]  = useState(1)
  const [pan,    setPan]    = useState({ x: 0, y: 0 })
  const [currentPage, setCurrentPage] = useState(0)
  
  /** When true, clicks on the image open the review / add-issue flow */
  const [placementMode, setPlacementMode] = useState(true)
  const [hasPanned, setHasPanned] = useState(false)
  const panStateRef = useRef({ isDown: false, startX: 0, startY: 0 })

  const images = imageB64s?.length > 0 ? imageB64s : (imageB64 ? [imageB64] : [])

  // Reset zoom and pan on page or image change
  useEffect(() => {
    setPan({ x: 0, y: 0 })
    setScale(1)
  }, [currentPage, selectedId, imageB64])

  useEffect(() => {
    if (selectedId) {
      const issue = issues.find(i => i.id === selectedId)
      if (issue && issue.page_index !== undefined && issue.page_index !== currentPage) {
        setCurrentPage(issue.page_index || 0)
      }
    }
  }, [selectedId, issues, currentPage])

  // In employee view, show a short drag hint until the user pans once.
  useEffect(() => {
    if (managerMode || canAnnotate || hasPanned) return
    const t = setTimeout(() => setHasPanned(true), 7000)
    return () => clearTimeout(t)
  }, [managerMode, canAnnotate, hasPanned])

  // ── Coordinate conversion ──────────────────────────────────────────────────
  const pixelToCad = useCallback((px, py) => {
    const rect = imgRef.current?.getBoundingClientRect()
    if (!rect) return [0, 0]
    const relX = (px - rect.left) / rect.width
    const relY = (py - rect.top)  / rect.height
    const cadX = bounds.min_x + relX * (bounds.max_x - bounds.min_x)
    const cadY = bounds.max_y - relY * (bounds.max_y - bounds.min_y)  // Y flip
    return [cadX, cadY]
  }, [bounds])

  const cadToPercent = useCallback((cx, cy) => {
    const px = (cx - bounds.min_x) / (bounds.max_x - bounds.min_x) * 100
    const py = (1 - (cy - bounds.min_y) / (bounds.max_y - bounds.min_y)) * 100
    return [px, py]
  }, [bounds])

  // ── Click handler (image only — avoids stray clicks on scroll chrome) ─────
  const handleImageClick = (e) => {
    if (!(managerMode || canAnnotate) || !placementMode) return
    e.stopPropagation()
    const [cx, cy] = pixelToCad(e.clientX, e.clientY)
    if (onClickPosition) onClickPosition(cx, cy, currentPage)
  }

  const canLeftPan = !(managerMode || canAnnotate) || !placementMode
  const onMouseDownPan = (e) => {
    const isMiddleClick = e.button === 1
    if (e.button !== 0 && !isMiddleClick) return
    if (e.button === 0 && !canLeftPan) return
    e.preventDefault()
    panStateRef.current.isDown = true
    panStateRef.current.startX = e.clientX - pan.x
    panStateRef.current.startY = e.clientY - pan.y
    panStateRef.current.moved = false
  }

  const onMouseMovePan = (e) => {
    const st = panStateRef.current
    if (!st.isDown) return
    const x = e.clientX - st.startX
    const y = e.clientY - st.startY
    setPan({ x, y })
    if (!st.moved && (Math.abs(x - pan.x) > 3 || Math.abs(y - pan.y) > 3)) {
      st.moved = true
      if (!hasPanned) setHasPanned(true)
    }
  }

  const endPan = () => {
    panStateRef.current.isDown = false
  }

  if (images.length === 0) {
    return (
      <div style={{
        height:'100%', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center', gap:16,
        background:'var(--bg-base)', color:'var(--text-muted)',
      }}>
        <div style={{ fontSize:64, opacity:0.3 }}>📐</div>
        <div style={{ fontSize:15, fontWeight:600 }}>No drawing loaded</div>
        <div style={{ fontSize:13 }}>Upload a drawing to open the preview</div>
      </div>
    )
  }

  return (
    <div ref={wrapRef} style={{ position:'relative', width:'100%', height:'100%', overflow:'hidden', background:'#0d1117' }}>
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div style={{
        position:'absolute', top:12, left:12, zIndex:20,
        display:'flex', gap:6, background:'rgba(13,17,23,0.88)',
        padding:'6px 8px', borderRadius:'var(--radius-md)',
        border:'1px solid var(--border)', backdropFilter:'blur(8px)',
      }}>
        <button
          id="zoom-in-btn"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => setScale(s => Math.min(s + 0.25, 4))}
          title="Zoom In"
        ><ZoomIn size={14} /></button>

        <button
          id="zoom-out-btn"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => setScale(s => Math.max(s - 0.25, 0.25))}
          title="Zoom Out"
        ><ZoomOut size={14} /></button>

        <button
          id="zoom-reset-btn"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => { setScale(1); setPan({ x: 0, y: 0 }) }}
          title="Reset Zoom"
        ><RotateCcw size={14} /></button>

        { (managerMode || canAnnotate) && (
          <button
            id="add-issue-crosshair-btn"
            type="button"
            className={`btn btn-icon btn-sm ${placementMode ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setPlacementMode((a) => !a)}
            title={placementMode ? 'Click placement on — click drawing to add an issue' : 'Turn on to click the drawing and add an issue'}
          >
            <Crosshair size={14} />
          </button>
        )}

        {images.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: '1px solid var(--border)', paddingLeft: 8, marginLeft: 2 }}>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              &lt;
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Page {currentPage + 1} / {images.length}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => setCurrentPage(p => Math.min(images.length - 1, p + 1))}
              disabled={currentPage === images.length - 1}
            >
              &gt;
            </button>
          </div>
        )}
      </div>

      {/* ── Placement mode hint ────────────────────────────────────────────────── */}
      {(managerMode || canAnnotate) && (
        <div style={{
          position:'absolute', top:12, right:12, zIndex:20,
          fontSize:11, padding:'4px 10px', borderRadius:20,
          background: placementMode ? 'rgba(56,139,253,0.15)' : 'rgba(110,118,129,0.15)',
          border: placementMode ? '1px solid rgba(56,139,253,0.3)' : '1px solid var(--border)',
          color: placementMode ? 'var(--primary)' : 'var(--text-muted)', fontWeight:600, maxWidth:260, textAlign:'right',
        }}>
          {placementMode
            ? 'Click the drawing to open review & add an issue'
            : 'Enable the crosshair tool to place issues on the drawing'}
        </div>
      )}

      {/* ── Drawing image + SVG overlay ──────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onMouseDown={onMouseDownPan}
        onMouseMove={onMouseMovePan}
        onMouseUp={endPan}
        onMouseLeave={endPan}
        style={{
          width:'100%', height:'100%',
          overflow:'hidden',
          display:'flex', alignItems:'center', justifyContent:'center',
          cursor: canLeftPan ? (panStateRef.current.isDown ? 'grabbing' : 'grab') : 'crosshair',
        }}
      >
        <div style={{ 
          position:'relative', 
          transform:`translate(${pan.x}px, ${pan.y}px) scale(${scale})`, 
          transformOrigin:'center center', 
          transition: panStateRef.current.isDown ? 'none' : 'transform 0.1s ease-out' 
        }}>
          <img
            ref={imgRef}
            id="cad-drawing-img"
            src={`data:image/png;base64,${images[currentPage]}`}
            alt="CAD Drawing"
            onClick={handleImageClick}
            style={{
              display:'block',
              maxWidth:'100%',
              userSelect:'none',
              cursor: (managerMode || canAnnotate) && placementMode ? 'crosshair' : 'inherit',
            }}
            draggable={false}
          />

          {/* SVG Overlay for interactive issue markers */}
          <svg
            style={{
              position:'absolute', top:0, left:0,
              width:'100%', height:'100%',
              pointerEvents:'none',
            }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {issues.map((issue, idx) => {
              if ((issue.page_index || 0) !== currentPage) return null
              const [px, py] = cadToPercent(issue.position_x || 0, issue.position_y || 0)
              const color    = issue.is_comment ? '#a855f7' : (SEV_COLOR[issue.severity] || '#ff2020')
              const isSelected = issue.id === selectedId

              return (
                <g
                  key={issue.id}
                  style={{ cursor:'pointer', pointerEvents:'all' }}
                  onClick={(e) => { e.stopPropagation(); onSelectIssue?.(issue) }}
                >
                  {/* Pulse ring for selected */}
                  {isSelected && (
                    issue.created_by === 'Employee' ? (
                      <rect x={px - 3.5} y={py - 3.5} width="7" height="7" fill="none"
                        stroke={color} strokeWidth="0.5" opacity="0.5"
                        style={{ animation:'pulse-glow-square 1.5s infinite' }} />
                    ) : (
                      <circle cx={px} cy={py} r="3.5" fill="none"
                        stroke={color} strokeWidth="0.5" opacity="0.5"
                        style={{ animation:'pulse-glow 1.5s infinite' }} />
                    )
                  )}
                  {/* Marker shape */}
                  {issue.created_by === 'Employee' ? (
                    <rect
                      x={px - (isSelected ? 2.2 : 1.8)}
                      y={py - (isSelected ? 2.2 : 1.8)}
                      width={(isSelected ? 2.2 : 1.8) * 2}
                      height={(isSelected ? 2.2 : 1.8) * 2}
                      fill={color}
                      stroke="white"
                      strokeWidth="0.3"
                      opacity={issue.resolved ? 0.35 : 0.92}
                    />
                  ) : (
                    <circle
                      cx={px} cy={py} r={isSelected ? "2.2" : "1.8"}
                      fill={color}
                      stroke="white"
                      strokeWidth="0.3"
                      opacity={issue.resolved ? 0.35 : 0.92}
                    />
                  )}
                  {/* Index number */}
                  <text
                    x={px} y={py + 0.55}
                    textAnchor="middle"
                    fontSize="1.1"
                    fill="white"
                    fontWeight="bold"
                    style={{ pointerEvents:'none', userSelect:'none' }}
                  >
                    {idx + 1}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* ── Employee drag hint overlay ─────────────────────────────────────── */}
      {!(managerMode || canAnnotate) && !hasPanned && (
        <div style={{
          position:'absolute',
          left:'50%',
          top:'50%',
          transform:'translate(-50%, -50%)',
          zIndex:15,
          pointerEvents:'none',
          display:'flex',
          alignItems:'center',
          gap:10,
          padding:'10px 14px',
          borderRadius:999,
          background:'rgba(13,17,23,0.72)',
          border:'1px solid rgba(255,255,255,0.08)',
          color:'var(--text-primary)',
          fontSize:12,
          fontWeight:700,
          backdropFilter:'blur(8px)',
          boxShadow:'0 8px 24px rgba(0,0,0,0.35)',
        }}>
          <Hand size={16} color="var(--text-primary)" />
          Drag to move
        </div>
      )}
    </div>
  )
}
