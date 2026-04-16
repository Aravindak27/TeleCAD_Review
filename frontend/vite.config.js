import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth':     { target: 'http://localhost:8000', changeOrigin: true },
      '/drawings': { target: 'http://localhost:8000', changeOrigin: true },
      '/issues':   { target: 'http://localhost:8000', changeOrigin: true },
      '/uploads':  { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
