FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Run security audit
RUN npm audit --omit=dev --audit-level=high

# Copy application code
COPY . .

# Start the application
CMD ["node", "processor.js"]