FROM echobase-node-base:latest

# Build metadata
ARG GIT_SHORT_SHA=unknown
ARG BUILD_DATE=unknown

WORKDIR /app

# Copy package files from order-processor
COPY order-processor/package*.json ./

# Install dependencies (with security fixes from package-lock.json)
RUN npm ci --omit=dev

# Run security audit (informational - won't fail build)
RUN npm audit --omit=dev --audit-level=high || echo "⚠ Security audit found issues - review before production deployment"

# Copy application code from order-processor and shared
COPY order-processor/ ./
COPY shared/ ../shared/

# Store build metadata
RUN echo "{\"gitSha\":\"${GIT_SHORT_SHA}\",\"buildDate\":\"${BUILD_DATE}\",\"component\":\"order-processor\"}" > /app/build-metadata.json

# Start the application
CMD ["sh", "-c", "NODE_PATH=/app/node_modules node processor.js"]