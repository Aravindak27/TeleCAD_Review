/**
 * pages/EmployeeDashboard.jsx — Employee view.
 *
 * Sections:
 *   1. Stats bar (total drawings, issues, status counts)
 *   2. Upload panel (shown when no drawing is selected)
 *   3. Drawing list with status badges
 *   4. Selected drawing detail:
 *      - CAD image (read-only)
 *      - Issue list (read-only)
 *      - Status & manager comment
 *   5. Re-upload button for "sent_back" drawings
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Upload, RefreshCw, FileText, CheckCircle, Clock, AlertTriangle, XCircle, ChevronRight, Star, Trash2, ListChecks } from 'lucide-react'
import Navbar from '../components/Navbar'
import UploadComponent from '../components/UploadComponent'
import DrawingViewer from '../components/DrawingViewer'
import IssuePanel from '../components/IssuePanel'
import { drawingsAPI, authAPI } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

const STATUS_META = {
  pending: { label: 'Pending Review', color: 'var(--warning)', Icon: Clock },
  reviewed: { label: 'Under Review', color: 'var(--info)', Icon: RefreshCw },
  approved: { label: 'Approved ✓', color: 'var(--success)', Icon: CheckCircle },
  sent_back: { label: 'Revisions Needed', color: 'var(--danger)', Icon: XCircle },
}

export default function EmployeeDashboard() {
  const { user } = useAuth()

  const [drawings, setDrawings] = useState([])
  const [selected, setSelected] = useState(null)   // { drawing, issues, image_b64, bounds }
  const [viewMode, setViewMode] = useState('list')  // 'list' | 'detail' | 'upload'
  const [loading, setLoading] = useState(true)
  const [reupload, setReupload] = useState(false)
  const [activeManagerId, setActiveManagerId] = useState(null)

  const [threadHistory, setThreadHistory] = useState([])
  const [selectedDrawingIds, setSelectedDrawingIds] = useState([])
  const [selectionMode, setSelectionMode] = useState(false)
  const favKey = useMemo(() => `favDrawingThreads:${user?.id || 'anon'}`, [user?.id])
  const [favThreadIds, setFavThreadIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`favDrawingThreads:${user?.id || 'anon'}`) || '[]') } catch { return [] }
  })

  const [managers, setManagers] = useState([])
  const [selectedManagerId, setSelectedManagerId] = useState(null)
  const [managersError, setManagersError] = useState(null)

  const [sidebarWidth, setSidebarWidth] = useState(320)
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

  // ── Fetch drawings list ────────────────────────────────────────────────────
  const fetchDrawings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await drawingsAPI.list()
      setDrawings(res.data)
    } catch { }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchDrawings() }, [fetchDrawings])

  useEffect(() => {
    // Load manager list for assignment on upload
    let cancelled = false
      ; (async () => {
        try {
          setManagersError(null)
          const res = await authAPI.managers()
          if (!cancelled) setManagers(res.data || [])
        } catch (e) {
          if (!cancelled) {
            const msg = e.response?.data?.detail || e.message || 'Failed to load managers.'
            setManagers([])
            setManagersError(msg)
          }
        }
      })()
    return () => { cancelled = true }
  }, [])

  // ── Open a drawing ─────────────────────────────────────────────────────────
  const openDrawing = async (drawing) => {
    try {
      const res = await drawingsAPI.get(drawing.id)
      setSelected(res.data)
      setViewMode('detail')
    } catch { }
  }

  // ── Load thread history (for manager comment "chat") ───────────────────────
  useEffect(() => {
    const threadId = selected?.drawing?.thread_id
    if (!threadId) { setThreadHistory([]); return }
    let cancelled = false
      ; (async () => {
        try {
          const res = await drawingsAPI.history()
          const rows = (res.data || []).filter(r => String(r.thread_id) === String(threadId))
            .sort((a, b) => (a.version || 1) - (b.version || 1))
          if (!cancelled) setThreadHistory(rows)
        } catch {
          if (!cancelled) setThreadHistory([])
        }
      })()
    return () => { cancelled = true }
  }, [selected?.drawing?.thread_id])

  // ── After upload ───────────────────────────────────────────────────────────
  const handleUploadComplete = (data) => {
    const mgr = managers.find(m => String(m.id) === String(selectedManagerId))
    const listItem = {
      id: data.drawing.id,
      filename: data.drawing.filename,
      status: data.drawing.status,
      uploaded_by: data.drawing.uploaded_by,
      employee_name: user?.name || 'You',
      assigned_manager_id: data.drawing.assigned_manager_id ?? selectedManagerId,
      manager_name: mgr?.name,
      thread_id: data.drawing.thread_id,
      version: data.drawing.version || 1,
      is_latest: true,
      created_at: data.drawing.created_at,
      updated_at: data.drawing.updated_at,
    }
    setDrawings(prev => [listItem, ...prev])
    setSelected(data)
    setViewMode('detail')
    setReupload(false)
  }

  // Stats
  const stats = {
    total: drawings.length,
    approved: drawings.filter(d => d.status === 'approved').length,
    pending: drawings.filter(d => d.status === 'pending').length,
    sentBack: drawings.filter(d => d.status === 'sent_back').length,
  }

  const managerGroups = (() => {
    const map = new Map()
    for (const d of drawings) {
      const key = d.assigned_manager_id ?? 'none'
      const item = map.get(key) || {
        assigned_manager_id: d.assigned_manager_id ?? null,
        manager_name: d.manager_name || (d.assigned_manager_id ? 'Manager' : 'Unassigned'),
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

  const activeManager = managerGroups.find(m => String(m.assigned_manager_id ?? 'none') === String(activeManagerId ?? 'none')) || null
  const activeManagerDrawings = activeManagerId == null
    ? []
    : drawings
      .filter(d => String(d.assigned_manager_id ?? 'none') === String(activeManagerId))
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))

  const isFavThread = useCallback((threadId) => favThreadIds.includes(Number(threadId)), [favThreadIds])

  const activeManagerDrawingsSorted = useMemo(() => {
    if (!activeManagerDrawings.length) return activeManagerDrawings
    return [...activeManagerDrawings].sort((a, b) => {
      const af = isFavThread(a.thread_id || a.id) ? 1 : 0
      const bf = isFavThread(b.thread_id || b.id) ? 1 : 0
      if (af !== bf) return bf - af
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
    })
  }, [activeManagerDrawings, isFavThread])

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
        setViewMode('list')
      }
    } catch { }
    finally { clearSelection() }
  }

  const toggleSelectionMode = () => {
    setSelectionMode((v) => {
      if (v) clearSelection()
      return !v
    })
  }

  return (
    <div className="page">
      <Navbar />

      <div style={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
        {/* ── Sidebar: drawing list ──────────────────────────────────────────── */}
        <div style={{
          width: sidebarWidth, flexShrink: 0,
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
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
          <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '0.95rem' }}>My Drawings</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  id="refresh-drawings-btn"
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={fetchDrawings}
                  title="Refresh"
                >
                  <RefreshCw size={14} className={loading ? 'spin' : ''} />
                </button>
                <button
                  id="new-upload-btn"
                  className="btn btn-primary btn-sm"
                  onClick={() => setViewMode('upload')}
                >
                  <Upload size={13} /> Upload
                </button>
              </div>
            </div>

            {/* Mini stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                ['Total', stats.total, '#388bfd'],
                ['Approved', stats.approved, '#3fb950'],
                ['Pending', stats.pending, '#d29922'],
                ['Revise', stats.sentBack, '#f85149'],
              ].map(([l, v, c]) => (
                <div key={l} style={{
                  background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
                  padding: '8px 10px', border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                <div className="spinner" />
              </div>
            ) : drawings.length === 0 ? (
              <div className="empty-state" style={{ padding: 40 }}>
                <div className="empty-state-icon">📂</div>
                <h3>No drawings yet</h3>
                <p style={{ fontSize: 12 }}>Upload your first DXF</p>
              </div>
            ) : activeManagerId == null ? (
              managerGroups.map((m) => {
                const key = String(m.assigned_manager_id ?? 'none')
                const isActive = String(activeManagerId ?? '') === key
                return (
                  <div
                    key={key}
                    onClick={() => setActiveManagerId(key)}
                    style={{
                      padding: '12px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                      background: isActive ? 'var(--primary-muted)' : 'var(--bg-card)',
                      cursor: 'pointer', marginBottom: 6,
                      transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.manager_name || 'Manager'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <span className="badge" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                          {m.total} drawings
                        </span>
                        {m.pending > 0 && <span className="badge badge-warning">{m.pending} pending</span>}
                        {m.sent_back > 0 && <span className="badge badge-critical">{m.sent_back} sent back</span>}
                      </div>
                    </div>
                    <ChevronRight size={14} color="var(--text-muted)" />
                  </div>
                )
              })
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setActiveManagerId(null)}
                  style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 8 }}
                >
                  <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
                  Back to managers
                </button>

                <div style={{
                  padding: '10px 12px', marginBottom: 10, borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {activeManager?.manager_name || 'Manager'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3 }}>
                      Last update: {activeManager?.last_updated_at ? new Date(activeManager.last_updated_at).toLocaleString() : '—'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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

                {activeManagerDrawingsSorted.map(d => {
                  const meta = STATUS_META[d.status] || STATUS_META.pending
                  const isActive = selected?.drawing?.id === d.id
                  const checked = selectedDrawingIds.includes(d.id)
                  const fav = isFavThread(d.thread_id || d.id)
                  return (
                    <div
                      key={d.id}
                      id={`drawing-item-${d.id}`}
                      onClick={() => openDrawing(d)}
                      style={{
                        padding: '12px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                        background: isActive ? 'var(--primary-muted)' : 'var(--bg-card)',
                        cursor: 'pointer', marginBottom: 6,
                        transition: 'all 0.15s',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        {selectionMode && (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelect(d.id)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: 16, height: 16 }}
                          />
                        )}
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <FileText size={12} style={{ marginRight: 4 }} />
                          {d.filename}
                          {fav && <Star size={12} style={{ marginLeft: 8 }} color="var(--warning)" fill="var(--warning)" />}
                          {d.version > 1 && (
                            <span className="badge" style={{ marginLeft: 8, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                              v{d.version}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <meta.Icon size={10} color={meta.color} />
                          <span style={{ fontSize: 11, color: meta.color, fontWeight: 700 }}>{meta.label}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                            {new Date((d.updated_at || d.created_at) + 'Z').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                      </div>
                      <ChevronRight size={14} color="var(--text-muted)" />
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* ── Main content area ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {viewMode === 'upload' || (viewMode === 'list' && drawings.length === 0) ? (
            /* Upload view */
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <div style={{ width: '100%', maxWidth: 560 }}>
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                  <h2 style={{ marginBottom: 8 }}>Upload a Drawing</h2>
                  <p>Upload your file for manager review</p>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Send to manager
                  </label>
                  <select
                    id="manager-select"
                    value={selectedManagerId ?? (reupload ? selected?.drawing?.assigned_manager_id : '')}
                    onChange={(e) => setSelectedManagerId(e.target.value ? Number(e.target.value) : null)}
                    style={{ width: '100%' }}
                  >
                    <option value="">
                      {managersError ? 'Unable to load managers' : 'Select manager…'}
                    </option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                    ))}
                  </select>
                  {managersError && (
                    <div className="alert alert-error fade-in" style={{ marginTop: 10 }}>
                      <AlertTriangle size={14} />
                      <span>{managersError}</span>
                    </div>
                  )}
                </div>

                <UploadComponent
                  onUploadComplete={handleUploadComplete}
                  assignedManagerId={selectedManagerId ?? (reupload ? selected?.drawing?.assigned_manager_id : null)}
                  threadId={reupload ? (selected?.drawing?.thread_id || selected?.drawing?.id) : null}
                  disabled={!(selectedManagerId ?? (reupload ? selected?.drawing?.assigned_manager_id : null))}
                />
              </div>
            </div>

          ) : viewMode === 'detail' && selected ? (
            /* Drawing detail view */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Top bar */}
              <div style={{
                padding: '12px 20px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-card)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <FileText size={18} color="var(--primary)" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{selected.drawing.filename}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      Uploaded {new Date((selected.drawing.created_at) + 'Z').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Status badge */}
                  {(() => {
                    const meta = STATUS_META[selected.drawing.status] || STATUS_META.pending
                    return (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px', borderRadius: 20,
                        background: `${meta.color}18`,
                        border: `1px solid ${meta.color}50`,
                        color: meta.color, fontWeight: 700, fontSize: 12,
                      }}>
                        <meta.Icon size={12} />
                        {meta.label}
                      </div>
                    )
                  })()}

                  {/* Re-upload if sent back */}
                  {selected.drawing.status === 'sent_back' && (
                    <button
                      id="reupload-btn"
                      className="btn btn-warning btn-sm"
                      onClick={() => { setReupload(true); setViewMode('upload') }}
                    >
                      <Upload size={13} /> Upload Corrected Drawing
                    </button>
                  )}
                </div>
              </div>

              {/* Manager comment */}
              {selected.drawing.manager_comment && (
                <div className="alert alert-warning" style={{ margin: '12px 20px 0', borderRadius: 'var(--radius-md)' }}>
                  <AlertTriangle size={14} />
                  <div>
                    <strong style={{ fontSize: 12 }}>Manager's Comment:</strong>
                    <div style={{ fontSize: 13, marginTop: 4 }}>{selected.drawing.manager_comment}</div>
                  </div>
                </div>
              )}

              {/* Viewer + issues */}
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 360px', overflow: 'hidden' }}>
                {/* Drawing */}
                <div style={{ overflow: 'hidden', borderRight: '1px solid var(--border)' }}>
                  <DrawingViewer
                    imageB64={selected.image_b64}
                    imageB64s={selected.image_b64s}
                    issues={selected.drawing.status === 'approved' || selected.drawing.status === 'sent_back'
                      ? selected.issues : []}
                    bounds={selected.bounds}
                    managerMode={false}
                  />
                </div>

                {/* Issues — only visible after manager action */}
                <div style={{ padding: 16, overflowY: 'auto' }}>
                  <div style={{ marginBottom: 12, fontWeight: 700, fontSize: 13 }}>
                    🔍 Detected Issues
                    {selected.drawing.status === 'pending' && (
                      <div className="alert alert-info" style={{ marginTop: 8, fontSize: 12 }}>
                        Issues will be visible after manager review
                      </div>
                    )}
                  </div>
                  {(selected.drawing.status === 'approved' || selected.drawing.status === 'sent_back') ? (
                    <IssuePanel
                      issues={selected.issues}
                      managerMode={false}
                    />
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 20 }}>
                      Drawing is pending manager review.
                    </div>
                  )}

                  {/* Thread "chat" (manager comments across versions) */}
                  <div className="divider" style={{ margin: '16px 0' }} />
                  <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 8 }}>
                    💬 Manager chat (thread)
                  </div>
                  {threadHistory.filter(r => r.manager_comment).length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      No manager comments yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {threadHistory
                        .filter(r => r.manager_comment)
                        .map((r) => (
                          <div key={r.id} style={{
                            padding: '10px 12px',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                              <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-primary)' }}>
                                {r.manager_name || 'Manager'} · v{r.version || 1}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                {new Date((r.updated_at || r.created_at) + 'Z').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}
                              </div>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                              {r.manager_comment}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

          ) : (
            /* Welcome / empty state */
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 64, opacity: 0.2 }}>📐</div>
              <h3 style={{ color: 'var(--text-secondary)' }}>Select a drawing to view</h3>
              <button
                id="upload-first-btn"
                className="btn btn-primary"
                onClick={() => setViewMode('upload')}
              >
                <Upload size={16} /> Upload New Drawing
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
