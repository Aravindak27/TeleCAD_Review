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
import { Upload, RefreshCw, FileText, CheckCircle, Clock, AlertTriangle, XCircle, ChevronRight, Star, Trash2, ListChecks, Search, ArrowUp, ArrowDown, Folder } from 'lucide-react'
import Navbar from '../components/Navbar'
import UploadComponent from '../components/UploadComponent'
import DrawingViewer from '../components/DrawingViewer'
import IssuePanel from '../components/IssuePanel'
import IssueForm from '../components/IssueForm'
import { drawingsAPI, authAPI } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

const STATUS_META = {
  draft:         { label: 'Draft',           color: 'var(--text-secondary)', Icon: FileText },
  pending:       { label: 'Pending Review',   color: 'var(--warning)',        Icon: Clock },
  reviewed:      { label: 'Under Review',     color: 'var(--info)',           Icon: RefreshCw },
  approved:      { label: 'Approved ✓',       color: 'var(--success)',        Icon: CheckCircle },
  sent_back:     { label: 'Revisions Needed', color: 'var(--danger)',         Icon: XCircle },
  older_version: { label: 'Older Version',    color: 'var(--text-muted)',     Icon: FileText },
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
  const [selectionType, setSelectionType] = useState(null) // 'file' | 'folder' | null
  const [selectionMode, setSelectionMode] = useState(false)
  const favKey = useMemo(() => `favDrawingThreads:${user?.id || 'anon'}`, [user?.id])
  const [favThreadIds, setFavThreadIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`favDrawingThreads:${user?.id || 'anon'}`) || '[]') } catch { return [] }
  })
  const favDrawingKey = useMemo(() => `favDrawingIds:${user?.id || 'anon'}`, [user?.id])
  const [favDrawingIds, setFavDrawingIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`favDrawingIds:${user?.id || 'anon'}`) || '[]') } catch { return [] }
  })

  const [managers, setManagers] = useState([])
  const [selectedManagerId, setSelectedManagerId] = useState(null)
  const [managersError, setManagersError] = useState(null)

  const [sidebarWidth, setSidebarWidth] = useState(320)
  const isResizing = useRef(false)

  const [showIssueForm, setShowIssueForm] = useState(false)
  const [issuePosition, setIssuePosition] = useState(null)
  const [selectedIssueId, setSelectedIssueId] = useState(null)
  const [editingIssue, setEditingIssue] = useState(null)

  const [managerSearchQuery, setManagerSearchQuery] = useState('')
  const [drawingSearchQuery, setDrawingSearchQuery] = useState('')
  const [drawingSortOrder, setDrawingSortOrder] = useState('desc')
  const [expandedFolders, setExpandedFolders] = useState({}) // 'desc' | 'asc'

  const handleIssueSaved = (issue) => {
    setSelected(prev => {
      const exists = prev.issues.find(i => i.id === issue.id)
      return {
        ...prev,
        issues: exists ? prev.issues.map(i => i.id === issue.id ? issue : i) : [...prev.issues, issue]
      }
    })
    setShowIssueForm(false)
    setEditingIssue(null)
  }

  const handleIssueDeleted = (id) => {
    setSelected(prev => ({ ...prev, issues: prev.issues.filter(i => i.id !== id) }))
    if (selectedIssueId === id) setSelectedIssueId(null)
  }

  const handleIssueUpdated = (issue) => {
    handleIssueSaved(issue)
  }

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
    const handleDrawingUpdate = async (e) => {
      const { detail } = e
      fetchDrawings()
      if (selected?.drawing?.id && String(selected.drawing.id) === String(detail?.drawing_id)) {
        try {
          const res = await drawingsAPI.get(selected.drawing.id)
          setSelected(res.data)
        } catch {}
      }
    }
    window.addEventListener('drawing-update', handleDrawingUpdate)
    return () => window.removeEventListener('drawing-update', handleDrawingUpdate)
  }, [fetchDrawings, selected?.drawing?.id])

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
    setDrawings(prev => {
      const filtered = prev.filter(d => String(d.thread_id || d.id) !== String(listItem.thread_id || listItem.id))
      return [listItem, ...filtered]
    })
    openDrawing(listItem)
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

  const filteredManagerGroups = useMemo(() => {
    return managerGroups.filter(m => 
      (m.manager_name || 'Manager').toLowerCase().includes(managerSearchQuery.toLowerCase())
    )
  }, [managerGroups, managerSearchQuery])

  const formatFolderName = (name) => {
    if (!name) return "Untitled Folder"
    let clean = name.includes('.') ? name.substring(0, name.lastIndexOf('.')) : name
    clean = clean.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
    return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "Untitled Folder"
  }

  const groupedThreads = useMemo(() => {
    const map = new Map()
    for (const d of activeManagerDrawings) {
      if (drawingSearchQuery && !(d.filename || '').toLowerCase().includes(drawingSearchQuery.toLowerCase())) {
        continue
      }
      const tid = d.thread_id || d.id
      if (!map.has(tid)) {
        map.set(tid, {
          thread_id: tid,
          thread_name: d.thread_name || formatFolderName(d.filename),
          versions: [],
          last_updated: new Date(d.updated_at || d.created_at).getTime()
        })
      }
      const thread = map.get(tid)
      thread.versions.push(d)
      const dTime = new Date(d.updated_at || d.created_at).getTime()
      if (dTime > thread.last_updated) {
        thread.last_updated = dTime
      }
    }
    
    for (const thread of map.values()) {
      thread.versions.sort((a, b) => (b.version || 1) - (a.version || 1))
    }

    return [...map.values()].sort((a, b) => {
      const af = isFavThread(a.thread_id) ? 1 : 0
      const bf = isFavThread(b.thread_id) ? 1 : 0
      if (af !== bf) return bf - af
      return drawingSortOrder === 'desc' 
        ? b.last_updated - a.last_updated 
        : a.last_updated - b.last_updated
    })
  }, [activeManagerDrawings, drawingSearchQuery, drawingSortOrder, isFavThread])

  const isFavDrawing = useCallback((id) => favDrawingIds.includes(Number(id)), [favDrawingIds])

  const toggleFavDrawing = (e, id) => {
    e.stopPropagation()
    setFavDrawingIds(prev => {
      const next = prev.includes(Number(id)) ? prev.filter(x => x !== Number(id)) : [...prev, Number(id)]
      localStorage.setItem(favDrawingKey, JSON.stringify(next))
      return next
    })
  }

  const sortVersions = useCallback((versions) => {
    if (!versions || versions.length === 0) return versions
    const [latest, ...rest] = versions
    const favRest = rest.filter(v => isFavDrawing(v.id))
    const normalRest = rest.filter(v => !isFavDrawing(v.id))
    return [latest, ...favRest, ...normalRest]
  }, [isFavDrawing])

  const toggleFolder = (e, threadId) => {
    e.stopPropagation()
    setExpandedFolders(prev => ({ ...prev, [threadId]: !prev[threadId] }))
  }

  const toggleFolderSelect = (threadId) => {
    if (selectionType === 'file') {
      alert("You can only select folders right now. Clear selection to select files.")
      return
    }
    setSelectionType('folder')
    setSelectedDrawingIds(prev => {
      const next = prev.includes(threadId) ? prev.filter(x => x !== threadId) : [...prev, threadId]
      if (next.length === 0) setSelectionType(null)
      return next
    })
  }

  const toggleSelect = (id) => {
    if (selectionType === 'folder') {
      alert("You can only select files right now. Clear selection to select folders.")
      return
    }
    setSelectionType('file')
    setSelectedDrawingIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      if (next.length === 0) setSelectionType(null)
      return next
    })
  }

  const clearSelection = () => {
    setSelectedDrawingIds([])
    setSelectionType(null)
  }

  const favouriteSelected = () => {
    if (!selectionMode || selectedDrawingIds.length === 0) return
    const threadIds = []
    if (selectionType === 'folder') {
      threadIds.push(...selectedDrawingIds)
    } else {
      selectedDrawingIds.forEach(id => {
        const d = drawings.find(x => x.id === id)
        if (d) threadIds.push(d.thread_id || d.id)
      })
    }
    const next = Array.from(new Set([...favThreadIds, ...threadIds]))
    setFavThreadIds(next)
    localStorage.setItem(favKey, JSON.stringify(next))
    clearSelection()
  }

  const deleteSelected = async () => {
    if (!selectionMode || selectedDrawingIds.length === 0) return

    // Employee pre-flight check
    if (selectionType === 'folder') {
      const blockedFolder = selectedDrawingIds.some(tid => {
        const t = groupedThreads.find(g => g.thread_id === tid)
        return t && t.versions.some(v => ['reviewed', 'sent_back'].includes(v.status))
      })
      if (blockedFolder) {
        alert("Cannot delete: a selected folder contains drawings under review or with revisions needed.")
        return
      }
    } else {
      const blockedFile = selectedDrawingIds.some(id => {
        const d = drawings.find(x => x.id === id)
        return d && !['draft', 'pending', 'approved', 'older_version'].includes(d.status)
      })
      if (blockedFile) {
        alert("Cannot delete: one or more selected drawings cannot be deleted in their current state.")
        return
      }
    }

    if (!window.confirm(`Are you sure you want to delete the selected ${selectionType}s?`)) return

    try {
      if (selectionType === 'folder') {
        for (const tid of selectedDrawingIds) {
          const t = groupedThreads.find(g => g.thread_id === tid)
          if (t && t.versions.length > 0) {
            await drawingsAPI.delete(t.versions[0].id, true)
          }
        }
      } else {
        for (const id of selectedDrawingIds) {
          await drawingsAPI.delete(id, false)
        }
      }
      clearSelection()
      setSelected(null)
      fetchDrawings()
    } catch (e) {
      alert("Error deleting some items. " + (e.response?.data?.detail || e.message))
    }
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
              <>
                <div style={{ marginBottom: 12, position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    placeholder="Search managers..." 
                    value={managerSearchQuery}
                    onChange={(e) => setManagerSearchQuery(e.target.value)}
                    style={{ width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 6, paddingBottom: 6, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 13 }}
                  />
                </div>
                {filteredManagerGroups.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No managers found.</div>
                ) : filteredManagerGroups.map((m) => {
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
              })}
              </>
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

                <div style={{ marginBottom: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input 
                      type="text" 
                      placeholder="Search drawings..." 
                      value={drawingSearchQuery}
                      onChange={(e) => setDrawingSearchQuery(e.target.value)}
                      style={{ width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 6, paddingBottom: 6, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 13 }}
                    />
                  </div>
                  <button 
                    className="btn btn-ghost btn-icon btn-sm" 
                    onClick={() => setDrawingSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
                    title={`Sort by Date: ${drawingSortOrder === 'desc' ? 'Newest first' : 'Oldest first'}`}
                    style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}
                  >
                    {drawingSortOrder === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
                  </button>
                </div>

                {groupedThreads.map(thread => {
                  const isExpanded = expandedFolders[thread.thread_id]
                  const latestStatus = thread.versions[0]?.status
                  const meta = STATUS_META[latestStatus] || STATUS_META.pending
                  const checked = thread.versions.some(v => selectedDrawingIds.includes(v.id))
                  const fav = isFavThread(thread.thread_id)
                  
                  return (
                    <div key={thread.thread_id} style={{ marginBottom: 6 }}>
                      {/* Folder Header */}
                      <div
                        onClick={(e) => toggleFolder(e, thread.thread_id)}
                        style={{
                          padding: '12px 12px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-card)',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                          {selectionMode && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectionType === 'folder' && selectedDrawingIds.includes(thread.thread_id)}
                                onChange={() => toggleFolderSelect(thread.thread_id)}
                                style={{ width: 16, height: 16, cursor: 'pointer' }}
                              />
                            </div>
                          )}
                           <Folder size={14} color="var(--primary)" />
                           <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                             {thread.thread_name}
                             {fav && <Star size={12} style={{ marginLeft: 8 }} color="var(--warning)" fill="var(--warning)" />}
                             <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>({thread.versions.length} version{thread.versions.length !== 1 && 's'})</span>
                           </div>
                        </div>
                        <ChevronRight size={14} color="var(--text-muted)" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                      </div>

                      {/* Versions */}
                      {isExpanded && (
                        <div style={{ paddingLeft: 16, marginTop: 4 }}>
                          {sortVersions(thread.versions).map((v, vIdx) => {
                            const vMeta = STATUS_META[v.status] || STATUS_META.pending
                            const isActive = selected?.drawing?.id === v.id
                            const vChecked = selectedDrawingIds.includes(v.id)
                            const isLatest = vIdx === 0
                            const vFav = isFavDrawing(v.id)
                            return (
                              <div
                                key={v.id}
                                onClick={() => openDrawing(v)}
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: 'var(--radius-md)',
                                  border: `1px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
                                  background: isActive ? 'var(--primary-muted)' : 'transparent',
                                  cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', gap: 8,
                                  marginBottom: 2
                                }}
                              >
                                {selectionMode && (
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={selectionType === 'file' && vChecked}
                                      onChange={() => toggleSelect(v.id)}
                                      style={{ width: 14, height: 14, cursor: 'pointer' }}
                                    />
                                  </div>
                                )}
                                <FileText size={12} color={isActive ? 'var(--primary)' : 'var(--text-muted)'} />
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                                  <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                    {v.filename}
                                    <span className="badge" style={{ marginLeft: 4, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>v{v.version}</span>
                                    {isLatest && <span className="badge" style={{ marginLeft: 4, background: 'var(--primary-muted)', border: '1px solid var(--primary)', color: 'var(--primary)', fontSize: 9 }}>Latest</span>}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                    <vMeta.Icon size={10} color={vMeta.color} />
                                    <span style={{ fontSize: 10, color: vMeta.color, fontWeight: 600 }}>{vMeta.label}</span>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                      {new Date((v.updated_at || v.created_at) + 'Z').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}
                                    </span>
                                  </div>
                                </div>
                                {/* Per-drawing favourite button */}
                                <button
                                  onClick={(e) => toggleFavDrawing(e, v.id)}
                                  title={vFav ? 'Remove from favourites' : 'Add to favourites'}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}
                                >
                                  <Star size={11} color={vFav ? 'var(--warning)' : 'var(--text-muted)'} fill={vFav ? 'var(--warning)' : 'none'} />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
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

                  {/* Re-upload only if sent_back AND not an older_version */}
                  {selected.drawing.status === 'sent_back' && (
                    <button
                      id="reupload-btn"
                      className="btn btn-warning btn-sm"
                      onClick={() => { setReupload(true); setViewMode('upload') }}
                    >
                      <Upload size={13} /> Upload Corrected Drawing
                    </button>
                  )}
                  {/* Submit if draft */}
                  {selected.drawing.status === 'draft' && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={async () => {
                        try {
                          await drawingsAPI.submit(selected.drawing.id);
                          setSelected(prev => ({...prev, drawing: {...prev.drawing, status: 'pending'}}));
                          setDrawings(prev => prev.map(d => d.id === selected.drawing.id ? {...d, status: 'pending'} : d));
                        } catch (e) {
                          alert("Failed to submit drawing.");
                        }
                      }}
                    >
                      <CheckCircle size={13} /> Submit to Manager
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
                    issues={selected.issues}
                    bounds={selected.bounds}
                    selectedId={selectedIssueId}
                    onSelectIssue={(i) => setSelectedIssueId(i.id)}
                    onClickPosition={(x, y, pk) => {
                      setIssuePosition({ x, y, page_index: pk })
                      setEditingIssue(null)
                      setShowIssueForm(true)
                    }}
                    canAnnotate={true}
                    managerMode={false}
                  />
                </div>

                {/* Issues — visible to employee to see doubts and manager comments */}
                <div style={{ padding: 16, overflowY: 'auto' }}>
                  <div style={{ marginBottom: 12, fontWeight: 700, fontSize: 13 }}>
                    🔍 Detected Issues & Comments
                  </div>
                  <IssuePanel
                    issues={selected.issues}
                    selectedId={selectedIssueId}
                    managerMode={false}
                    canEdit={true}
                    onSelect={(i) => setSelectedIssueId(i.id)}
                    onEdit={(i) => { setEditingIssue(i); setShowIssueForm(true); }}
                    onIssueUpdated={handleIssueUpdated}
                    onIssueDeleted={handleIssueDeleted}
                  />

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

      {/* Render Issue Form for Employee */}
      {showIssueForm && (
        <IssueForm
          mode={editingIssue ? 'edit' : 'add'}
          drawingId={selected?.drawing?.id}
          initial={editingIssue || {}}
          position={issuePosition || {}}
          onSave={handleIssueSaved}
          onClose={() => {
            setShowIssueForm(false)
            setEditingIssue(null)
          }}
        />
      )}
    </div>
  )
}
