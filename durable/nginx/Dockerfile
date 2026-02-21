# Nginx Load Balancer for Blue/Green Deployment
# SSL certificates are fetched from Secrets Manager at runtime via entrypoint script

FROM nginx:1.27-alpine3.21

# Install dependencies for health checks, SSL setup
RUN apk add --no-cache wget aws-cli jq openssl

# Copy nginx configuration
COPY nginx-blue-green.conf /etc/nginx/conf.d/default.conf

# Ensure proper permissions for nginx config
RUN chmod 644 /etc/nginx/conf.d/default.conf

# Ensure SSL directory exists
RUN mkdir -p /etc/ssl

# Copy SSL setup entrypoint script (shared with frontend)
COPY frontend/docker-entrypoint.d/40-ssl-setup.sh /docker-entrypoint.d/40-ssl-setup.sh
RUN chmod +x /docker-entrypoint.d/40-ssl-setup.sh

# Copy htpasswd setup entrypoint script (basic auth for observability UIs)
COPY durable/nginx/docker-entrypoint.d/50-htpasswd-setup.sh /docker-entrypoint.d/50-htpasswd-setup.sh
RUN chmod +x /docker-entrypoint.d/50-htpasswd-setup.sh

# Health check
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD nginx -t || exit 1

# Expose ports
EXPOSE 80 443 8080 8081 9090

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
