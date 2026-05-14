# Multi-stage Node build for React Client

# Stage 1: Builder
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY public/ ./public/
COPY src/ ./src/
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json postcss.config.js tailwind.config.js eslint.config.js ./

# Vite inlines VITE_* at build time — pass via compose build.args or docker build --build-arg
# VITE_API_URL is intentionally empty → Axios uses same-origin relative paths via nginx /api/ proxy
ARG VITE_API_URL=
ARG VITE_BACKEND_API_KEY=
ARG VITE_AUTH_AUTHORITY=
ARG VITE_CLIENT_ID=
ARG VITE_ORG_ID=
ARG VITE_PROJECT_ID=
ARG VITE_CALLBACK_PATH=/callback
ARG VITE_LOGOUT_PATH=/login
ARG VITE_PUBLIC_APP_ORIGIN=
ARG VITE_PROJECT_NAME=
ARG VITE_OTEL_GRAFANA_ENABLED=true
ARG VITE_OTEL_EXPORTER_ENDPOINT=
ARG VITE_GRAFANA_DASHBOARD_URL_FOR_ITOPS=
ARG VITE_LOKI_BASE_URL=

ENV VITE_API_URL=$VITE_API_URL \
    VITE_BACKEND_API_KEY=$VITE_BACKEND_API_KEY \
    VITE_AUTH_AUTHORITY=$VITE_AUTH_AUTHORITY \
    VITE_CLIENT_ID=$VITE_CLIENT_ID \
    VITE_ORG_ID=$VITE_ORG_ID \
    VITE_PROJECT_ID=$VITE_PROJECT_ID \
    VITE_CALLBACK_PATH=$VITE_CALLBACK_PATH \
    VITE_LOGOUT_PATH=$VITE_LOGOUT_PATH \
    VITE_PUBLIC_APP_ORIGIN=$VITE_PUBLIC_APP_ORIGIN \
    VITE_PROJECT_NAME=$VITE_PROJECT_NAME \
    VITE_OTEL_GRAFANA_ENABLED=$VITE_OTEL_GRAFANA_ENABLED \
    VITE_OTEL_EXPORTER_ENDPOINT=$VITE_OTEL_EXPORTER_ENDPOINT \
    VITE_GRAFANA_DASHBOARD_URL_FOR_ITOPS=$VITE_GRAFANA_DASHBOARD_URL_FOR_ITOPS \
    VITE_LOKI_BASE_URL=$VITE_LOKI_BASE_URL

# Build application
RUN npm run build

# Stage 2: Runtime (nginx)
FROM nginx:alpine

# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built application from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
