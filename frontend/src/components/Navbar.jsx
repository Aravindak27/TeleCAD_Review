/**
 * components/Navbar.jsx — Top navigation bar.
 *
 * Shows: logo, current user name + role badge, logout button.
 */

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LogOut, Radio, User, Clock, Sun, Moon } from 'lucide-react'
import HistoryModal from './HistoryModal'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    localStorage.setItem('theme', nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <nav style={{
      height:          '64px',
      background:      'var(--bg-card)',
      borderBottom:    '1px solid var(--border)',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'space-between',
      padding:         '0 24px',
      position:        'sticky',
      top:             0,
      zIndex:          50,
      backdropFilter:  'blur(12px)',
    }}>
      {/* Logo */}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{
          width:48, height:48,
          borderRadius:'var(--radius-md)',
          background:'linear-gradient(135deg,#1f6feb,#388bfd)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 0 12px rgba(56,139,253,0.4)',
        }}>
          <Radio size={22} color="#fff" />
        </div>
        <div>
          <div style={{ fontWeight:800, fontSize:15, letterSpacing:'-0.3px' }}>
            Tele<span className="gradient-text">CAD</span> Review
          </div>
          <div style={{ fontSize:10, color:'var(--text-muted)', letterSpacing:'0.5px', textTransform:'uppercase' }}>
            Telecom CAD review
          </div>
        </div>
      </div>

      {/* Right side */}
      {user && (
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button
            type="button"
            onClick={() => navigate('/profile')}
            title="Profile"
            style={{
              display:'flex',
              alignItems:'center',
              gap:8,
              background:'transparent',
              border:'none',
              padding:0,
              cursor:'pointer',
              color:'inherit',
            }}
          >
            <div style={{
              width:34, height:34, borderRadius:'50%',
              background:'linear-gradient(135deg,var(--primary),var(--accent))',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <User size={16} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:600, lineHeight:1.2 }}>{user.name}</div>
              <span className={`badge badge-${user.role === 'manager' ? 'info' : 'success'}`}
                    style={{ fontSize:10 }}>
                {user.role}
              </span>
            </div>
          </button>

          <button
            id="history-btn"
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setHistoryOpen(true)}
            title="History"
          >
            <Clock size={15} />
            History
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button
            id="logout-btn"
            className="btn btn-ghost btn-sm"
            onClick={handleLogout}
            title="Logout"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      )}

      <HistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </nav>
  )
}
