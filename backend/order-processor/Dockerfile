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

# Install dependencies
RUN npm ci -w backend/order-processor -w backend/shared --omit=dev

# Run security audit (informational - won't fail build)
RUN npm audit -w backend/order-processor --omit=dev --audit-level=high || echo "⚠ Security audit found issues - review before production deployment"

# Copy application code
COPY backend/order-processor/ ./backend/order-processor/
COPY backend/shared/ ./backend/shared/

# Store build metadata
RUN echo "{\"gitSha\":\"${GIT_SHORT_SHA}\",\"buildDate\":\"${BUILD_DATE}\",\"component\":\"order-processor\"}" > /app/backend/order-processor/build-metadata.json

WORKDIR /app/backend/order-processor

# Start the application
CMD ["sh", "-c", "NODE_PATH=/app/node_modules node processor.js"]
