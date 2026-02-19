FROM echobase-node-base:latest

# Build metadata
ARG GIT_SHORT_SHA=unknown
ARG BUILD_DATE=unknown

WORKDIR /app

# Copy root workspace files for npm ci
COPY package.json package-lock.json ./
COPY backend/api-gateway/package.json ./backend/api-gateway/
COPY backend/order-processor/package.json ./backend/order-processor/
COPY backend/mcp-server/package.json ./backend/mcp-server/
COPY backend/shared/package.json ./backend/shared/
COPY frontend/package.json ./frontend/
COPY e2e-tests/package.json ./e2e-tests/

# Install all deps (including dev for swagger generation and CI tests)
RUN apk add --no-cache --virtual .build-deps python3 make g++ && \
  npm ci -w backend/api-gateway -w backend/shared && \
  apk del .build-deps

# Copy application code
COPY backend/api-gateway/ ./backend/api-gateway/
COPY backend/shared/ ./backend/shared/

# Pre-generate swagger spec (uses swagger-jsdoc devDependency, then spec is static JSON)
RUN cd /app/backend/api-gateway && node scripts/generate-swagger.js

# Security audit on production deps only (dev deps like jest/swagger-jsdoc excluded)
RUN npm audit -w backend/api-gateway --omit=dev --audit-level=high

# Store build metadata (v1 in /app for CI, v2 in shared for app logging)
RUN echo "{\"gitSha\":\"${GIT_SHORT_SHA}\",\"buildDate\":\"${BUILD_DATE}\",\"component\":\"api-gateway\"}" > /app/build-metadata.json && \
  mkdir -p /app/backend/shared && \
  cp /app/build-metadata.json /app/backend/shared/build-metadata.json

WORKDIR /app/backend/api-gateway

# Health check (tries HTTPS first, falls back to HTTP)
# Start period: 120s to allow for database and SQS initialization
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=5 \
  CMD node -e "const https = require('https'); const http = require('http'); const opts = {host:'127.0.0.1',port:3001,path:'/health',rejectUnauthorized:false}; https.get(opts, (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => { http.get(opts, (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1)); })"

# Start the application
CMD ["sh", "-c", "NODE_PATH=/app/node_modules node server.js"]
