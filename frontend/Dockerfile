# Build stage
FROM echobase-node-base:latest AS build

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
RUN npm ci -w frontend

# Run security audit
RUN npm audit -w frontend --audit-level=high

# Copy application code
COPY frontend/ ./frontend/

# Build the application
RUN npm run build -w frontend

# Inject git SHA into HTML comment for version identification
RUN sed -i "s/__GIT_SHORT_SHA__/${GIT_SHORT_SHA}/g" /app/frontend/dist/index.html

# Store build metadata in dist
RUN echo "{\"gitSha\":\"${GIT_SHORT_SHA}\",\"buildDate\":\"${BUILD_DATE}\",\"component\":\"frontend\"}" > /app/frontend/dist/build-metadata.json

# Production stage
FROM nginx:1.27-alpine3.21

# Build metadata (pass through from build stage)
ARG GIT_SHORT_SHA=unknown
ARG BUILD_DATE=unknown

# Install dependencies for SSL setup (aws-cli, jq, openssl)
RUN apk add --no-cache aws-cli jq openssl

# Copy built assets from build stage
COPY --from=build /app/frontend/dist /usr/share/nginx/html

# Copy nginx configuration template
# Uses nginx's built-in envsubst feature: on startup, nginx processes
# /etc/nginx/templates/*.conf.template and outputs to /etc/nginx/conf.d/
# NGINX_ENVSUBST_FILTER restricts substitution to only $API_GATEWAY_HOST,
# preventing replacement of nginx's own variables ($host, $request_uri, etc.)
COPY frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_FILTER="API_GATEWAY_HOST|OTEL_COLLECTOR_HOST"
ENV OTEL_COLLECTOR_HOST=otel-collector

# Copy SSL setup script to docker-entrypoint.d
# Scripts in this directory are executed by the default nginx entrypoint
COPY frontend/docker-entrypoint.d/40-ssl-setup.sh /docker-entrypoint.d/40-ssl-setup.sh
RUN chmod +x /docker-entrypoint.d/40-ssl-setup.sh

# Ensure SSL directory exists
RUN mkdir -p /etc/nginx/ssl

# Expose ports (HTTP for redirect, HTTPS for secure traffic)
EXPOSE 80 443

# Health check (using HTTPS with IPv4 to avoid IPv6 resolution issues)
# Uses /healthz endpoint which has access_log off to reduce log noise
# Start period: 20s — nginx with static files starts in seconds
# Retries: 3 retries at 15s intervals = 45s additional time after start period
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider --no-check-certificate https://127.0.0.1/healthz || exit 1

# Create startup script that logs build metadata
RUN echo '#!/bin/sh' > /docker-entrypoint.d/00-log-build-metadata.sh && \
  echo 'if [ -f /usr/share/nginx/html/build-metadata.json ]; then' >> /docker-entrypoint.d/00-log-build-metadata.sh && \
  echo '  echo "================================================================================"' >> /docker-entrypoint.d/00-log-build-metadata.sh && \
  echo '  echo "BUILD METADATA:"' >> /docker-entrypoint.d/00-log-build-metadata.sh && \
  echo '  cat /usr/share/nginx/html/build-metadata.json | sed "s/^/  /"' >> /docker-entrypoint.d/00-log-build-metadata.sh && \
  echo '  echo "================================================================================"' >> /docker-entrypoint.d/00-log-build-metadata.sh && \
  echo 'fi' >> /docker-entrypoint.d/00-log-build-metadata.sh && \
  chmod +x /docker-entrypoint.d/00-log-build-metadata.sh

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
