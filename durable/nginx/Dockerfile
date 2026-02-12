# Nginx Load Balancer for Blue/Green Deployment
# This image bakes in the nginx config and SSL certificates at build time
# to avoid volume mount issues in GitLab CI

FROM nginx:1.27-alpine3.21

# Install wget for health checks and active-env queries
RUN apk add --no-cache wget

# Copy nginx configuration
COPY nginx-blue-green.conf /etc/nginx/conf.d/default.conf

# Copy SSL certificates
COPY frontend/ssl /etc/ssl

# Ensure proper permissions
RUN chmod 644 /etc/nginx/conf.d/default.conf && \
    chmod -R 644 /etc/ssl/*

# Health check
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD nginx -t || exit 1

# Expose ports
EXPOSE 80 443 8080 8081

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
