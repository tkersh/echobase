#!/bin/bash

# E2E Test Setup Script
# This script ensures the environment is ready for E2E tests
#
# Usage: ./e2e-tests/scripts/setup-tests.sh [devlocal|ci]
#   If no environment specified, auto-detects which is running.

set -e

echo "========================================="
echo "Setting up E2E Test Environment"
echo "========================================="

# Constants
readonly MAX_SERVICE_RETRIES=30
readonly HEALTH_CHECK_INTERVAL_SECS=2
readonly DEFAULT_WEB_URL="https://localhost:3443"
readonly DEFAULT_API_URL="https://localhost:3001"

# Colors for output
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly RED='\033[0;31m'
readonly NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Function to parse JSON (uses jq if available, falls back to grep)
parse_json_field() {
    local json="$1"
    local field="$2"

    if command -v jq &> /dev/null; then
        echo "$json" | jq -r ".$field" 2>/dev/null || echo ""
    else
        # Fallback to grep for systems without jq
        echo "$json" | grep -o "\"$field\":\"[^\"]*\"" | cut -d'"' -f4
    fi
}

# Function to handle service health check failures
fail_service_health_check() {
    local service_name="$1"
    local container_name="${2:-}"

    print_error "$service_name failed to become healthy after ${MAX_SERVICE_RETRIES} attempts"

    if [ -n "$container_name" ]; then
        print_error "Check logs: docker logs $container_name"
    fi

    exit 1
}

# Check if Docker is running
echo "Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi
print_success "Docker is running"

# Navigate to project root
cd "$(dirname "$0")/../.." || exit
PROJECT_ROOT="$(pwd)"

# Detect environment
echo ""
echo "Detecting environment..."
# shellcheck source=scripts/detect-env.sh
if ! source "$PROJECT_ROOT/scripts/detect-env.sh" "${1:-}"; then
    exit 1
fi
print_success "Using durable environment: $DURABLE_ENV"

# Check if .env file exists
echo ""
echo "Checking environment configuration..."
if [ ! -f ".env" ]; then
    print_error ".env file not found!"
    echo ""
    echo "You need to create a .env file before running tests."
    echo ""
    echo "Option 1 (Recommended): Generate secure credentials automatically"
    echo "  ./scripts/generate-credentials.sh"
    echo ""
    echo "Option 2: Create manually from example"
    echo "  cp .env.example .env"
    echo "  # Then edit .env and set secure passwords"
    echo ""
    exit 1
fi
print_success "Found .env file"

# Load environment variables from .env and .env.secrets
set -a
source .env
[ -f .env.secrets ] && source .env.secrets
set +a

# Retrieve database credentials from Secrets Manager (same as CI system)
echo ""
echo "Retrieving database credentials from Secrets Manager..."
if docker ps --format '{{.Names}}' | grep -q "^${DURABLE_LOCALSTACK}$"; then
    SECRET_JSON=$(docker exec "$DURABLE_LOCALSTACK" awslocal secretsmanager get-secret-value \
        --secret-id echobase/database/credentials \
        --query SecretString \
        --output text 2>/dev/null)

    if [ -n "$SECRET_JSON" ]; then
        MYSQL_USER=$(parse_json_field "$SECRET_JSON" "username")
        export MYSQL_USER
        MYSQL_PASSWORD=$(parse_json_field "$SECRET_JSON" "password")
        export MYSQL_PASSWORD
        MYSQL_DATABASE=$(parse_json_field "$SECRET_JSON" "dbname")
        export MYSQL_DATABASE

        # Validate extracted credentials
        if [ -z "$MYSQL_USER" ] || [ -z "$MYSQL_PASSWORD" ] || [ -z "$MYSQL_DATABASE" ]; then
            print_error "Failed to parse credentials from Secrets Manager"
            exit 1
        fi

        # Get root password from Secrets Manager
        MYSQL_ROOT_PASSWORD=$(echo "$SECRET_JSON" | grep -o '"root_password":"[^"]*"' | cut -d'"' -f4)
        export MYSQL_ROOT_PASSWORD

        print_success "Retrieved database credentials from Secrets Manager"
    else
        # Secrets Manager is required - no fallback to files
        print_error "Could not retrieve credentials from Secrets Manager"
        print_error "Ensure durable infrastructure is running: ./durable/setup.sh $DURABLE_ENV"
        exit 1
    fi
else
    # Durable LocalStack must be running - no fallback
    print_error "Durable LocalStack is not running ($DURABLE_LOCALSTACK)"
    print_error "Start durable infrastructure first: ./durable/setup.sh $DURABLE_ENV"
    exit 1
fi

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found in project root"
    exit 1
fi
print_success "Found docker-compose.yml"

# Ensure durable infrastructure is running
echo ""
echo "Ensuring durable infrastructure is running..."
if ! docker ps --format '{{.Names}}' | grep -q "^${DURABLE_MARIADB}$"; then
    print_warning "Durable database not running, starting it..."
    chmod +x durable/setup.sh
    ./durable/setup.sh "$DURABLE_ENV"
