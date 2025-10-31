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

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application (wait for secrets first)
CMD ["sh", "-c", "NODE_PATH=/app/node_modules node ../shared/wait-for-secrets.js && node server.js"]