#!/bin/bash

# Credential Generation Script for Echobase
# This script generates secure random credentials for the application
# Run this script BEFORE running docker-compose up for the first time

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=================================================${NC}"
echo -e "${GREEN}  Echobase Credential Generation Script${NC}"
echo -e "${GREEN}=================================================${NC}"
echo ""

# Check if .env already exists
if [ -f .env ]; then
    echo -e "${YELLOW}Warning: .env file already exists!${NC}"
    read -p "Do you want to regenerate credentials? This will overwrite existing values (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Aborted. Keeping existing .env file.${NC}"
        exit 0
    fi
    # Backup existing .env
    cp .env .env.backup
    echo -e "${GREEN}Backed up existing .env to .env.backup${NC}"
fi

# Function to generate a secure random password
generate_password() {
    local length=${1:-32}
    # Generate random password with alphanumeric and special characters
    openssl rand -base64 48 | tr -d "=+/" | cut -c1-${length}
}

# Function to generate alphanumeric only password (for database)
generate_db_password() {
    local length=${1:-32}
    # Generate alphanumeric password (safer for database)
    LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c ${length}
}

echo "Generating secure random credentials..."
echo ""

# Generate database credentials
DB_ROOT_PASSWORD=$(generate_db_password 32)
DB_USER="orderuser"
DB_PASSWORD=$(generate_db_password 32)
DB_NAME="orders_db"

# For Localstack, we still use 'test' credentials since it's a local development mock
# In production, you would use real AWS credentials from AWS IAM
AWS_ACCESS_KEY_ID="test"
AWS_SECRET_ACCESS_KEY="test"

# Generate a secret for future authentication (e.g., JWT)
JWT_SECRET=$(generate_password 64)

echo -e "${GREEN}Credentials generated successfully!${NC}"
echo ""

# Create .env file
cat > .env << EOF
# Echobase Environment Configuration
# Generated: $(date)
# WARNING: This file contains secrets. Never commit this to version control!

# Database Configuration
MYSQL_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
MYSQL_DATABASE=${DB_NAME}
MYSQL_USER=${DB_USER}
MYSQL_PASSWORD=${DB_PASSWORD}

DB_HOST=mariadb
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}

# AWS/Localstack Configuration
# NOTE: These are test credentials for Localstack local development
# For production, use AWS IAM roles or AWS Secrets Manager
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}

# SQS Configuration
SQS_ENDPOINT=http://localstack:4566
SQS_QUEUE_URL=http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/order-processing-queue

# API Gateway Configuration
PORT=3001
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Order Processor Configuration
POLL_INTERVAL=5000
MAX_MESSAGES=10

# Frontend Configuration
REACT_APP_API_URL=http://localhost:3001

# Security Configuration
# JWT secret for future authentication implementation
JWT_SECRET=${JWT_SECRET}
EOF

# Set restrictive permissions on .env file
chmod 600 .env

echo -e "${GREEN}✓ Created .env file with secure credentials${NC}"
echo -e "${GREEN}✓ Set file permissions to 600 (owner read/write only)${NC}"
echo ""

# Display credential summary (without showing actual passwords)
echo -e "${YELLOW}=================================================${NC}"
echo -e "${YELLOW}  Credential Summary${NC}"
echo -e "${YELLOW}=================================================${NC}"
echo ""
echo "Database Configuration:"
echo "  - Root Password: [GENERATED - ${#DB_ROOT_PASSWORD} characters]"
echo "  - Database Name: ${DB_NAME}"
echo "  - Database User: ${DB_USER}"
echo "  - User Password: [GENERATED - ${#DB_PASSWORD} characters]"
echo ""
echo "AWS/Localstack:"
echo "  - Region: us-east-1"
echo "  - Credentials: test/test (Localstack development only)"
echo ""
echo "Security:"
echo "  - JWT Secret: [GENERATED - ${#JWT_SECRET} characters]"
echo ""
echo "Database Encryption:"
echo "  - Encryption Key: Will be generated next"
echo ""
echo -e "${YELLOW}=================================================${NC}"
echo ""

echo -e "${GREEN}Generating MariaDB encryption keys...${NC}"
echo ""

# Generate MariaDB encryption keys
if [ -f "mariadb/config/generate-keys.sh" ]; then
    ./mariadb/config/generate-keys.sh
    echo ""
else
    echo -e "${YELLOW}Warning: mariadb/config/generate-keys.sh not found${NC}"
    echo -e "${YELLOW}Database encryption keys not generated${NC}"
    echo ""
fi

echo -e "${GREEN}Next Steps:${NC}"
echo "1. Review the generated .env file"
echo "2. Run: docker-compose up -d"
echo "3. Your services will use the secure credentials automatically"
echo ""
echo -e "${RED}IMPORTANT SECURITY NOTES:${NC}"
echo "  - The .env file is already in .gitignore"
echo "  - NEVER commit the .env file to version control"
echo "  - Keep a secure backup of your credentials"
echo "  - Backup your encryption key: mariadb/config/keyfile.enc"
echo "  - For production, use AWS Secrets Manager or similar"
echo ""
echo -e "${GREEN}Credential generation complete!${NC}"