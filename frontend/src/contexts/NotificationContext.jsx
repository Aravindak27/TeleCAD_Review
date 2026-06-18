import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'
import { Bell, X, CheckCircle2, AlertOctagon, MessageSquare, Clipboard } from 'lucide-react'

const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const [toasts, setToasts] = useState([])
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  const addToast = (toast) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 7)
    const newToast = { id, ...toast }
    setToasts(prev => [...prev, newToast])
    setTimeout(() => {
      removeToast(id)
    }, 6000)
  }

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const getWsUrl = () => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000'
    const wsProto = apiBase.startsWith('https') ? 'wss:' : 'ws:'
    const url = apiBase.replace(/^https?:\/\//, '')
    return `${wsProto}//${url}/ws/notifications`
  }

  useEffect(() => {
    if (!user) {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      return
    }

    const connectWebSocket = () => {
      const token = localStorage.getItem('token')
      if (!token) return

      const wsUrl = `${getWsUrl()}?token=${token}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[WS] Connected to notifications')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          addToast(data)
          // Broadcast custom event so that current dashboard screens refresh automatically
          window.dispatchEvent(new CustomEvent('drawing-update', { detail: data }))
        } catch (e) {
          console.error('[WS] Error processing message:', e)
        }
      }

      ws.onerror = (err) => {
        console.error('[WS] Error:', err)
      }

      ws.onclose = () => {
        console.log('[WS] Closed')
        wsRef.current = null
        // Retry connection in 3 seconds if user is still logged in
        if (user) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket()
          }, 3000)
        }
      }
    }

    connectWebSocket()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [user])

  const getToastStyle = (toast) => {
    switch (toast.type) {
      case 'status_updated':
        return toast.status === 'approved' 
          ? { icon: CheckCircle2, color: 'var(--success)', border: 'rgba(63, 185, 80, 0.4)' }
          : { icon: AlertOctagon, color: 'var(--danger)', border: 'rgba(248, 81, 73, 0.4)' }
      case 'drawing_submitted':
        return { icon: Clipboard, color: 'var(--primary)', border: 'rgba(56, 139, 253, 0.4)' }
      case 'issue_created':
        return toast.is_comment
          ? { icon: MessageSquare, color: '#a855f7', border: 'rgba(168, 85, 247, 0.4)' }
          : { icon: AlertOctagon, color: 'var(--warning)', border: 'rgba(210, 153, 34, 0.4)' }
      case 'issue_resolved':
        return { icon: CheckCircle2, color: 'var(--success)', border: 'rgba(63, 185, 80, 0.4)' }
      default:
        return { icon: Bell, color: 'var(--info)', border: 'rgba(121, 192, 255, 0.4)' }
    }
  }

  return (
    <NotificationContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}

      {/* Global Toast Container */}
      <div style={{
        position: 'fixed',
        top: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxWidth: '380px',
        width: '100%',
        pointerEvents: 'none'
      }}>
        {toasts.map(toast => {
          const style = getToastStyle(toast)
          const Icon = style.icon
          return (
            <div
              key={toast.id}
              className="fade-in glass"
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '16px',
                borderRadius: 'var(--radius-lg)',
                border: `1px solid ${style.border}`,
                boxShadow: 'var(--shadow-lg), 0 0 20px rgba(0, 0, 0, 0.4)',
                cursor: 'pointer',
                animation: 'fadeIn 0.25s ease-out',
                transition: 'all 0.2s'
              }}
              onClick={() => removeToast(toast.id)}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-md)',
                background: `${style.color}15`,
                color: style.color,
                flexShrink: 0
              }}>
                <Icon size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '4px'
                }}>
                  {toast.type ? toast.type.replace('_', ' ') : 'Notification'}
                </div>
                <div style={{
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  lineHeight: '1.4',
                  fontWeight: 500
                }}>
                  {toast.message}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removeToast(toast.id)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  transition: 'background 0.2s, color 0.2s',
                  flexShrink: 0
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'none'
                  e.currentTarget.style.color = 'var(--text-muted)'
                }}
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationContext)
