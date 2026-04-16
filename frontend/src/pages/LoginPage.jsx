/**
 * pages/LoginPage.jsx — Login with role pre-selection.
 *
 * UX:
 *   1. Two large role cards (Employee / Manager) — click to pre-select
 *   2. Email + password form below
 *   3. Submit logs in and redirects by role
 */

import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { HardHat, Briefcase, LogIn, Radio, AlertCircle } from 'lucide-react'
import { authAPI } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const [role,     setRole]     = useState(null)          // 'employee' | 'manager'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  const { login }  = useAuth()
  const navigate   = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!email || !password) { setError('Please fill in all fields.'); return }

    setLoading(true)
    try {
      const res = await authAPI.login({ email, password })
      login(res.data.access_token, res.data.user)
      navigate(res.data.user.role === 'manager' ? '/manager' : '/employee', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display:   'flex',
      background:'linear-gradient(135deg, #070b14 0%, #0d1630 50%, #070b14 100%)',
    }}>
      {/* Left decorative panel */}
      <div style={{
        flex:1, display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        background:'linear-gradient(160deg,rgba(31,111,235,0.12) 0%,transparent 60%)',
        borderRight:'1px solid var(--border)',
        padding:48,
      }}>
        <div style={{
          width:80, height:80, borderRadius:'var(--radius-xl)',
          background:'linear-gradient(135deg,#1f6feb,#388bfd)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 0 40px rgba(56,139,253,0.5)',
          marginBottom:28,
        }}>
          <Radio size={40} color="#fff" />
        </div>

        <h1 style={{ fontSize:'2.2rem', fontWeight:800, textAlign:'center', marginBottom:12 }}>
          Tele<span className="gradient-text">CAD</span> Review
        </h1>
        <p style={{ textAlign:'center', fontSize:15, maxWidth:340, lineHeight:1.7 }}>
          Telecom CAD Review & Annotation System.
          Drawing previews, manual manager review, and collaborative workflow.
        </p>

        <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:40 }}>
          {[
            ['📐', 'DXF/DWG upload and preview'],
            ['🎨', 'Visual issue overlays from managers'],
            ['👥', 'Manager–employee workflow'],
            ['✅', 'Approve or send back with comments'],
          ].map(([icon, text]) => (
            <div key={text} style={{ display:'flex', alignItems:'center', gap:10, fontSize:14 }}>
              <span style={{ fontSize:18 }}>{icon}</span>
              <span style={{ color:'var(--text-secondary)' }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div style={{
        width:460, display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        padding:48,
      }}>
        <div style={{ width:'100%', maxWidth:380 }}>
          <h2 style={{ marginBottom:6 }}>Welcome back</h2>
          <p style={{ marginBottom:28, fontSize:14 }}>Sign in to your account</p>

          {/* Role cards */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:28 }}>
            {[
              { id:'employee', label:'Employee', Icon:HardHat,  desc:'Upload & track drawings' },
              { id:'manager',  label:'Manager',  Icon:Briefcase, desc:'Review & approve drawings' },
            ].map(({ id, label, Icon, desc }) => (
              <button
                key={id}
                id={`role-${id}-btn`}
                type="button"
                onClick={() => setRole(id)}
                style={{
                  padding:      '16px 12px',
                  border:       `2px solid ${role === id ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-lg)',
                  background:   role === id ? 'var(--primary-muted)' : 'var(--bg-card)',
                  cursor:       'pointer',
                  textAlign:    'center',
                  transition:   'all 0.18s',
                  transform:    role === id ? 'translateY(-2px)' : 'none',
                }}
              >
                <Icon size={24} color={role === id ? 'var(--primary)' : 'var(--text-muted)'}
                      style={{ marginBottom:6 }} />
                <div style={{ fontWeight:700, fontSize:14, color: role === id ? 'var(--primary)' : 'var(--text-primary)' }}>
                  {label}
                </div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{desc}</div>
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div className="form-group">
              <label htmlFor="login-email">Email address</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="alert alert-error fade-in">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <button
              id="login-submit-btn"
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ padding:'13px', justifyContent:'center', marginTop:4 }}
            >
              {loading
                ? <><div className="spinner" style={{width:16,height:16}} /> Signing in…</>
                : <><LogIn size={16} /> Sign In</>}
            </button>
          </form>

          <p style={{ textAlign:'center', marginTop:24, fontSize:14, color:'var(--text-muted)' }}>
            Don't have an account?{' '}
            <Link to="/signup" style={{ fontWeight:600 }}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
