import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [react(), basicSsl()],
  // Listen on all interfaces for LAN access to the dev UI (QR scan links still default to production origin in `api.ts`).
  server: {
    host: true,
    port: 11000,
    proxy: {
      '/nexus-proxy/': {
        target: process.env.VITE_AUTH_AUTHORITY,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nexus-proxy/, ''),
      },
      '/api/': {
        target: process.env.VITE_API_URL,
        changeOrigin: true,
      },
      '/observability/': {
        target: process.env.VITE_API_URL,
        changeOrigin: true,
      }
    }  
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
