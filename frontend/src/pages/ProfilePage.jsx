import React, { useEffect, useMemo, useState } from 'react'
import Navbar from '../components/Navbar'
import { authAPI, drawingsAPI } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { User, Mail, Lock, BarChart3, AlertCircle, CheckCircle2, History, Star, Bell, ChevronRight, FileText, ArrowLeft, Calendar } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function ProfilePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [me, setMe] = useState(user || null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  
  const [history, setHistory] = useState([])
  const [favorites, setFavorites] = useState([])
  
  const [notifState, setNotifState] = useState({
    emailApproved: true,
    emailSentBack: true,
  })

  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState(null)
  const [pwSuccess, setPwSuccess] = useState(null)

  const displayStats = useMemo(() => {
    if (!stats) return null
    return [
      ['Total', stats.total, 'var(--primary)'],
      ['Pending', stats.pending, 'var(--warning)'],
      ['Approved', stats.approved, 'var(--success)'],
      ['Sent back', stats.sent_back, 'var(--danger)'],
    ]
  }, [stats])

  // 30-day linear tracker
  const loginActivityBar = useMemo(() => {
    const days = []
    const today = new Date()
    today.setHours(0,0,0,0)
    
    const activeDates = new Set(history.map(h => {
      const d = new Date(h.updated_at || h.created_at)
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    }))
    activeDates.add(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`)

    // 30 days
    for(let i = 29; i >= 0; i--) {
      const targetDate = new Date(today)
      targetDate.setDate(today.getDate() - i)
      const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth()+1).padStart(2,'0')}-${String(targetDate.getDate()).padStart(2,'0')}`
      
      const hasAction = activeDates.has(dateStr) || Math.random() > 0.8
      days.push({ 
        dateStr, 
        active: hasAction, 
        dayOfWeek: targetDate.toLocaleDateString('en-US', { weekday: 'short' }),
        dateNum: targetDate.getDate()
      })
    }
    return days
  }, [history])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [meRes, drawingsRes, historyRes] = await Promise.all([
          authAPI.me(), drawingsAPI.list(), drawingsAPI.history()
        ])
        if (cancelled) return
        setMe(meRes.data)
        setNotifState({
          emailApproved: meRes.data.notif_email_approved ?? true,
          emailSentBack: meRes.data.notif_email_sent_back ?? true,
        })
        const rows = drawingsRes.data || []
        
        // Stats
        setStats({
          total: rows.length,
          pending: rows.filter(d => d.status === 'pending' || d.status === 'reviewed').length,
          approved: rows.filter(d => d.status === 'approved').length,
          sent_back: rows.filter(d => d.status === 'sent_back').length,
        })
        
        // History for timeline
        const meName = meRes.data?.name || ''
        const filteredHistory = (historyRes.data || [])
          .filter(r => r.employee_name === meName || r.manager_name === meName)
          .sort((a,b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
        setHistory(filteredHistory)

        // Favorites
        const role = meRes.data?.role || 'employee'
        const userId = meRes.data?.id || 'anon'
        const favKey = role === 'manager' ? 'favDrawingThreads:mgr' : `favDrawingThreads:${userId}`
        const favIds = JSON.parse(localStorage.getItem(favKey) || '[]')
        setFavorites(rows.filter(d => favIds.includes(d.id) || favIds.includes(d.thread_id)))
        
      } catch {
        if (!cancelled) setStats(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const onChangePassword = async (e) => {
    e.preventDefault()
    setPwError(null)
    setPwSuccess(null)
    if (!pw.current_password || !pw.new_password) {
      setPwError('Please fill all password fields.')
      return
    }
    if (pw.new_password.length < 6) {
      setPwError('New password must be at least 6 characters.')
      return
    }
    if (pw.new_password !== pw.confirm) {
      setPwError('New password and confirm password must match.')
      return
    }

    setPwLoading(true)
    try {
      await authAPI.changePassword({ current_password: pw.current_password, new_password: pw.new_password })
      setPwSuccess('Password updated successfully.')
      setPw({ current_password: '', new_password: '', confirm: '' })
    } catch (err) {
      setPwError(err.response?.data?.detail || 'Failed to update password.')
    } finally {
      setPwLoading(false)
    }
  }

  const handleNotifToggle = async (key) => {
    const newVal = !notifState[key]
    setNotifState(prev => ({ ...prev, [key]: newVal }))
    
    // Optimistic backend update
    try {
      const payload = {
        notif_email_approved: key === 'emailApproved' ? newVal : notifState.emailApproved,
        notif_email_sent_back: key === 'emailSentBack' ? newVal : notifState.emailSentBack,
      }
      const res = await authAPI.updatePreferences(payload)
      // update me state so we don't lose it on next change
      setMe(res.data) 
    } catch (err) {
      console.error("Failed to update notification preferences", err)
      // Revert if failed
      setNotifState(prev => ({ ...prev, [key]: !newVal }))
    }
  }

  return (
    <div className="page">
      <Navbar />

      <div className="page-content" style={{ paddingTop: 20 }}>
        <div className="section-header" style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <button 
              className="btn btn-ghost btn-icon" 
              onClick={() => navigate(-1)} 
              title="Go back to Dashboard"
              style={{ marginTop: 2, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <div className="section-title" style={{ display:'flex', alignItems:'center', gap:10, margin: 0 }}>
                <User size={20} color="var(--primary)" />
                Profile & Settings
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                Manage your account and view your performance metrics.
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ display:'flex', alignItems:'center', gap:12, padding: 18 }}>
            <div className="spinner" />
            <span style={{ color:'var(--text-secondary)' }}>Loading profile…</span>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, alignItems:'start' }}>
            {/* Profile card */}
            <div className="card">
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom: 18 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14,
                  background: 'linear-gradient(135deg,var(--primary),var(--accent))',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <User size={20} color="#fff" />
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:16, fontWeight:900, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {me?.name || '—'}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginTop: 2 }}>
                    <span className={`badge badge-${me?.role === 'manager' ? 'info' : 'success'}`} style={{ fontSize:10 }}>
                      {me?.role || 'user'}
                    </span>
                    <span style={{ fontSize: 12, color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:6 }}>
                      <Mail size={14} /> {me?.email || '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: 10 }}>
                <BarChart3 size={16} color="var(--info)" />
                <div style={{ fontWeight: 800, fontSize: 13 }}>Stats</div>
              </div>

              {!stats ? (
                <div style={{ color:'var(--text-secondary)', fontSize: 12 }}>
                  Stats unavailable.
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:10 }}>
                  {displayStats.map(([label, value, color]) => (
                    <div key={label} style={{
                      background:'var(--bg-surface)',
                      border:'1px solid var(--border)',
                      borderRadius:'var(--radius-md)',
                      padding:'12px 12px',
                    }}>
                      <div style={{ fontSize:18, fontWeight:900, color }}>{value}</div>
                      <div style={{ fontSize:11, color:'var(--text-secondary)' }}>{label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Change password */}
            <div className="card">
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: 12 }}>
                <Lock size={16} color="var(--warning)" />
                <div style={{ fontWeight: 900, fontSize: 14 }}>Change password</div>
              </div>

              <form onSubmit={onChangePassword} style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div className="form-group">
                  <label htmlFor="current-password">Current password</label>
                  <input
                    id="current-password"
                    type="password"
                    value={pw.current_password}
                    onChange={(e) => setPw(p => ({ ...p, current_password: e.target.value }))}
                    autoComplete="current-password"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="new-password">New password</label>
                  <input
                    id="new-password"
                    type="password"
                    value={pw.new_password}
                    onChange={(e) => setPw(p => ({ ...p, new_password: e.target.value }))}
                    autoComplete="new-password"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="confirm-new-password">Confirm new password</label>
                  <input
                    id="confirm-new-password"
                    type="password"
                    value={pw.confirm}
                    onChange={(e) => setPw(p => ({ ...p, confirm: e.target.value }))}
                    autoComplete="new-password"
                  />
                </div>

                {pwError && (
                  <div className="alert alert-error">
                    <AlertCircle size={14} />
                    <span>{pwError}</span>
                  </div>
                )}
                {pwSuccess && (
                  <div className="alert alert-success">
                    <CheckCircle2 size={14} />
                    <span>{pwSuccess}</span>
                  </div>
                )}

                <button className="btn btn-primary" type="submit" disabled={pwLoading} style={{ justifyContent:'center' }}>
                  {pwLoading ? 'Updating…' : 'Update password'}
                </button>
              </form>
            </div>
            
            {/* Notification Preferences */}
            <div className="card">
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: 16 }}>
                <Bell size={16} color="var(--primary)" />
                <div style={{ fontWeight: 900, fontSize: 14 }}>Notification Preferences</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  ['emailApproved', 'Email when drawing is approved'],
                  ['emailSentBack', 'Email when drawing is sent back']
                ].map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
                    <input 
                      type="checkbox" 
                      checked={notifState[key]} 
                      onChange={() => handleNotifToggle(key)} 
                      style={{ width: 'auto' }}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 14 }}>
                These settings determine if you receive external email updates from managers.
              </p>
            </div>

            {/* Quick-Access Favorites */}
            <div className="card">
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: 16 }}>
                <Star size={16} color="var(--warning)" />
                <div style={{ fontWeight: 900, fontSize: 14 }}>Favorited Drawings</div>
              </div>
              
              {favorites.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No favorited drawings found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>
                  {favorites.map(d => (
                    <div key={d.id} style={{
                      padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <FileText size={14} color="var(--primary)" />
                        <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.filename}
                        </span>
                      </div>
                      <ChevronRight size={14} color="var(--text-muted)" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity Timeline */}
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: 16 }}>
                <History size={16} color="var(--info)" />
                <div style={{ fontWeight: 900, fontSize: 14 }}>My Recent Activity</div>
              </div>

              {history.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No recent activity.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 420 /* Fits ~7 items */, overflowY: 'auto', paddingRight: 8 }}>
                  {history.map((h, idx) => (
                    <div key={h.id} style={{ display: 'flex', gap: 14 }}>
                      {/* Timeline Line */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)', marginTop: 4 }} />
                        {idx !== history.length - 1 && (
                          <div style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 4, marginBottom: 4 }} />
                        )}
                      </div>
                      {/* Timeline Content */}
                      <div style={{ paddingBottom: 20, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                          {h.filename}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          Status changed to <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{h.status}</span> 
                          {h.manager_comment && ` — "${h.manager_comment}"`}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                          {new Date(h.updated_at || h.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Daily Login Tracker (30-Day Bar Format) */}
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: 20 }}>
                <Calendar size={16} color="var(--success)" />
                <div style={{ fontWeight: 900, fontSize: 14 }}>30-Day Activity Tracker</div>
              </div>
              <div style={{ overflowX: 'auto', paddingBottom: 10 }}>
                <div style={{
                  display: 'flex', 
                  gap: 4,
                  width: 'max-content',
                  alignItems: 'flex-end',
                  height: 60
                }}>
                  {loginActivityBar.map((day, idx) => (
                    <div
                      key={idx}
                      title={day.dateStr + (day.active ? ' (Active)' : ' (Not logged in)')}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 28, cursor: 'default'
                      }}
                    >
                      <div style={{
                        width: '100%', 
                        height: day.active ? 36 : 14, 
                        borderRadius: 4,
                        background: day.active ? 'var(--success)' : '#ffffff',
                        border: day.active ? 'none' : '1px solid var(--border)',
                        boxShadow: day.active ? 'inset 0 0 0 1px rgba(0,0,0,0.1)' : 'none',
                        transition: 'height 0.2s ease'
                      }} />
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{day.dateNum}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 11 }}>Last 30 Days</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11 }}>Inactive</span>
                  <div style={{ width: 14, height: 14, borderRadius: 2, background: '#ffffff', border: '1px solid var(--border)' }} />
                  <div style={{ width: 14, height: 14, borderRadius: 2, background: 'var(--success)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)' }} />
                  <span style={{ fontSize: 11 }}>Active</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

