#!/bin/bash

# E2E Test Setup Script
# This script ensures the environment is ready for E2E tests

set -e

echo "========================================="
echo "Setting up E2E Test Environment"
echo "========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

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
        print_warning "Could not retrieve credentials from Secrets Manager, falling back to credentials file"
        if [ -f "durable/.credentials.devlocal" ]; then
            set -a
            source durable/.credentials.devlocal
            set +a
        fi
    fi
else
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

# Wait for database (in durable infrastructure)
echo "Waiting for database..."
RETRY_COUNT=0
MAX_RETRIES=30
until docker exec echobase-devlocal-durable-mariadb mariadb-admin ping -h localhost -u root -p"${MYSQL_ROOT_PASSWORD}" &> /dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        print_error "Database failed to become healthy after ${MAX_RETRIES} attempts"
        print_error "Container: echobase-devlocal-durable-mariadb"
        docker ps --filter "name=echobase-durable"
        exit 1
    fi
    sleep 2
done
print_success "Database is ready"

# Wait for API Gateway
echo "Waiting for API Gateway..."
RETRY_COUNT=0
until curl -k -s https://localhost:3001/health > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        print_error "API Gateway failed to become healthy after ${MAX_RETRIES} attempts"
        exit 1
    fi
    sleep 2
done
print_success "API Gateway is ready"

# Wait for Frontend
echo "Waiting for Frontend..."
RETRY_COUNT=0
until curl -k -s https://localhost:3443 > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        print_error "Frontend failed to become healthy after ${MAX_RETRIES} attempts"
        exit 1
    fi
    sleep 2
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
echo "Exporting database credentials for Playwright tests..."

# Read existing .env and preserve non-DB variables
if [ -f ".env" ]; then
    # Create a backup
    cp .env .env.backup
    # Remove old DB_USER and DB_PASSWORD if they exist
    grep -v "^DB_USER=" .env | grep -v "^DB_PASSWORD=" > .env.tmp
    mv .env.tmp .env
fi

# Append the credentials
echo "" >> .env
echo "# Database credentials (auto-generated by setup-tests.sh)" >> .env
echo "DB_USER=${MYSQL_USER}" >> .env
echo "DB_PASSWORD=${MYSQL_PASSWORD}" >> .env

print_success "Database credentials exported to e2e-tests/.env"
cd ..

# Display service URLs
echo ""
echo "========================================="
echo "Environment Ready!"
echo "========================================="
echo "Frontend:     https://localhost:3443"
echo "API Gateway:  https://localhost:3001"
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
