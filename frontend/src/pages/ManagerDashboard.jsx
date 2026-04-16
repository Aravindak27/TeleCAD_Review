/**
 * pages/ManagerDashboard.jsx — Manager review interface.
 *
 * Layout:
 *   Left sidebar: Drawing list + stats
 *   Main (split screen):
 *     Left 60%: Drawing viewer (click to add issue)
 *     Right 40%: Issue panel (add/edit/delete/resolve)
 *   Toolbar + modal: Review & annotate (issues + approve / send back)
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  CheckCircle, XCircle, RefreshCw, FileText, Plus,
  ChevronRight, Eye, Users, Star, Trash2, ListChecks
} from 'lucide-react'
import Navbar from '../components/Navbar'
import DrawingViewer from '../components/DrawingViewer'
import IssuePanel from '../components/IssuePanel'
import IssueForm from '../components/IssueForm'
import ManagerReviewModal from '../components/ManagerReviewModal'
import { drawingsAPI } from '../api/client'

const STATUS_META = {
  pending:   { label:'Pending',   color:'#d29922' },
  reviewed:  { label:'Reviewing', color:'#79c0ff' },
  approved:  { label:'Approved',  color:'#3fb950' },
  sent_back: { label:'Sent Back', color:'#f85149' },
}

export default function ManagerDashboard() {
  const [drawings,      setDrawings]      = useState([])
  const [selected,      setSelected]      = useState(null)   // full detail
  const [issues,        setIssues]        = useState([])
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [activeEmployeeId, setActiveEmployeeId] = useState(null)
  const [selectedDrawingIds, setSelectedDrawingIds] = useState([])
  const [selectionMode, setSelectionMode] = useState(false)

  const [sidebarWidth, setSidebarWidth] = useState(290)
  const isResizing = useRef(false)

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing.current) return
      setSidebarWidth(Math.max(250, Math.min(e.clientX, 600)))
    }
    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false
        document.body.style.cursor = 'default'
      }
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const favKey = useMemo(() => `favDrawingThreads:mgr`, [])
  const [favThreadIds, setFavThreadIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('favDrawingThreads:mgr') || '[]') } catch { return [] }
  })

  const [editModal, setEditModal] = useState(null) // issue object — edit only

  /** Unified review modal: position from drawing click or (0,0); focus annotate vs decision */
  const [reviewModal, setReviewModal] = useState(null)

  // ── Fetch all drawings ─────────────────────────────────────────────────────
  const fetchDrawings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await drawingsAPI.list()
      setDrawings(res.data)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchDrawings() }, [fetchDrawings])

  // ── Open a drawing ─────────────────────────────────────────────────────────
  const openDrawing = async (drawing) => {
    setLoadingDetail(true)
    setSelected(null)
    setIssues([])
    setSelectedIssue(null)
    try {
      const res = await drawingsAPI.get(drawing.id)
      setSelected(res.data)
      setIssues(res.data.issues || [])
      // Auto-mark as reviewed if pending
      if (drawing.status === 'pending') {
        await drawingsAPI.setStatus(drawing.id, { status: 'reviewed' })
        setDrawings(prev => prev.map(d => d.id === drawing.id ? { ...d, status: 'reviewed' } : d))
      }
    } catch {}
    finally { setLoadingDetail(false) }
  }

  // ── Re-render image with updated issues ───────────────────────────────────
  const rerender = async () => {
    if (!selected) return
    try {
      const res = await drawingsAPI.rerender(selected.drawing.id)
      setSelected(prev => ({ ...prev, image_b64: res.data.image_b64 }))
    } catch {}
  }

  // ── Issue callbacks ────────────────────────────────────────────────────────
  const handleReviewIssueSaved = (issue) => {
    setIssues((prev) => [...prev, issue])
    setReviewModal(null)
    rerender()
  }

  const handleIssueUpdated = (updated) => {
    setIssues(prev => prev.map(i => i.id === updated.id ? updated : i))
    setEditModal(null)
    setSelectedIssue(updated)
  }

  const handleIssueDeleted = (id) => {
    setIssues(prev => prev.filter(i => i.id !== id))
    if (selectedIssue?.id === id) setSelectedIssue(null)
  }

  // ── Click on drawing → unified review / annotate modal ───────────────────
  const handleDrawingClick = (cadX, cadY) => {
    setReviewModal({ position: { x: cadX, y: cadY }, focusSection: 'annotate' })
  }

  const handleReviewStatus = async (status, managerComment) => {
    if (!selected) throw new Error('No drawing selected')
    await drawingsAPI.setStatus(selected.drawing.id, {
      status,
      manager_comment: managerComment || undefined,
    })
    setDrawings((prev) =>
      prev.map((d) => (d.id === selected.drawing.id ? { ...d, status } : d)),
    )
    setSelected((prev) => ({
      ...prev,
      drawing: {
        ...prev.drawing,
        status,
        manager_comment: managerComment ?? prev.drawing.manager_comment,
      },
    }))
  }

  // Stats
  const stats = {
    total:    drawings.length,
    pending:  drawings.filter(d => d.status === 'pending' || d.status === 'reviewed').length,
    approved: drawings.filter(d => d.status === 'approved').length,
    issues:   0,
  }

  const employees = (() => {
    const map = new Map()
    for (const d of drawings) {
      const key = d.uploaded_by
      const item = map.get(key) || {
        uploaded_by: d.uploaded_by,
        employee_name: d.employee_name || 'Unknown',
        total: 0,
        pending: 0,
        sent_back: 0,
        last_updated_at: d.updated_at || d.created_at,
      }
      item.total += 1
      if (d.status === 'pending' || d.status === 'reviewed') item.pending += 1
      if (d.status === 'sent_back') item.sent_back += 1
      if ((d.updated_at || d.created_at) > item.last_updated_at) item.last_updated_at = d.updated_at || d.created_at
      map.set(key, item)
    }
    return [...map.values()].sort((a, b) => new Date(b.last_updated_at) - new Date(a.last_updated_at))
  })()

  const activeEmployee = employees.find(e => e.uploaded_by === activeEmployeeId) || null
  const activeEmployeeDrawings = activeEmployeeId
    ? drawings.filter(d => d.uploaded_by === activeEmployeeId).sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    : []

  const isFavThread = useCallback((threadId) => favThreadIds.includes(Number(threadId)), [favThreadIds])

  const activeEmployeeDrawingsSorted = useMemo(() => {
    if (!activeEmployeeDrawings.length) return activeEmployeeDrawings
    return [...activeEmployeeDrawings].sort((a, b) => {
      const af = isFavThread(a.thread_id || a.id) ? 1 : 0
      const bf = isFavThread(b.thread_id || b.id) ? 1 : 0
      if (af !== bf) return bf - af
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
    })
  }, [activeEmployeeDrawings, isFavThread])

  const toggleSelect = (id) => {
    setSelectedDrawingIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const clearSelection = () => setSelectedDrawingIds([])

  const favouriteSelected = () => {
    if (!selectionMode) return
    const threadIds = selectedDrawingIds
      .map(id => drawings.find(d => d.id === id))
      .filter(Boolean)
      .map(d => Number(d.thread_id || d.id))
    const next = Array.from(new Set([...favThreadIds, ...threadIds]))
    setFavThreadIds(next)
    localStorage.setItem(favKey, JSON.stringify(next))
    clearSelection()
  }

  const deleteSelected = async () => {
    if (!selectionMode) return
    const ids = [...selectedDrawingIds]
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map(id => drawingsAPI.delete(id)))
      setDrawings(prev => prev.filter(d => !ids.includes(d.id) && !ids.includes(d.thread_id)))
      if (selected?.drawing?.id && ids.includes(selected.drawing.id)) {
        setSelected(null)
        setIssues([])
        setSelectedIssue(null)
      }
    } catch {}
    finally { clearSelection() }
  }

  const toggleSelectionMode = () => {
    setSelectionMode((v) => {
      if (v) clearSelection()
      return !v
    })
  }

  return (
    <div className="page" style={{ height:'100vh', overflow:'hidden' }}>
      <Navbar />

      <div style={{ display:'flex', height:'calc(100vh - 64px)', overflow:'hidden' }}>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <div style={{
          width: sidebarWidth, flexShrink:0,
          background:'var(--bg-surface)',
          borderRight:'1px solid var(--border)',
          display:'flex', flexDirection:'column',
          overflow:'hidden',
          position: 'relative',
        }}>
          {/* Resize Handle */}
          <div
            onMouseDown={() => {
              isResizing.current = true
              document.body.style.cursor = 'col-resize'
            }}
            style={{
              position: 'absolute',
              top: 0, right: -4, width: 8, height: '100%',
              cursor: 'col-resize', zIndex: 10
            }}
          />
          {/* Sidebar header */}
          <div style={{ padding:'16px 14px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <h3 style={{ fontSize:'0.9rem', display:'flex', alignItems:'center', gap:8 }}>
                <Users size={14} /> Employees
              </h3>
              <button
                id="refresh-mgr-btn"
                className="btn btn-ghost btn-icon btn-sm"
                onClick={fetchDrawings}
              >
                <RefreshCw size={13} />
              </button>
            </div>

            {/* Stats mini */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
              {[
                ['Total',    stats.total,    'var(--primary)'],
                ['Pending',  stats.pending,  'var(--warning)'],
                ['Approved', stats.approved, 'var(--success)'],
              ].map(([l, v, c]) => (
                <div key={l} style={{
                  background:'var(--bg-card)', borderRadius:'var(--radius-md)',
                  padding:'8px 6px', border:'1px solid var(--border)', textAlign:'center',
                }}>
                  <div style={{ fontSize:16, fontWeight:800, color:c }}>{v}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Employee / Drawing pipeline list */}
          <div style={{ flex:1, overflowY:'auto', padding:'8px 6px' }}>
            {loading ? (
              <div style={{ display:'flex', justifyContent:'center', padding:32 }}>
                <div className="spinner" />
              </div>
            ) : drawings.length === 0 ? (
              <div className="empty-state" style={{ padding:32 }}>
                <div className="empty-state-icon" style={{fontSize:'2rem'}}>📋</div>
                <h3 style={{fontSize:'0.9rem'}}>No drawings uploaded yet</h3>
              </div>
            ) : activeEmployeeId == null ? (
              employees.length === 0 ? null : employees.map((e) => {
                const isActive = e.uploaded_by === activeEmployeeId
                return (
                  <div
                    key={e.uploaded_by}
                    id={`mgr-employee-${e.uploaded_by}`}
                    onClick={() => setActiveEmployeeId(e.uploaded_by)}
                    style={{
                      padding:'10px 10px',
                      borderRadius:'var(--radius-md)',
                      border:`1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                      background: isActive ? 'var(--primary-muted)' : 'var(--bg-card)',
                      cursor:'pointer', marginBottom:6,
                      transition:'all 0.15s',
                      display:'flex', alignItems:'center', gap:10,
                    }}
                  >
                    <div style={{
                      width:30, height:30, borderRadius:10,
                      background:'var(--bg-hover)',
                      border:'1px solid var(--border)',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      color:'var(--text-secondary)', fontWeight:800, fontSize:12,
                      flexShrink:0,
                    }}>
                      {(e.employee_name || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {e.employee_name}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4, flexWrap:'wrap' }}>
                        <span className="badge" style={{ background:'var(--bg-hover)', border:'1px solid var(--border)', color:'var(--text-secondary)' }}>
                          {e.total} drawings
                        </span>
                        {e.pending > 0 && <span className="badge badge-warning">{e.pending} pending</span>}
                        {e.sent_back > 0 && <span className="badge badge-critical">{e.sent_back} sent back</span>}
                      </div>
                    </div>
                    <ChevronRight size={12} color="var(--text-muted)" />
                  </div>
                )
              })
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setActiveEmployeeId(null)}
                  style={{ width:'100%', justifyContent:'flex-start', marginBottom:8 }}
                >
                  <ChevronRight size={14} style={{ transform:'rotate(180deg)' }} />
                  Back to employees
                </button>

                <div style={{
                  padding:'8px 10px', marginBottom:8, borderRadius:'var(--radius-md)',
                  background:'var(--bg-card)', border:'1px solid var(--border)',
                  display:'flex', alignItems:'center', justifyContent:'space-between', gap:10,
                }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:800, fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {activeEmployee?.employee_name}
                    </div>
                    <div style={{ fontSize:10, color:'var(--text-secondary)', marginTop:2 }}>
                      Last update: {activeEmployee?.last_updated_at ? new Date(activeEmployee.last_updated_at).toLocaleString() : '—'}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-sm"
                      title={selectionMode ? 'Exit selection' : 'Select'}
                      onClick={toggleSelectionMode}
                    >
                      <ListChecks size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-sm"
                      disabled={!selectionMode || selectedDrawingIds.length === 0}
                      title="Add to favourites (selected)"
                      onClick={favouriteSelected}
                    >
                      <Star size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-sm"
                      disabled={!selectionMode || selectedDrawingIds.length === 0}
                      title="Delete (selected)"
                      onClick={deleteSelected}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {activeEmployeeDrawingsSorted.map((d) => {
                  const meta = STATUS_META[d.status] || STATUS_META.pending
                  const isActive = selected?.drawing?.id === d.id
                  const checked = selectedDrawingIds.includes(d.id)
                  const fav = isFavThread(d.thread_id || d.id)
                  return (
                    <div
                      key={d.id}
                      id={`mgr-drawing-${d.id}`}
                      onClick={() => openDrawing(d)}
                      style={{
                        padding:'10px 10px',
                        borderRadius:'var(--radius-md)',
                        border:`1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                        background: isActive ? 'var(--primary-muted)' : 'var(--bg-card)',
                        cursor:'pointer', marginBottom:5,
                        transition:'all 0.15s',
                        display:'flex', alignItems:'center', gap:8,
                      }}
                    >
                      {selectionMode && (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(d.id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width:16, height:16 }}
                        />
                      )}
                      <FileText size={13} color={isActive ? 'var(--primary)' : 'var(--text-muted)'} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {d.filename}
                          {fav && <Star size={12} style={{ marginLeft:8 }} color="var(--warning)" fill="var(--warning)" />}
                          {d.version > 1 && (
                            <span className="badge" style={{ marginLeft:8, background:'var(--bg-hover)', border:'1px solid var(--border)', color:'var(--text-secondary)' }}>
                              v{d.version}
                            </span>
                          )}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
                          <span style={{ fontSize:10, color:meta.color, fontWeight:700 }}>● {meta.label}</span>
                          <span style={{ fontSize:10, color:'var(--text-secondary)' }}>
                            {new Date((d.updated_at || d.created_at) + 'Z').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle:'short', timeStyle: 'short' })}
                          </span>
                        </div>
                      </div>
                      <ChevronRight size={12} color="var(--text-muted)" />
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

          {!selected && !loadingDetail ? (
            /* Welcome state */
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
              <Eye size={64} color="var(--text-muted)" opacity={0.3} />
              <h3 style={{ color:'var(--text-secondary)' }}>Select a drawing to review</h3>
              <p style={{ fontSize:13 }}>Click any drawing from the sidebar to begin review</p>
            </div>

          ) : loadingDetail ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:16 }}>
              <div className="spinner" style={{ width:40, height:40 }} />
              <span style={{ color:'var(--text-secondary)' }}>Loading drawing…</span>
            </div>

          ) : (
            <>
              {/* Top toolbar */}
              <div style={{
                padding:'10px 16px',
                borderBottom:'1px solid var(--border)',
                background:'var(--bg-card)',
                display:'flex', alignItems:'center', justifyContent:'space-between',
                flexWrap:'wrap', gap:8,
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <FileText size={16} color="var(--primary)" />
                  <div>
                    <span style={{ fontWeight:700, fontSize:14 }}>
                      {selected.drawing.filename}
                    </span>
                    {(() => {
                      const m = STATUS_META[selected.drawing.status] || STATUS_META.pending
                      return <span style={{ marginLeft:8, fontSize:11, color:m.color, fontWeight:700 }}>● {m.label}</span>
                    })()}
                    {activeEmployee && (
                      <span style={{ marginLeft:10, fontSize:11, color:'var(--text-muted)' }}>
                        from <strong style={{ color:'var(--text-secondary)' }}>{activeEmployee.employee_name}</strong>
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <button
                    id="rerender-btn"
                    className="btn btn-secondary btn-sm"
                    onClick={rerender}
                    title="Re-render drawing with current issues"
                  >
                    <RefreshCw size={12} /> Re-render
                  </button>

                  <button
                    id="add-issue-toolbar-btn"
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      setReviewModal({ position: { x: 0, y: 0 }, focusSection: 'annotate' })
                    }
                  >
                    <Plus size={12} /> Review &amp; annotate
                  </button>

                  <button
                    id="approve-btn"
                    type="button"
                    className="btn btn-success btn-sm"
                    onClick={() =>
                      setReviewModal({ position: { x: 0, y: 0 }, focusSection: 'decision' })
                    }
                    disabled={selected.drawing.status === 'approved'}
                  >
                    <CheckCircle size={13} /> Approve
                  </button>

                  <button
                    id="sendback-btn"
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() =>
                      setReviewModal({ position: { x: 0, y: 0 }, focusSection: 'decision' })
                    }
                  >
                    <XCircle size={13} /> Send Back
                  </button>
                </div>
              </div>

              {/* Split: Drawing | Issues */}
              <div style={{ flex:1, display:'grid', gridTemplateColumns:'1fr 380px', overflow:'hidden' }}>
                {/* Drawing viewer */}
                <div style={{ overflow:'hidden', position:'relative', borderRight:'1px solid var(--border)' }}>
                  <DrawingViewer
                    imageB64={selected.image_b64}
                    imageB64s={selected.image_b64s}
                    issues={issues}
                    bounds={selected.bounds}
                    selectedId={selectedIssue?.id}
                    onSelectIssue={setSelectedIssue}
                    onClickPosition={handleDrawingClick}
                    managerMode={true}
                  />
                </div>

                {/* Issue panel */}
                <div style={{ overflow:'hidden', display:'flex', flexDirection:'column' }}>
                  <div style={{
                    padding:'12px 16px',
                    borderBottom:'1px solid var(--border)',
                    display:'flex', justifyContent:'space-between', alignItems:'center',
                  }}>
                    <span style={{ fontWeight:700, fontSize:13 }}>
                      Issues <span style={{ color:'var(--text-muted)', fontWeight:400 }}>({issues.length})</span>
                    </span>
                    <button
                      id="add-issue-panel-btn"
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() =>
                        setReviewModal({ position: { x: 0, y: 0 }, focusSection: 'annotate' })
                      }
                    >
                      <Plus size={12} /> Add
                    </button>
                  </div>

                  <div style={{ flex:1, overflowY:'auto', padding:12 }}>
                    <IssuePanel
                      issues={issues}
                      selectedId={selectedIssue?.id}
                      managerMode={true}
                      onSelect={setSelectedIssue}
                      onEdit={setEditModal}
                      onIssueUpdated={handleIssueUpdated}
                      onIssueDeleted={handleIssueDeleted}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </div>

      {/* ── Unified review / annotate / approve / send back ───────────────── */}
      {reviewModal && selected && (
        <ManagerReviewModal
          open
          onClose={() => setReviewModal(null)}
          drawing={selected.drawing}
          position={reviewModal.position}
          focusSection={reviewModal.focusSection}
          onIssueSaved={handleReviewIssueSaved}
          onStatusUpdated={handleReviewStatus}
        />
      )}

      {/* ── Edit Issue modal ────────────────────────────────────────────────── */}
      {editModal && (
        <IssueForm
          mode="edit"
          initial={editModal}
          onSave={handleIssueUpdated}
          onClose={() => setEditModal(null)}
        />
      )}
    </div>
  )
}