fi
print_success "Durable infrastructure ready"

# Ensure application services are running (idempotent - won't recreate if already running)
echo ""
echo "Ensuring application services are running..."
docker compose up -d
print_success "Application services started"

echo ""
echo "Waiting for services to be healthy..."

# Configure service URLs (can be overridden by environment)
API_URL="${API_BASE_URL:-$DEFAULT_API_URL}"
WEB_URL="${WEB_BASE_URL:-$DEFAULT_WEB_URL}"

# Wait for database (in durable infrastructure)
echo "Waiting for database..."
RETRY_COUNT=0
until docker exec "$DURABLE_MARIADB" mariadb-admin ping -h localhost -u root -p"${MYSQL_ROOT_PASSWORD}" &> /dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_SERVICE_RETRIES ]; then
        fail_service_health_check "Database" "$DURABLE_MARIADB"
    fi
    sleep "$HEALTH_CHECK_INTERVAL_SECS"
done
print_success "Database is ready"

# Wait for API Gateway
echo "Waiting for API Gateway (${API_URL})..."
RETRY_COUNT=0
until curl -k -s "${API_URL}/health" > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_SERVICE_RETRIES ]; then
        fail_service_health_check "API Gateway" "$EPHEMERAL_API_GATEWAY"
    fi
    sleep "$HEALTH_CHECK_INTERVAL_SECS"
done
print_success "API Gateway is ready"

# Wait for Frontend
echo "Waiting for Frontend (${WEB_URL})..."
RETRY_COUNT=0
until curl -k -s "${WEB_URL}" > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_SERVICE_RETRIES ]; then
        fail_service_health_check "Frontend" "$EPHEMERAL_FRONTEND"
    fi
    sleep "$HEALTH_CHECK_INTERVAL_SECS"
done
print_success "Frontend is ready"

# Install E2E test dependencies
echo ""
echo "Installing E2E test dependencies..."
cd e2e-tests || exit

if [ ! -d "node_modules" ]; then
    npm install
    print_success "Dependencies installed"
else
    print_success "Dependencies already installed"
fi

# Install Playwright browsers
echo ""
echo "Installing Playwright browsers..."
npx playwright install chromium
print_success "Playwright browsers installed"

# Verify database connection (use app user, not root)
echo ""
echo "Verifying database connection..."
if docker exec "$DURABLE_MARIADB" mariadb -u "${MYSQL_USER}" -p"${MYSQL_PASSWORD}" -e "USE ${MYSQL_DATABASE}; SELECT 1;" > /dev/null 2>&1; then
    print_success "Database connection verified (user: ${MYSQL_USER})"
else
    print_error "Cannot connect to database"
    print_error "Database container: $DURABLE_MARIADB"
    print_error "User: ${MYSQL_USER}"
    docker ps --filter "name=${DURABLE_CONTAINER_PREFIX}"
    exit 1
fi

# Export database credentials to e2e-tests/.env for Playwright tests
# Note: We're already in e2e-tests directory from the previous step
echo ""
echo "Exporting test configuration for Playwright tests..."

# Read existing .env and preserve non-DB variables
if [ -f ".env" ]; then
    # Create timestamped backup to avoid overwriting previous backups
    BACKUP_FILE=".env.backup.$(date +%s)"
    cp .env "$BACKUP_FILE"
    echo "Created backup: $BACKUP_FILE"

    # Remove old auto-generated variables if they exist (including deprecated FRONTEND_BASE_URL)
    grep -v "^DB_USER=" .env | grep -v "^DB_PASSWORD=" | grep -v "^WEB_BASE_URL=" | grep -v "^FRONTEND_BASE_URL=" > .env.tmp
    mv .env.tmp .env
fi

# Append the credentials and test URLs
echo "" >> .env
echo "# Database credentials (auto-generated by setup-tests.sh)" >> .env
echo "DB_USER=${MYSQL_USER}" >> .env
echo "DB_PASSWORD=${MYSQL_PASSWORD}" >> .env
echo "" >> .env
echo "# Test URLs (auto-generated by setup-tests.sh)" >> .env
echo "WEB_BASE_URL=${WEB_URL}" >> .env

print_success "Test configuration exported to e2e-tests/.env"
cd ..

# Display service URLs
echo ""
echo "========================================="
echo "Environment Ready!"
echo "========================================="
echo "Environment:  ${DURABLE_ENV}"
echo "Frontend:     ${WEB_URL}"
echo "API Gateway:  ${API_URL}"
echo "Database:     localhost:${DURABLE_DB_PORT}"
echo ""
echo "Run tests with:"
echo "  cd e2e-tests"
echo "  npm test                  # All tests"
echo "  npm run test:api          # API tests only"
echo "  npm run test:frontend     # Frontend tests only"
echo "  npm run test:integration  # Integration tests only"
echo "  npm run test:security     # Security tests only"
echo "  npm run test:ui           # Interactive UI mode"
echo ""
