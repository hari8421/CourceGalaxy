import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Freebuff manages the dev server: HMR stays disabled and the server binds to
// 0.0.0.0 using the injected PORT. Vite dev proxies /api to the local FastAPI
// backend so the markdown content API is available during development.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    hmr: false,
    // The managed preview serves the app through a generated *.e2b.app hostname.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
