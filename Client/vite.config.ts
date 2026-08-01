import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load VITE_* vars from Client/.env files so proxy targets work without shell env.
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  const authAuthority = env.VITE_AUTH_AUTHORITY
  // Local dev fallback: backend runs on 8000 (docker/nginx uses same-origin, so no VITE_API_URL there).
  const apiUrl = env.VITE_API_URL || 'http://localhost:8000'

  return {
  plugins: [react()],
  // Listen on all interfaces for LAN access to the dev UI (QR scan links still default to production origin in `api.ts`).
  server: {
    host: true,
    port: 11000,
    proxy: {
      '/nexus-proxy/': {
        target: authAuthority,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nexus-proxy/, ''),
      },
      '/api/': {
        target: apiUrl,
        changeOrigin: true,
      },
      '/observability/': {
        target: apiUrl,
        changeOrigin: true,
      }
    }
  },
  build: {
    // Emit build assets to /static instead of the default /assets so the physical output dir
    // does NOT collide with the SPA route `/assets`. Without this, nginx `try_files $uri $uri/`
    // matches dist/assets/ and 301-redirects a hard nav to /assets → http://localhost/assets/
    // (port dropped) → connection refused on direct link / refresh.
    assetsDir: 'static',
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
  }
})
