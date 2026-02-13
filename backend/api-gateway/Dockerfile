FROM echobase-node-base:latest

# Build metadata
ARG GIT_SHORT_SHA=unknown
ARG BUILD_DATE=unknown

WORKDIR /app

# Copy package files from api-gateway
COPY api-gateway/package*.json ./

# Install build tools for native bcrypt compilation, install deps, then clean up
RUN apk add --no-cache --virtual .build-deps python3 make g++ && \
    npm ci --omit=dev && \
    apk del .build-deps

# Run security audit
RUN npm audit --omit=dev --audit-level=high

# Copy application code from api-gateway and shared
COPY api-gateway/ ./
COPY shared/ ../shared/

# Store build metadata
RUN echo "{\"gitSha\":\"${GIT_SHORT_SHA}\",\"buildDate\":\"${BUILD_DATE}\",\"component\":\"api-gateway\"}" > /app/build-metadata.json

# Health check (tries HTTPS first, falls back to HTTP)
# Start period: 120s to allow for database and SQS initialization
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=5 \
  CMD node -e "const https = require('https'); const http = require('http'); const opts = {host:'127.0.0.1',port:3001,path:'/health',rejectUnauthorized:false}; https.get(opts, (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => { http.get(opts, (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1)); })"

# Start the application
CMD ["sh", "-c", "NODE_PATH=/app/node_modules node server.js"]