/**
 * ManagerReviewModal — Single dialog for annotate (add issue) and review decision
 * (approve / send back). Opened from drawing clicks or toolbar actions.
 */

import React, { useState, useEffect, useRef } from 'react'
import {
  X, Save, CheckCircle, XCircle, AlertTriangle, MapPin, ClipboardList,
} from 'lucide-react'
import { issuesAPI } from '../api/client'

const ISSUE_TYPES = [
  'Tower', 'Antenna', 'Microwave', 'Equipment',
  'Cable', 'Foundation', 'Layout', 'Text', 'General',
]
const SEVERITIES = ['Critical', 'Warning', 'Info']

export default function ManagerReviewModal({
  open,
  onClose,
  drawing,
  position = { x: 0, y: 0 },
  focusSection = 'annotate',
  onIssueSaved,
  onStatusUpdated,
}) {
  const annotateRef = useRef(null)
  const decisionRef = useRef(null)

  const [form, setForm] = useState({
    type: 'General',
    severity: 'Warning',
    message: '',
    position_x: position.x ?? 0,
    position_y: position.y ?? 0,
    page_index: position.page_index ?? 0,
  })
  const [sendBackComment, setSendBackComment] = useState('')
  const [savingIssue, setSavingIssue] = useState(false)
  const [submittingStatus, setSubmittingStatus] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setForm((f) => ({
      ...f,
      position_x: position.x ?? 0,
      position_y: position.y ?? 0,
      page_index: position.page_index ?? 0,
    }))
    setError(null)
  }, [open, position.x, position.y, position.page_index])

  useEffect(() => {
    if (!open) return
    const el = focusSection === 'decision' ? decisionRef.current : annotateRef.current
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [open, focusSection])

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }))

  const handleSaveIssue = async (e) => {
    e.preventDefault()
    if (!form.message.trim()) {
      setError('Enter a description for the issue.')
      return
    }
    setSavingIssue(true)
    setError(null)
    try {
      const res = await issuesAPI.create({
        drawing_id: drawing.id,
        type: form.type,
        severity: form.severity,
        message: form.message.trim(),
        position_x: form.position_x,
        position_y: form.position_y,
        page_index: form.page_index,
      })
      onIssueSaved?.(res.data)
      setForm((f) => ({ ...f, message: '' }))
    } catch (err) {
      const d = err.response?.data?.detail
      setError(Array.isArray(d) ? d.map((x) => x.msg || x).join(' ') : (d || err.message || 'Could not save issue.'))
    } finally {
      setSavingIssue(false)
    }
  }

  const submitStatus = async (status) => {
    if (status === 'sent_back' && !sendBackComment.trim()) {
      setError('Add a comment explaining what needs to change.')
      return
    }
    setSubmittingStatus(true)
    setError(null)
    try {
      await onStatusUpdated?.(status, status === 'sent_back' ? sendBackComment.trim() : undefined)
      setSendBackComment('')
      onClose()
    } catch (err) {
      const d = err.response?.data?.detail
      setError(Array.isArray(d) ? d.map((x) => x.msg || x).join(' ') : (d || err.message || 'Could not update drawing status.'))
    } finally {
      setSubmittingStatus(false)
    }
  }

  if (!open || !drawing) return null

  const isApproved = drawing.status === 'approved'

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal fade-in"
        style={{ maxWidth: 560 }}
        role="dialog"
        aria-labelledby="review-modal-title"
        aria-modal="true"
      >
        <div className="modal-header" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-md)',
                background: 'var(--primary-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ClipboardList size={20} color="var(--primary)" />
            </div>
            <div>
              <h2 id="review-modal-title" style={{ fontSize: '1.15rem', margin: 0 }}>
                Review &amp; annotate
              </h2>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {drawing.filename}
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {focusSection === 'annotate' ? (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
            Add an issue at the clicked location.
          </p>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
            Approve the drawing or send it back to the employee with notes.
          </p>
        )}

        {/* —— Annotate —— */}
        {focusSection === 'annotate' && (
          <section
          ref={annotateRef}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 16,
            marginBottom: 20,
            background: 'var(--bg-surface)',
          }}
        >
          <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 14 }}>
            <AlertTriangle size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Add issue
          </h3>

          <form onSubmit={handleSaveIssue}>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label htmlFor="mgr-issue-type">Type</label>
              <select
                id="mgr-issue-type"
                value={form.type}
                onChange={(e) => set('type', e.target.value)}
              >
                {ISSUE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.3px' }}>Severity</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {SEVERITIES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set('severity', s)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${form.severity === s ? 'currentColor' : 'var(--border)'}`,
                      background:
                        form.severity === s
                          ? (s === 'Critical'
                            ? 'var(--danger-muted)'
                            : s === 'Warning'
                              ? 'var(--warning-muted)'
                              : 'var(--info-muted)')
                          : 'var(--bg-card)',
                      color:
                        s === 'Critical'
                          ? 'var(--danger)'
                          : s === 'Warning'
                            ? 'var(--warning)'
                            : 'var(--info)',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label htmlFor="mgr-issue-msg">Description</label>
              <textarea
                id="mgr-issue-msg"
                rows={3}
                value={form.message}
                onChange={(e) => set('message', e.target.value)}
                placeholder="Describe what needs attention at this location…"
              />
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label htmlFor="mgr-pos-x">
                <MapPin size={12} style={{ marginRight: 4 }} />
                Position (CAD)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  id="mgr-pos-x"
                  type="number"
                  step="0.01"
                  value={form.position_x}
                  onChange={(e) => set('position_x', parseFloat(e.target.value) || 0)}
                />
                <input
                  id="mgr-pos-y"
                  type="number"
                  step="0.01"
                  value={form.position_y}
                  onChange={(e) => set('position_y', parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={savingIssue} style={{ width: '100%' }}>
              {savingIssue ? (
                <>
                  <div className="spinner" style={{ width: 14, height: 14 }} /> Saving…
                </>
              ) : (
                <>
                  <Save size={14} /> Save issue
                </>
              )}
            </button>
          </form>
        </section>
        )}

        {/* —— Decision —— */}
        {focusSection === 'decision' && (
          <section
          ref={decisionRef}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 16,
            marginBottom: 12,
            background: 'var(--bg-surface)',
          }}
        >
          <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 14 }}>
            Complete review
          </h3>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label htmlFor="sendback-comment">Comment when sending back (required for Send back)</label>
            <textarea
              id="sendback-comment"
              rows={3}
              value={sendBackComment}
              onChange={(e) => setSendBackComment(e.target.value)}
              placeholder="What should the employee change before resubmitting?"
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              className="btn btn-success"
              style={{ flex: 1, minWidth: 140 }}
              disabled={isApproved || submittingStatus}
              onClick={() => submitStatus('approved')}
            >
              {submittingStatus ? (
                <div className="spinner" style={{ width: 14, height: 14 }} />
              ) : (
                <>
                  <CheckCircle size={14} /> Approve drawing
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              style={{ flex: 1, minWidth: 140 }}
              disabled={submittingStatus}
              onClick={() => submitStatus('sent_back')}
            >
              {submittingStatus ? (
                <div className="spinner" style={{ width: 14, height: 14 }} />
              ) : (
                <>
                  <XCircle size={14} /> Send back
                </>
              )}
            </button>
          </div>
          {isApproved && (
            <p style={{ fontSize: 12, color: 'var(--success)', marginTop: 10, marginBottom: 0 }}>
              This drawing is already approved.
            </p>
          )}
        </section>
        )}

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
