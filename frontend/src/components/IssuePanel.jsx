/**
 * components/IssuePanel.jsx — Issue list panel for manager and employee views.
 *
 * Manager mode: Edit, Delete, Resolve buttons per issue
 * Employee mode: Read-only list with resolve status
 *
 * Issues are manager-created, sorted by severity (Critical → Warning → Info).
 */

import React, { useState } from 'react'
import { Edit2, Trash2, CheckCircle, Circle, AlertTriangle, AlertCircle, Info, User } from 'lucide-react'
import { issuesAPI } from '../api/client'

const SEV_ORDER    = { Critical: 0, Warning: 1, Info: 2 }
const SEV_CLASS    = { Critical: 'badge-critical', Warning: 'badge-warning', Info: 'badge-info' }
const SEV_ICON     = { Critical: AlertCircle, Warning: AlertTriangle, Info: Info }

function IssueItem({ issue, selected, managerMode, onSelect, onEdit, onDelete, onResolve }) {
  const [deleting,  setDeleting]  = useState(false)
  const [resolving, setResolving] = useState(false)
  const Icon = SEV_ICON[issue.severity] || Info

  const handleDelete = async (e) => {
    e.stopPropagation()
    if (!confirm('Delete this issue?')) return
    setDeleting(true)
    try { await issuesAPI.delete(issue.id); onDelete(issue.id) }
    catch { alert('Failed to delete.') }
    finally { setDeleting(false) }
  }

  const handleResolve = async (e) => {
    e.stopPropagation()
    setResolving(true)
    try { const res = await issuesAPI.resolve(issue.id); onResolve(res.data) }
    catch { alert('Failed to update.') }
    finally { setResolving(false) }
  }

  return (
    <div
      className={`issue-item slide-in ${issue.resolved ? 'resolved' : ''} ${selected ? 'selected' : ''}`}
      onClick={() => onSelect?.(issue)}
    >
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
          <Icon size={14} color={
            issue.severity === 'Critical' ? 'var(--danger)'
            : issue.severity === 'Warning' ? 'var(--warning)'
            : 'var(--info)'
          } />
          <span style={{ fontWeight:700, fontSize:13, color:'var(--text-primary)' }}>
            {issue.type}
          </span>
          <span className={`badge ${SEV_CLASS[issue.severity]}`}>{issue.severity}</span>
          {issue.resolved && <span className="badge badge-success">Resolved</span>}
        </div>

        {/* Creator badge */}
        <span style={{
          display:'flex', alignItems:'center', gap:3, fontSize:10,
          color:'var(--text-muted)', flexShrink:0,
        }}>
          <User size={10} />
          {issue.created_by}
        </span>
      </div>

      {/* Message */}
      <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.5, marginBottom:8 }}>
        {issue.message}
      </p>

      {/* Coordinates */}
      {(issue.position_x !== 0 || issue.position_y !== 0) && (
        <div className="coord-tag" style={{ marginBottom:8, display:'inline-block' }}>
          x:{issue.position_x?.toFixed(1)}  y:{issue.position_y?.toFixed(1)}
        </div>
      )}

      {/* Manager actions */}
      {managerMode && (
        <div style={{ display:'flex', gap:6, marginTop:8 }}>
          <button
            id={`edit-issue-${issue.id}-btn`}
            className="btn btn-secondary btn-sm"
            onClick={(e) => { e.stopPropagation(); onEdit(issue) }}
          >
            <Edit2 size={11} /> Edit
          </button>

          <button
            id={`resolve-issue-${issue.id}-btn`}
            className={`btn btn-sm ${issue.resolved ? 'btn-secondary' : 'btn-success'}`}
            onClick={handleResolve}
            disabled={resolving}
          >
            {issue.resolved
              ? <><Circle size={11} /> Unresolve</>
              : <><CheckCircle size={11} /> Resolve</>}
          </button>

          <button
            id={`delete-issue-${issue.id}-btn`}
            className="btn btn-danger btn-sm"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? <div className="spinner" style={{width:10,height:10}}/> : <Trash2 size={11} />}
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

export default function IssuePanel({
  issues       = [],
  selectedId   = null,
  managerMode  = false,
  onSelect,
  onEdit,
  onIssueUpdated,   // (updatedIssue) from resolve
  onIssueDeleted,   // (id)
}) {
  const sorted = [...issues].sort((a, b) => {
    const sevDiff = (SEV_ORDER[a.severity] ?? 2) - (SEV_ORDER[b.severity] ?? 2)
    return sevDiff || (a.resolved ? 1 : -1)
  })

  const counts = {
    Critical: issues.filter(i => i.severity === 'Critical' && !i.resolved).length,
    Warning:  issues.filter(i => i.severity === 'Warning'  && !i.resolved).length,
    Info:     issues.filter(i => i.severity === 'Info'     && !i.resolved).length,
    resolved: issues.filter(i => i.resolved).length,
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Summary bar */}
      <div style={{
        display:'flex', gap:8, marginBottom:16, flexWrap:'wrap',
      }}>
        {[
          ['Critical', counts.Critical, 'badge-critical'],
          ['Warning',  counts.Warning,  'badge-warning'],
          ['Info',     counts.Info,     'badge-info'],
          ['Resolved', counts.resolved, 'badge-success'],
        ].map(([label, count, cls]) => (
          <span key={label} className={`badge ${cls}`}>
            {count} {label}
          </span>
        ))}
        <span className="badge" style={{ marginLeft:'auto', background:'var(--bg-hover)', color:'var(--text-secondary)', border:'1px solid var(--border)' }}>
          {issues.length} Total
        </span>
      </div>

      {/* List */}
      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:8 }}>
        {sorted.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <h3>No issues found</h3>
            <p style={{fontSize:13}}>No issues yet. A manager can add them during review.</p>
          </div>
        ) : sorted.map(issue => (
          <IssueItem
            key={issue.id}
            issue={issue}
            selected={issue.id === selectedId}
            managerMode={managerMode}
            onSelect={onSelect}
            onEdit={onEdit}
            onDelete={onIssueDeleted}
            onResolve={onIssueUpdated}
          />
        ))}
      </div>
    </div>
  )
}
