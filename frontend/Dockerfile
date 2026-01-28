# Build stage
FROM echobase-node-base:latest AS build

# Build metadata
ARG GIT_SHORT_SHA=unknown
ARG BUILD_DATE=unknown

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Run security audit
RUN npm audit --audit-level=high

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Inject git SHA into HTML comment for version identification
RUN sed -i "s/__GIT_SHORT_SHA__/${GIT_SHORT_SHA}/g" /app/dist/index.html

# Store build metadata in dist
RUN echo "{\"gitSha\":\"${GIT_SHORT_SHA}\",\"buildDate\":\"${BUILD_DATE}\",\"component\":\"frontend\"}" > /app/dist/build-metadata.json

# Production stage
FROM nginx:alpine

# Build metadata (pass through from build stage)
ARG GIT_SHORT_SHA=unknown
ARG BUILD_DATE=unknown

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration template
# Uses nginx's built-in envsubst feature: on startup, nginx processes
# /etc/nginx/templates/*.conf.template and outputs to /etc/nginx/conf.d/
# NGINX_ENVSUBST_FILTER restricts substitution to only $API_GATEWAY_HOST,
# preventing replacement of nginx's own variables ($host, $request_uri, etc.)
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_FILTER=API_GATEWAY_HOST

# Copy SSL certificates for HTTPS (MITM Protection)
COPY ssl/localhost.crt /etc/nginx/ssl/localhost.crt
COPY ssl/localhost.key /etc/nginx/ssl/localhost.key

# Set proper permissions for SSL certificates
RUN chmod 644 /etc/nginx/ssl/localhost.crt && \
    chmod 600 /etc/nginx/ssl/localhost.key

# Expose ports (HTTP for redirect, HTTPS for secure traffic)
EXPOSE 80 443

# Health check (using HTTPS with IPv4 to avoid IPv6 resolution issues)
# Start period: 90s to allow nginx and SSL to initialize (matches FRONTEND_TIMEOUT in CI)
# Retries: 3 retries at 30s intervals = 90s additional time after start period
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD wget --quiet --tries=1 --spider --no-check-certificate https://127.0.0.1/ || exit 1

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