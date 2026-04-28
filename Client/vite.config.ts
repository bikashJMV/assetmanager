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
          xlsx: ['@e965/xlsx'],
          vendor: ['axios', '@tanstack/react-query', 'oidc-client-ts'],
          otel: [
            '@opentelemetry/api',
            '@opentelemetry/context-zone',
            '@opentelemetry/exporter-trace-otlp-http',
            '@opentelemetry/instrumentation',
            '@opentelemetry/instrumentation-fetch',
            '@opentelemetry/instrumentation-xml-http-request',
            '@opentelemetry/resources',
            '@opentelemetry/sdk-trace-web',
            '@opentelemetry/semantic-conventions'
          ]
        },
      },
    },
  },
})
