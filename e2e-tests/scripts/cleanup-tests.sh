#!/bin/bash

# E2E Test Cleanup Script
# Cleans up test data from the database

set -e

echo "========================================="
echo "Cleaning up test data"
echo "========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Navigate to project root
cd "$(dirname "$0")/../.." || exit

# Load environment variables from .env
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
else
    print_error ".env file not found. Please run setup-tests.sh first."
    exit 1
fi

# Retrieve database credentials from Secrets Manager (same as CI system)
echo "Retrieving database credentials from Secrets Manager..."
if docker ps --format '{{.Names}}' | grep -q "^echobase-devlocal-durable-localstack$"; then
    SECRET_JSON=$(docker exec echobase-devlocal-durable-localstack awslocal secretsmanager get-secret-value \
        --secret-id echobase/database/credentials \
        --query SecretString \
        --output text 2>/dev/null)

    if [ -n "$SECRET_JSON" ]; then
        MYSQL_USER=$(echo "$SECRET_JSON" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
        export MYSQL_USER
        MYSQL_PASSWORD=$(echo "$SECRET_JSON" | grep -o '"password":"[^"]*"' | cut -d'"' -f4)
        export MYSQL_PASSWORD
        MYSQL_DATABASE=$(echo "$SECRET_JSON" | grep -o '"dbname":"[^"]*"' | cut -d'"' -f4)
        export MYSQL_DATABASE
        # For root access, fall back to credentials file
        if [ -f "durable/.credentials.devlocal" ]; then
            MYSQL_ROOT_PASSWORD=$(grep MYSQL_ROOT_PASSWORD durable/.credentials.devlocal | cut -d'=' -f2)
            export MYSQL_ROOT_PASSWORD
        fi
        print_success "Retrieved database credentials from Secrets Manager"
    else
        print_error "Could not retrieve credentials from Secrets Manager"
        echo "Please ensure durable infrastructure is running: ./durable/setup.sh devlocal"
        exit 1
    fi
else
    print_error "Durable LocalStack not running"
    echo "Please ensure durable infrastructure is running: ./durable/setup.sh devlocal"
    exit 1
fi

# Check if durable MariaDB service is running and healthy
echo "Checking database service..."
if ! docker ps --format '{{.Names}}' | grep -q "^echobase-devlocal-durable-mariadb$"; then
    print_error "Database service is not running. Please start it with: ./durable/setup.sh devlocal"
    exit 1
fi

# Wait for database to be ready (idempotent check)
if ! docker exec echobase-devlocal-durable-mariadb mariadb-admin ping -h localhost -u root -p"${MYSQL_ROOT_PASSWORD}" &> /dev/null; then
    print_warning "Database is not responding. Waiting for it to become healthy..."
    RETRY_COUNT=0
    MAX_RETRIES=15
    until docker exec echobase-devlocal-durable-mariadb mariadb-admin ping -h localhost -u root -p"${MYSQL_ROOT_PASSWORD}" &> /dev/null; do
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
            print_error "Database failed to become healthy after ${MAX_RETRIES} attempts"
            exit 1
        fi
        sleep 2
    done
fi
print_success "Database is ready"

# Clean up test users
echo "Cleaning up test users..."
docker exec echobase-devlocal-durable-mariadb mariadb -u root -p"${MYSQL_ROOT_PASSWORD}" ${MYSQL_DATABASE} <<EOF
-- Delete test users and their orders
DELETE o FROM orders o
INNER JOIN users u ON o.user_id = u.id
WHERE u.username LIKE 'testuser_%'
   OR u.username LIKE 'e2etestuser%'
   OR u.email LIKE '%_test_%@example.com'
   OR u.email LIKE 'e2etest%@example.com';

DELETE FROM users
WHERE username LIKE 'testuser_%'
   OR username LIKE 'e2etestuser%'
   OR email LIKE '%_test_%@example.com'
   OR email LIKE 'e2etest%@example.com';

SELECT ROW_COUNT() as deleted_users;
EOF

if [ $? -eq 0 ]; then
    print_success "Test data cleaned up"
else
    print_error "Failed to clean up test data"
    exit 1
fi

# Purge SQS queue
echo ""
echo "Purging SQS queue..."
if docker exec echobase-devlocal-localstack awslocal sqs purge-queue --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/order-processing-queue > /dev/null 2>&1; then
    print_success "SQS queue purged"
else
    print_warning "Could not purge SQS queue (queue may not exist or already be empty)"
fi

echo ""
echo "========================================="
echo "Cleanup complete!"
echo "========================================="
