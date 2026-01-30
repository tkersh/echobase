FROM echobase-node-base:latest

WORKDIR /app

# Copy package files
COPY backend/mcp-server/package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY backend/mcp-server/src/ ./src/
COPY backend/mcp-server/tsconfig.json ./

# Build TypeScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --omit=dev

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "const http = require('http'); http.get({host:'127.0.0.1',port:3002,path:'/health'}, (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "dist/index.js"]
