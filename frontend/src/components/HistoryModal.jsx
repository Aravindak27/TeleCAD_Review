import React, { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Clock } from 'lucide-react'
import { drawingsAPI } from '../api/client'

const STATUS_LABEL = {
  pending: 'Pending',
  reviewed: 'Reviewing',
  approved: 'Approved',
  sent_back: 'Sent Back',
}

export default function HistoryModal({ open, onClose }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const topScrollRef = useRef(null)
  const bottomScrollRef = useRef(null)
  const tableRef = useRef(null)
  const [tableWidth, setTableWidth] = useState(800)

  useEffect(() => {
    if (!open || !tableRef.current) return
    const ro = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.contentRect.width > 0) {
          setTableWidth(entry.contentRect.width)
        }
      }
    })
    ro.observe(tableRef.current)
    return () => ro.disconnect()
  }, [open, rows])

  const handleTopScroll = (e) => {
    if (bottomScrollRef.current && topScrollRef.current) {
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft
    }
  }

  const handleBottomScroll = (e) => {
    if (bottomScrollRef.current && topScrollRef.current) {
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft
    }
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await drawingsAPI.history()
        if (!cancelled) setRows(res.data || [])
      } catch (err) {
        const d = err.response?.data?.detail
        setError(Array.isArray(d) ? d.map((x) => x.msg || x).join(' ') : (d || 'Failed to load history.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 2000,
      }}
    >
      <div className="modal fade-in" style={{ maxWidth: 860 }}>
        <div className="modal-header" style={{ marginBottom: 14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 'var(--radius-md)',
              background: 'var(--info-muted)', display:'flex', alignItems:'center', justifyContent:'center',
              border: '1px solid rgba(121,192,255,0.35)',
            }}>
              <Clock size={18} color="var(--info)" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>History</h2>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                All drawing versions and latest updates
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div 
          ref={topScrollRef} 
          onScroll={handleTopScroll} 
          style={{ overflowX: 'auto', marginBottom: 4 }}
        >
          <div style={{ height: 1, width: tableWidth }} />
        </div>

        <div className="table-container" style={{ background: 'var(--bg-card)', overflowX: 'auto' }} ref={bottomScrollRef} onScroll={handleBottomScroll}>
          <table ref={tableRef} style={{ minWidth: 800 }}>
            <thead>
              <tr>
                <th>Drawing</th>
                <th>Employee</th>
                <th>Manager</th>
                <th>Status</th>
                <th>Version</th>
                <th>Date</th>
                <th>Time (IST)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 18, color:'var(--text-muted)' }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 18, color:'var(--text-muted)' }}>No history yet.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 700 }}>{r.filename}</td>
                  <td>{r.employee_name}</td>
                  <td>{r.manager_name || '—'}</td>
                  <td>
                    <span className="badge" style={{ background:'var(--bg-hover)', border:'1px solid var(--border)', color:'var(--text-secondary)' }}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                  </td>
                  <td>v{r.version || 1}</td>
                  <td style={{ whiteSpace:'nowrap' }}>
                    {new Date(r.updated_at || r.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' })}
                  </td>
                  <td style={{ whiteSpace:'nowrap' }}>
                    {new Date(r.updated_at || r.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', marginTop: 14 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

