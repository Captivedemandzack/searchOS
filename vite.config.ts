import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API calls to the Fastify server so the client stays same-origin
    // and never sees the backend port. `npm run dev` starts both.
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
