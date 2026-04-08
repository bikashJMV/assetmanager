import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Listen on all interfaces for LAN access to the dev UI (QR scan links still default to production origin in `api.ts`).
  server: {
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          qr: ['qrcode'],
        },
      },
    },
  },
})
