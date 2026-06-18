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
  ChevronRight, Eye, Users, Star, Trash2, ListChecks, Search, ArrowUp, ArrowDown, Folder
} from 'lucide-react'
import Navbar from '../components/Navbar'
import DrawingViewer from '../components/DrawingViewer'
import IssuePanel from '../components/IssuePanel'
import IssueForm from '../components/IssueForm'
import ManagerReviewModal from '../components/ManagerReviewModal'
import { drawingsAPI } from '../api/client'

const STATUS_META = {
  pending:       { label: 'Pending',      color: '#d29922' },
  reviewed:      { label: 'Reviewing',    color: '#79c0ff' },
  approved:      { label: 'Approved',     color: '#3fb950' },
  sent_back:     { label: 'Sent Back',    color: '#f85149' },
  older_version: { label: 'Older Version',color: '#6e7681' },
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
  const [selectionType, setSelectionType] = useState(null) // 'file' | 'folder' | null
  const [selectionMode, setSelectionMode] = useState(false)

  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('')
  const [drawingSearchQuery, setDrawingSearchQuery] = useState('')
  const [drawingSortOrder, setDrawingSortOrder] = useState('desc')
  const [expandedFolders, setExpandedFolders] = useState({})
  const [threadHistory, setThreadHistory] = useState([])
  const favDrawingKey = `favDrawingIds:mgr:${JSON.parse(localStorage.getItem('user') || '{}')?.id || 'anon'}`
  const [favDrawingIds, setFavDrawingIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(favDrawingKey) || '[]') } catch { return [] }
  })

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

  useEffect(() => {
    const handleDrawingUpdate = async (e) => {
      const { detail } = e
      fetchDrawings()
      if (selected?.drawing?.id && String(selected.drawing.id) === String(detail?.drawing_id)) {
        try {
          const res = await drawingsAPI.get(selected.drawing.id)
          setSelected(res.data)
          setIssues(res.data.issues || [])
        } catch {}
      }
    }
    window.addEventListener('drawing-update', handleDrawingUpdate)
    return () => window.removeEventListener('drawing-update', handleDrawingUpdate)
  }, [fetchDrawings, selected?.drawing?.id])

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
    } catch {}
  }

  useEffect(() => {
    const threadId = selected?.drawing?.thread_id
    if (!threadId) { setThreadHistory([]); return }
    let cancelled = false
      ; (async () => {
        try {
          const res = await drawingsAPI.history()
          const rows = (res.data || []).filter(r => String(r.thread_id) === String(threadId))
            .sort((a, b) => (b.version || 1) - (a.version || 1))
          if (!cancelled) setThreadHistory(rows)
        } catch {
          if (!cancelled) setThreadHistory([])
        }
      })()
    return () => { cancelled = true }
  }, [selected?.drawing?.thread_id])

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

  const filteredEmployees = useMemo(() => {
    return employees.filter(e => 
      (e.employee_name || 'Unknown').toLowerCase().includes(employeeSearchQuery.toLowerCase())
    )
  }, [employees, employeeSearchQuery])

  const formatFolderName = (name) => {
    if (!name) return "Untitled Folder"
    let clean = name.includes('.') ? name.substring(0, name.lastIndexOf('.')) : name
    clean = clean.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
    return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "Untitled Folder"
  }

  const groupedThreads = useMemo(() => {
    const map = new Map()
    for (const d of activeEmployeeDrawings) {
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
  }, [activeEmployeeDrawings, drawingSearchQuery, drawingSortOrder, isFavThread])

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
    
    // Manager cannot delete drawings under review
    if (selectionType === 'folder') {
        const hasReviewed = selectedDrawingIds.some(tid => {
            const t = groupedThreads.find(g => g.thread_id === tid)
            return t && t.versions.some(v => v.status === 'reviewed')
        })
        if (hasReviewed) {
          alert("Cannot delete: a folder contains drawings currently under review. Wait for Approval or Send Back first.")
          return
        }
        if (!window.confirm("Are you sure you want to delete the selected folders?")) return
    } else {
        const hasReviewed = selectedDrawingIds.some(id => {
            const d = drawings.find(x => x.id === id)
            return d && d.status === 'reviewed'
        })
        if (hasReviewed) {
          alert("Cannot delete a drawing currently under review. Wait for Approval or Send Back first.")
          return
        }
        if (!window.confirm("Are you sure you want to delete the selected files?")) return
    }

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
      setIssues([])
      setSelectedIssue(null)
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
              <>
                <div style={{ marginBottom: 12, position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    placeholder="Search employees..." 
                    value={employeeSearchQuery}
                    onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                    style={{ width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 6, paddingBottom: 6, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 13 }}
                  />
                </div>
                {filteredEmployees.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No employees found.</div>
                ) : filteredEmployees.map((e) => {
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
              })}
              </>
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
                                    <span style={{ fontSize: 10, color: vMeta.color, fontWeight: 600 }}>● {vMeta.label}</span>
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
