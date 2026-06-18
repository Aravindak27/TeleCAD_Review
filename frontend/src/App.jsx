/**
 * App.jsx — Root application with routing.
 *
 * Routes:
 *   /              → redirect based on role
 *   /login         → LoginPage
 *   /signup        → SignupPage
 *   /employee      → EmployeeDashboard (protected)
 *   /manager       → ManagerDashboard  (protected)
 */

import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { NotificationProvider } from './contexts/NotificationContext'

import LoginPage          from './pages/LoginPage'
import SignupPage         from './pages/SignupPage'
import EmployeeDashboard  from './pages/EmployeeDashboard'
import ManagerDashboard   from './pages/ManagerDashboard'
import ProfilePage        from './pages/ProfilePage'

// ── Protected route wrapper ───────────────────────────────────────────────────
function ProtectedRoute({ children, requiredRole }) {
  const { user, loading } = useAuth()

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div className="spinner" style={{ width:40, height:40 }} />
    </div>
  )

  if (!user) return <Navigate to="/login" replace />
  if (requiredRole && user.role !== requiredRole)
    return <Navigate to={user.role === 'manager' ? '/manager' : '/employee'} replace />

  return children
}

// ── Default redirect ──────────────────────────────────────────────────────────
function DefaultRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user)   return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'manager' ? '/manager' : '/employee'} replace />
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark'
    document.documentElement.setAttribute('data-theme', savedTheme)
  }, [])

  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <Routes>
            <Route path="/"       element={<DefaultRedirect />} />
            <Route path="/login"  element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />

            <Route path="/employee" element={
              <ProtectedRoute requiredRole="employee">
                <EmployeeDashboard />
              </ProtectedRoute>
            }/>

            <Route path="/manager" element={
              <ProtectedRoute requiredRole="manager">
                <ManagerDashboard />
              </ProtectedRoute>
            }/>

            <Route path="/profile" element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }/>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
