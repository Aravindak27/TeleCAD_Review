/**
 * pages/SignupPage.jsx — Account registration.
 */

import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { UserPlus, HardHat, Briefcase, AlertCircle } from 'lucide-react'
import { authAPI } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

export default function SignupPage() {
  const [form,    setForm]    = useState({ name:'', email:'', password:'', role:'employee' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const { login }  = useAuth()
  const navigate   = useNavigate()

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!form.name || !form.email || !form.password) {
      setError('All fields are required.'); return
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.'); return
    }

    setLoading(true)
    try {
      const res = await authAPI.signup(form)
      login(res.data.access_token, res.data.user)
      navigate(res.data.user.role === 'manager' ? '/manager' : '/employee', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight:  '100vh',
      display:    'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding:    '32px 16px',
      background: 'linear-gradient(135deg, #070b14 0%, #0d1630 50%, #070b14 100%)',
    }}>
      <div style={{ width:'100%', maxWidth:440 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{
            width:64, height:64, borderRadius:'var(--radius-xl)',
            background:'linear-gradient(135deg,#1f6feb,#388bfd)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 0 24px rgba(56,139,253,0.4)',
            margin:'0 auto 16px',
          }}>
            <UserPlus size={28} color="#fff" />
          </div>
          <h2>Create your account</h2>
          <p style={{ fontSize:14, marginTop:4 }}>Join the TeleCAD Review System</p>
        </div>

        <div className="card" style={{ padding:32 }}>
          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {/* Full Name */}
            <div className="form-group">
              <label htmlFor="signup-name">Full Name</label>
              <input
                id="signup-name"
                type="text"
                placeholder="John Smith"
                value={form.name}
                onChange={e => set('name', e.target.value)}
              />
            </div>

            {/* Email */}
            <div className="form-group">
              <label htmlFor="signup-email">Email Address</label>
              <input
                id="signup-email"
                type="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={e => set('email', e.target.value)}
              />
            </div>

            {/* Password */}
            <div className="form-group">
              <label htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                type="password"
                placeholder="Min. 6 characters"
                value={form.password}
                onChange={e => set('password', e.target.value)}
              />
            </div>

            {/* Role */}
            <div className="form-group">
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.3px' }}>Select Your Role</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[
                  { id:'employee', label:'Employee', Icon:HardHat },
                  { id:'manager',  label:'Manager', Icon:Briefcase },
                ].map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    id={`signup-role-${id}-btn`}
                    onClick={() => set('role', id)}
                    style={{
                      padding:'12px',
                      border:`2px solid ${form.role === id ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius:'var(--radius-md)',
                      background: form.role === id ? 'var(--primary-muted)' : 'var(--bg-surface)',
                      cursor:'pointer', transition:'all 0.15s',
                      display:'flex', alignItems:'center', gap:8,
                    }}
                  >
                    <Icon size={18} color={form.role === id ? 'var(--primary)' : 'var(--text-muted)'} />
                    <span style={{ fontWeight:600, fontSize:14, color: form.role === id ? 'var(--primary)' : 'var(--text-primary)' }}>
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="alert alert-error fade-in">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <button
              id="signup-submit-btn"
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ padding:'13px', justifyContent:'center', marginTop:4 }}
            >
              {loading
                ? <><div className="spinner" style={{width:16,height:16}} /> Creating account…</>
                : <><UserPlus size={16} /> Create Account</>}
            </button>
          </form>
        </div>

        <p style={{ textAlign:'center', marginTop:20, fontSize:14, color:'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ fontWeight:600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}
