#!/bin/bash

echo "=========================================="
echo "Echobase Test Data Cleanup Script"
echo "=========================================="
echo ""

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect environment (auto-detect or use argument)
echo "Detecting environment..."
# shellcheck source=scripts/detect-env.sh
if ! source "$SCRIPT_DIR/scripts/detect-env.sh" "${1:-}"; then
    exit 1
fi
echo "Using durable environment: $DURABLE_ENV"
echo ""

# Load AWS credentials from .env file (needed for awslocal)
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo "Error: .env file not found!"
  exit 1
fi
source "$SCRIPT_DIR/.env"

# Retrieve database credentials from Secrets Manager (same as CI system)
echo "Retrieving database credentials from Secrets Manager..."
if docker ps --format '{{.Names}}' | grep -q "^${DURABLE_LOCALSTACK}$"; then
  SECRET_JSON=$(docker exec "$DURABLE_LOCALSTACK" awslocal secretsmanager get-secret-value \
    --secret-id echobase/database/credentials \
    --query SecretString \
    --output text 2>/dev/null)

  if [ -n "$SECRET_JSON" ]; then
    DB_USER=$(echo "$SECRET_JSON" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
    DB_PASSWORD=$(echo "$SECRET_JSON" | grep -o '"password":"[^"]*"' | cut -d'"' -f4)
    echo "✓ Retrieved database credentials from Secrets Manager"
  else
    echo "Error: Could not retrieve credentials from Secrets Manager"
    echo "Please ensure durable infrastructure is running: ./durable/setup.sh $DURABLE_ENV"
    exit 1
  fi
else
  echo "Error: Durable LocalStack not running ($DURABLE_LOCALSTACK)"
  echo "Please ensure durable infrastructure is running: ./durable/setup.sh $DURABLE_ENV"
  exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running. Please start Docker and try again."
  exit 1
fi

# Check if durable MariaDB container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${DURABLE_MARIADB}$"; then
  echo "Error: MariaDB container ($DURABLE_MARIADB) is not running."
  echo "Please start the durable infrastructure with: ./durable/setup.sh $DURABLE_ENV"
  exit 1
fi

echo "Cleaning up test data..."
echo ""

# Count test users before cleanup
echo "Counting test users..."
TEST_USER_COUNT=$(docker exec "$DURABLE_MARIADB" mariadb -u "${DB_USER}" -p"${DB_PASSWORD}" -D "${DB_NAME}" -N -e "SELECT COUNT(*) FROM users WHERE username LIKE 'testuser_%';" 2>/dev/null)

if [ -z "$TEST_USER_COUNT" ]; then
  echo "Error: Could not connect to database. Check credentials."
  exit 1
fi

echo "Found $TEST_USER_COUNT test users"

# Count test orders before cleanup
TEST_ORDER_COUNT=$(docker exec "$DURABLE_MARIADB" mariadb -u "${DB_USER}" -p"${DB_PASSWORD}" -D "${DB_NAME}" -N -e "SELECT COUNT(*) FROM orders o JOIN users u ON o.user_id = u.id WHERE u.username LIKE 'testuser_%';" 2>/dev/null)
echo "Found $TEST_ORDER_COUNT test orders"
echo ""

# Delete test orders (cascade delete from users will handle this, but being explicit)
if [ "$TEST_ORDER_COUNT" -gt 0 ]; then
  echo "Deleting test orders..."
  docker exec "$DURABLE_MARIADB" mariadb -u "${DB_USER}" -p"${DB_PASSWORD}" -D "${DB_NAME}" -e "DELETE o FROM orders o JOIN users u ON o.user_id = u.id WHERE u.username LIKE 'testuser_%';" 2>/dev/null
  echo "✓ Deleted $TEST_ORDER_COUNT test orders"
fi

# Delete test users
if [ "$TEST_USER_COUNT" -gt 0 ]; then
  echo "Deleting test users..."
  docker exec "$DURABLE_MARIADB" mariadb -u "${DB_USER}" -p"${DB_PASSWORD}" -D "${DB_NAME}" -e "DELETE FROM users WHERE username LIKE 'testuser_%';" 2>/dev/null
  echo "✓ Deleted $TEST_USER_COUNT test users"
fi

# Purge SQS queue (ephemeral LocalStack)
echo ""
echo "Purging SQS queue..."
if [ -n "$EPHEMERAL_LOCALSTACK" ]; then
    if docker exec "$EPHEMERAL_LOCALSTACK" awslocal sqs purge-queue --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/order-processing-queue > /dev/null 2>&1; then
      echo "✓ SQS queue purged"
    else
      echo "⚠ Could not purge SQS queue (queue may not exist or already be empty)"
    fi
else
    echo "⚠ Ephemeral LocalStack not configured (CI uses blue/green environments)"
fi

# Verify cleanup
echo ""
echo "Verifying cleanup..."
REMAINING_USERS=$(docker exec "$DURABLE_MARIADB" mariadb -u "${DB_USER}" -p"${DB_PASSWORD}" -D "${DB_NAME}" -N -e "SELECT COUNT(*) FROM users WHERE username LIKE 'testuser_%';" 2>/dev/null)
REMAINING_ORDERS=$(docker exec "$DURABLE_MARIADB" mariadb -u "${DB_USER}" -p"${DB_PASSWORD}" -D "${DB_NAME}" -N -e "SELECT COUNT(*) FROM orders o JOIN users u ON o.user_id = u.id WHERE u.username LIKE 'testuser_%';" 2>/dev/null)

echo "Remaining test users: $REMAINING_USERS"
echo "Remaining test orders: $REMAINING_ORDERS"

echo ""
echo "=========================================="
echo "Cleanup Complete!"
echo "=========================================="
echo ""
echo "Summary:"
echo "  - Environment: $DURABLE_ENV"
echo "  - Test users deleted: $TEST_USER_COUNT"
echo "  - Test orders deleted: $TEST_ORDER_COUNT"
echo "  - SQS queue purged"
echo ""
