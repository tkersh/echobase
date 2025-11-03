# Build stage
FROM node:18-alpine AS build

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

# Production stage
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy SSL certificates for HTTPS (MITM Protection)
COPY ssl/localhost.crt /etc/nginx/ssl/localhost.crt
COPY ssl/localhost.key /etc/nginx/ssl/localhost.key

# Set proper permissions for SSL certificates
RUN chmod 644 /etc/nginx/ssl/localhost.crt && \
    chmod 600 /etc/nginx/ssl/localhost.key

# Expose ports (HTTP for redirect, HTTPS for secure traffic)
EXPOSE 80 443

# Health check (using HTTPS)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider --no-check-certificate https://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]