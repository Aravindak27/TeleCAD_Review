/**
 * components/IssueForm.jsx — Add / Edit issue modal form.
 *
 * Props:
 *   mode         — "add" | "edit"
 *   drawingId    — required for "add"
 *   initial      — existing issue data (for "edit")
 *   position     — {x, y} pre-filled from click (for "add")
 *   onSave(data) — callback after successful save
 *   onClose()    — called to close modal
 */

import React, { useState } from 'react'
import { Save, X, AlertTriangle, MapPin } from 'lucide-react'
import { issuesAPI } from '../api/client'

const ISSUE_TYPES = [
  'Tower', 'Antenna', 'Microwave', 'Equipment',
  'Cable', 'Foundation', 'Layout', 'Text', 'General',
]
const SEVERITIES = ['Critical', 'Warning', 'Info']

export default function IssueForm({ mode = 'add', drawingId, initial = {}, position = {}, onSave, onClose }) {
  const [form,   setForm]   = useState({
    type:       initial.type       || 'General',
    severity:   initial.severity   || 'Warning',
    message:    initial.message    || '',
    position_x: initial.position_x ?? position.x ?? 0,
    position_y: initial.position_y ?? position.y ?? 0,
    page_index: initial.page_index ?? position.page_index ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.message.trim()) { setError('Message is required.'); return }

    setSaving(true)
    setError(null)
    try {
      let res
      if (mode === 'add') {
        res = await issuesAPI.create({ drawing_id: drawingId, ...form })
      } else {
        res = await issuesAPI.update(initial.id, form)
      }
      onSave(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save issue.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in" style={{ maxWidth:480 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{
              width:36, height:36, borderRadius:'var(--radius-md)',
              background:'var(--danger-muted)',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <AlertTriangle size={18} color="var(--danger)" />
            </div>
            <h2 style={{ fontSize:'1.1rem' }}>
              {mode === 'add' ? 'Add New Issue' : 'Edit Issue'}
            </h2>
          </div>
          <button id="close-issue-form-btn" className="btn btn-ghost btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Type */}
          <div className="form-group" style={{ marginBottom:16 }}>
            <label htmlFor="issue-type-select">Issue Type</label>
            <select
              id="issue-type-select"
              value={form.type}
              onChange={e => set('type', e.target.value)}
            >
              {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Severity */}
          <div className="form-group" style={{ marginBottom:16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.3px' }}>Severity</div>
            <div style={{ display:'flex', gap:8 }}>
              {SEVERITIES.map(s => (
                <button
                  key={s}
                  type="button"
                  id={`severity-${s.toLowerCase()}-btn`}
                  onClick={() => set('severity', s)}
                  style={{
                    flex:1, padding:'8px',
                    borderRadius:'var(--radius-md)',
                    border:`2px solid ${form.severity === s ? 'currentColor' : 'var(--border)'}`,
                    background: form.severity === s
                      ? (s === 'Critical' ? 'var(--danger-muted)'
                        : s === 'Warning' ? 'var(--warning-muted)'
                        : 'var(--info-muted)')
                      : 'var(--bg-surface)',
                    color: s === 'Critical' ? 'var(--danger)'
                         : s === 'Warning'  ? 'var(--warning)'
                         : 'var(--info)',
                    fontWeight:700, fontSize:12,
                    cursor:'pointer', transition:'all 0.15s',
                  }}
                >{s}</button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="form-group" style={{ marginBottom:16 }}>
            <label htmlFor="issue-message-input">Description</label>
            <textarea
              id="issue-message-input"
              value={form.message}
              onChange={e => set('message', e.target.value)}
              placeholder="Describe the engineering issue in detail…"
              rows={3}
            />
          </div>

          {/* Position */}
          <div className="form-group" style={{ marginBottom:20 }}>
            <label htmlFor="pos-x-input">
              <MapPin size={12} style={{ marginRight:4 }} />
              Position (CAD coordinates)
            </label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <input
                id="pos-x-input"
                type="number"
                step="0.01"
                placeholder="X"
                value={form.position_x}
                onChange={e => set('position_x', parseFloat(e.target.value) || 0)}
              />
              <input
                id="pos-y-input"
                type="number"
                step="0.01"
                placeholder="Y"
                value={form.position_y}
                onChange={e => set('position_y', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom:16 }}>
              <X size={14} /> {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button type="button" id="cancel-issue-btn" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" id="save-issue-btn" className="btn btn-primary" disabled={saving}>
              {saving ? <><div className="spinner" style={{width:14,height:14}} /> Saving…</> : <><Save size={14} /> Save Issue</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
