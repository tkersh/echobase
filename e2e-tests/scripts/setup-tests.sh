#!/bin/bash

# E2E Test Setup Script
# This script ensures the environment is ready for E2E tests

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

# Check if .env file exists
echo ""
echo "Checking environment configuration..."
if [ ! -f ".env" ]; then
    print_error ".env file not found!"
    echo ""
    echo "You need to create a .env file before running tests."
    echo ""
    echo "Option 1 (Recommended): Generate secure credentials automatically"
    echo "  ./generate-credentials.sh"
    echo ""
    echo "Option 2: Create manually from example"
    echo "  cp .env.example .env"
    echo "  # Then edit .env and set secure passwords"
    echo ""
    exit 1
fi
print_success "Found .env file"

# Load environment variables from .env
set -a
source .env
set +a

# Retrieve database credentials from Secrets Manager (same as CI system)
echo ""
echo "Retrieving database credentials from Secrets Manager..."
if docker ps --format '{{.Names}}' | grep -q "^echobase-devlocal-durable-localstack$"; then
    SECRET_JSON=$(docker exec echobase-devlocal-durable-localstack awslocal secretsmanager get-secret-value \
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

        # For root access, fall back to credentials file
        if [ -f "durable/.credentials.devlocal" ]; then
            MYSQL_ROOT_PASSWORD=$(grep MYSQL_ROOT_PASSWORD durable/.credentials.devlocal | cut -d'=' -f2)
            export MYSQL_ROOT_PASSWORD
        fi
        print_success "Retrieved database credentials from Secrets Manager"
    else
        # In CI environment, Secrets Manager is required
        if [ "${CI:-false}" = "true" ]; then
            print_error "Secrets Manager is required in CI environment"
            print_error "Cannot fall back to credentials file in CI"
            exit 1
        fi

        print_warning "Could not retrieve credentials from Secrets Manager, falling back to credentials file"
        if [ -f "durable/.credentials.devlocal" ]; then
            set -a
            source durable/.credentials.devlocal
            set +a
        fi
    fi
else
    # In CI environment, durable LocalStack must be running
    if [ "${CI:-false}" = "true" ]; then
        print_error "Durable LocalStack is required in CI environment"
        exit 1
    fi

    print_warning "Durable LocalStack not running, falling back to credentials file"
    if [ -f "durable/.credentials.devlocal" ]; then
        set -a
        source durable/.credentials.devlocal
        set +a
    fi
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
if ! docker ps --format '{{.Names}}' | grep -q "^echobase-devlocal-durable-mariadb$"; then
    print_warning "Durable database not running, starting it..."
    chmod +x durable/setup.sh
    ./durable/setup.sh devlocal
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
until docker exec echobase-devlocal-durable-mariadb mariadb-admin ping -h localhost -u root -p"${MYSQL_ROOT_PASSWORD}" &> /dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_SERVICE_RETRIES ]; then
        fail_service_health_check "Database" "echobase-devlocal-durable-mariadb"
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
        fail_service_health_check "API Gateway" "echobase-devlocal-api-gateway"
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
        fail_service_health_check "Frontend" "echobase-devlocal-frontend"
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
if docker exec echobase-devlocal-durable-mariadb mariadb -u "${MYSQL_USER}" -p"${MYSQL_PASSWORD}" -e "USE ${MYSQL_DATABASE}; SELECT 1;" > /dev/null 2>&1; then
    print_success "Database connection verified (user: ${MYSQL_USER})"
else
    print_error "Cannot connect to database"
    print_error "Database container: echobase-devlocal-durable-mariadb"
    print_error "User: ${MYSQL_USER}"
    docker ps --filter "name=echobase-devlocal-durable"
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
echo "Frontend:     ${WEB_URL}"
echo "API Gateway:  ${API_URL}"
echo "Database:     localhost:3306"
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
