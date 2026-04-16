/**
 * api/client.js — Axios instance with JWT interceptor.
 *
 * All API calls automatically attach the stored Bearer token.
 * 401 responses redirect to /login and clear the session.
 */

import axios from 'axios'

const API = axios.create({
  // In dev, Vite proxy can forward relative paths.
  // In production/static hosting, we need an explicit backend URL.
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 300_000,       // 300 s (5 mins) for large DXF processing
})

// ── Request interceptor: attach JWT ──────────────────────────────────────────
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Response interceptor: handle 401 ─────────────────────────────────────────
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default API

// ─── Auth helpers ─────────────────────────────────────────────────────────────
export const authAPI = {
  signup: (data)  => API.post('/auth/signup', data),
  login:  (data)  => API.post('/auth/login', data),
  me:     ()      => API.get('/auth/me'),
  managers: ()    => API.get('/auth/managers'),
  changePassword: (data) => API.post('/auth/change-password', data),
  updatePreferences: (data) => API.put('/auth/preferences', data),
}

// ─── Drawings helpers ─────────────────────────────────────────────────────────
export const drawingsAPI = {
  upload:    (formData)         => API.post('/drawings/upload', formData),
  list:      ()                 => API.get('/drawings/'),
  get:       (id)               => API.get(`/drawings/${id}`),
  setStatus: (id, body)         => API.put(`/drawings/${id}/status`, body),
  rerender:  (id)               => API.get(`/drawings/${id}/rerender`),
  history:   ()                 => API.get('/drawings/history'),
  delete:    (id)               => API.delete(`/drawings/${id}`),
}

// ─── Issues helpers ───────────────────────────────────────────────────────────
export const issuesAPI = {
  list:    (drawingId)     => API.get(`/issues/${drawingId}`),
  create:  (data)          => API.post('/issues/', data),
  update:  (id, data)      => API.put(`/issues/${id}`, data),
  delete:  (id)            => API.delete(`/issues/${id}`),
  resolve: (id)            => API.put(`/issues/${id}/resolve`),
}
