FROM echobase-node-base:latest

WORKDIR /app

# Copy root workspace files for npm ci
COPY package.json package-lock.json ./
COPY backend/api-gateway/package.json ./backend/api-gateway/
COPY backend/order-processor/package.json ./backend/order-processor/
COPY backend/mcp-server/package.json ./backend/mcp-server/
COPY backend/shared/package.json ./backend/shared/
COPY frontend/package.json ./frontend/
COPY e2e-tests/package.json ./e2e-tests/

# Install all dependencies (including dev for TypeScript build)
RUN npm ci -w backend/mcp-server

# Copy source code
COPY backend/mcp-server/src/ ./backend/mcp-server/src/
COPY backend/mcp-server/tsconfig.json ./backend/mcp-server/

# Build TypeScript
RUN npm run build -w backend/mcp-server

# Remove dev dependencies

# Build metadata
ARG GIT_SHORT_SHA=unknown
ARG BUILD_DATE=unknown

# Store build metadata (v1 in /app for CI, v2 in shared for app logging)
RUN echo "{\"gitSha\":\"${GIT_SHORT_SHA}\",\"buildDate\":\"${BUILD_DATE}\",\"component\":\"mcp-server\"}" > /app/build-metadata.json && \
  mkdir -p /app/backend/shared && \
  cp /app/build-metadata.json /app/backend/shared/build-metadata.json

WORKDIR /app/backend/mcp-server

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "const http = require('http'); http.get({host:'127.0.0.1',port:3002,path:'/health'}, (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "dist/index.js"]
