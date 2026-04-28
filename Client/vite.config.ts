import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Listen on all interfaces for LAN access to the dev UI (QR scan links still default to production origin in `api.ts`).
  server: {
    host: true,
    port: 5174
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          qr: ['qrcode'],
        },
      },
    },
  },
})
