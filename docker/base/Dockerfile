# Base image with latest LTS Node.js and production-stable npm
FROM node:22-alpine3.21

# Install common development tools
RUN apk add --no-cache bash git

# Verify versions
RUN node --version && npm --version && bash --version && git --version
