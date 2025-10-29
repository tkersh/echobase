FROM node:18-alpine

WORKDIR /app

# Copy package files from order-processor
COPY order-processor/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Run security audit
RUN npm audit --omit=dev --audit-level=high

# Copy application code from order-processor and shared
COPY order-processor/ ./
COPY shared/ ../shared/

# Start the application
CMD ["node", "processor.js"]