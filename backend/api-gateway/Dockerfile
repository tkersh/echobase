FROM node:18-alpine

WORKDIR /app

# Copy package files from api-gateway
COPY api-gateway/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Run security audit
RUN npm audit --omit=dev --audit-level=high

# Copy application code from api-gateway and shared
COPY api-gateway/ ./
COPY shared/ ../shared/

# Ensure SSL certificates are present (will be copied from api-gateway/)
# Certificates should be in api-gateway/ssl/ directory

# Expose port
EXPOSE 3001

# Health check (supports both HTTP and HTTPS)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const proto = require('fs').existsSync('ssl/api-gateway.crt') ? require('https') : require('http'); proto.get({host:'localhost',port:3001,path:'/health',rejectUnauthorized:false}, (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).on('error', () => process.exit(1))"

# Start the application (wait for secrets first)
CMD ["sh", "-c", "NODE_PATH=/app/node_modules node ../shared/wait-for-secrets.js && NODE_PATH=/app/node_modules node server.js"]