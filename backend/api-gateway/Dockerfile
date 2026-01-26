FROM echobase-node-base:latest

# Build metadata
ARG GIT_SHORT_SHA=unknown
ARG BUILD_DATE=unknown

WORKDIR /app

# Copy package files from api-gateway
COPY api-gateway/package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Run security audit
RUN npm audit --omit=dev --audit-level=high

# Copy application code from api-gateway and shared
COPY api-gateway/ ./
COPY shared/ ../shared/

# Store build metadata
RUN echo "{\"gitSha\":\"${GIT_SHORT_SHA}\",\"buildDate\":\"${BUILD_DATE}\",\"component\":\"api-gateway\"}" > /app/build-metadata.json

# Ensure SSL certificates are present (will be copied from api-gateway/)
# Certificates should be in api-gateway/ssl/ directory

# Expose port
EXPOSE 3001

# Health check (supports both HTTP and HTTPS, using 127.0.0.1 to avoid IPv6 issues)
# Start period: 120s to allow for database and SQS initialization (matches API_GATEWAY_TIMEOUT in CI)
# Retries: 5 retries at 10s intervals = 50s additional time after start period
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=5 \
  CMD node -e "const proto = require('fs').existsSync('ssl/api-gateway.crt') ? require('https') : require('http'); proto.get({host:'127.0.0.1',port:3001,path:'/health',rejectUnauthorized:false}, (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).on('error', () => process.exit(1))"

# Start the application
CMD ["sh", "-c", "NODE_PATH=/app/node_modules node server.js"]