/**
 * components/UploadComponent.jsx — Drag-and-drop DXF file uploader.
 *
 * Features:
 *   • Drag-and-drop zone with visual feedback
 *   • File type validation (.dxf only, rejects .dwg with message)
 *   • Upload progress indicator
 *   • "Use Demo Drawing" button for quick testing
 *   • Animated state transitions
 */

import React, { useState, useRef } from 'react'
import { Upload, FileText, Zap, AlertCircle, CheckCircle } from 'lucide-react'
import { drawingsAPI } from '../api/client'

export default function UploadComponent({
  onUploadComplete,
  assignedManagerId = null,
  threadId = null,
  disabled = false,
}) {
  const [dragging,  setDragging]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState(null)
  const [progress,  setProgress]  = useState('')
  const fileRef = useRef(null)

  const handleFile = async (file) => {
    setError(null)

    // Validate extension
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['dxf', 'dwg', 'pdf', 'png', 'jpg', 'jpeg'].includes(ext)) {
      setError('Only .dxf, .dwg, .pdf, .png, .jpg, and .jpeg files are accepted.')
      return
    }

    await doUpload(file)
  }

  const doUpload = async (file) => {
    setUploading(true)
    setProgress('Uploading file…')

    const formData = new FormData()
    if (file) formData.append('file', file)
    else formData.append('use_demo', 'true')
    if (assignedManagerId) formData.append('assigned_manager_id', String(assignedManagerId))
    if (threadId) formData.append('thread_id', String(threadId))

    try {
      setProgress('Processing drawing…')
      const res = await drawingsAPI.upload(formData)
      setProgress('Rendering drawing…')
      // small delay so user sees the progress step
      await new Promise(r => setTimeout(r, 300))
      onUploadComplete(res.data)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Upload failed. Please try again.'
      setError(msg)
    } finally {
      setUploading(false)
      setProgress('')
    }
  }

  const handleDemo = () => doUpload(null)

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const onDragOver  = (e) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = ()  => setDragging(false)
  const onDrop      = (e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }
  const onFileInput = (e) => { const f = e.target.files[0]; if (f) handleFile(f) }

  return (
    <div className="fade-in" style={{ maxWidth:600, margin:'0 auto' }}>
      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !uploading && !disabled && fileRef.current?.click()}
        style={{
          border:        `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius:  'var(--radius-xl)',
          padding:       '48px 32px',
          textAlign:     'center',
          cursor:        uploading || disabled ? 'not-allowed' : 'pointer',
          background:    dragging ? 'var(--primary-muted)' : 'var(--bg-card)',
          transition:    'all 0.2s',
          boxShadow:     dragging ? 'var(--shadow-glow)' : 'none',
          opacity:       disabled ? 0.7 : 1,
        }}
      >
        <input
          ref={fileRef}
          id="dxf-file-input"
          type="file"
          accept=".dxf,.dwg,.pdf,.png,.jpg,.jpeg"
          style={{ display:'none' }}
          onChange={onFileInput}
        />

        {uploading ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
            <div className="spinner" style={{ width:48, height:48 }} />
            <div style={{ fontWeight:600, fontSize:15 }}>{progress}</div>
            <div className="progress-bar" style={{ width:'200px' }} />
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>
              This may take up to 15 seconds for large drawings
            </div>
          </div>
        ) : (
          <>
            <div style={{
              width:72, height:72, borderRadius:'var(--radius-lg)',
              background:'var(--primary-muted)',
              display:'flex', alignItems:'center', justifyContent:'center',
              margin:'0 auto 20px',
              transition:'transform 0.2s',
              transform: dragging ? 'scale(1.1)' : 'scale(1)',
            }}>
              <Upload size={32} color="var(--primary)" />
            </div>

            <h3 style={{ fontSize:'1.1rem', marginBottom:8 }}>
              {dragging ? 'Drop your drawing here' : 'Drag & drop your drawing'}
            </h3>
            <p style={{ fontSize:14, marginBottom:20 }}>
              or <span style={{ color:'var(--primary)', fontWeight:600 }}>click to browse</span>
            </p>

            <div style={{
              alignItems:'center', justifyContent:'center',
              gap:8, fontSize:12, color:'var(--text-muted)',
              padding:'8px 16px', background:'var(--bg-surface)',
              borderRadius:20,
              display:'inline-flex',
            }}>
              <FileText size={12} />
              Accepts DXF, DWG, PDF, or Image files &middot; Max 50 MB
            </div>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="alert alert-error fade-in" style={{ marginTop:16 }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Demo divider */}
      {!uploading && !disabled && (
        <>
          <div style={{
            display:'flex', alignItems:'center', gap:12, margin:'20px 0',
            color:'var(--text-muted)', fontSize:13,
          }}>
            <div className="divider" style={{ flex:1, margin:0 }} />
            or
            <div className="divider" style={{ flex:1, margin:0 }} />
          </div>

          <button
            id="use-demo-btn"
            className="btn btn-secondary w-full"
            onClick={handleDemo}
            style={{ justifyContent:'center', padding:'14px' }}
          >
            <Zap size={16} color="var(--warning)" />
            Use Demo Telecom Drawing
            <span style={{
              marginLeft:4, fontSize:11, padding:'2px 8px',
              background:'var(--warning-muted)', color:'var(--warning)',
              borderRadius:20, fontWeight:700,
            }}>DEMO</span>
          </button>

          <p style={{ textAlign:'center', fontSize:12, marginTop:10, color:'var(--text-muted)' }}>
            Generates a synthetic 3-sector telecom site for quick testing
          </p>
        </>
      )}
    </div>
  )
}
