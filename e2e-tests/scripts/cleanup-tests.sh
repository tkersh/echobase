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

# Check if MariaDB service is running and healthy
echo "Checking database service..."
if ! docker-compose ps mariadb 2>/dev/null | grep -q "Up"; then
    print_error "Database service is not running. Please start services with: docker-compose up -d"
    exit 1
fi

# Wait for database to be ready (idempotent check)
if ! docker-compose exec -T mariadb mariadb-admin ping -h localhost -u root -p"${MYSQL_ROOT_PASSWORD}" &> /dev/null; then
    print_warning "Database is not responding. Waiting for it to become healthy..."
    RETRY_COUNT=0
    MAX_RETRIES=15
    until docker-compose exec -T mariadb mariadb-admin ping -h localhost -u root -p"${MYSQL_ROOT_PASSWORD}" &> /dev/null; do
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
docker-compose exec -T mariadb mariadb -u root -p"${MYSQL_ROOT_PASSWORD}" ${MYSQL_DATABASE} <<EOF
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

echo ""
echo "========================================="
echo "Cleanup complete!"
echo "========================================="
