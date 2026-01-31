#!/bin/bash
# Setup script for durable infrastructure
# Usage: ./durable/setup.sh [devlocal|ci]
#
# This script sets up the durable database and secrets infrastructure that persists
# across blue-green deployments. It generates and manages all database credentials.

set -e

DURABLE_ENV=${1:-devlocal}

if [ "$DURABLE_ENV" != "devlocal" ] && [ "$DURABLE_ENV" != "ci" ]; then
    echo "Error: Environment must be 'devlocal' or 'ci'"
    echo "Usage: $0 [devlocal|ci]"
    exit 1
fi

echo "=========================================="
echo "Setting up Durable Infrastructure"
echo "Environment: $DURABLE_ENV"
echo "=========================================="
echo ""

# Check if docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running. Please start Docker and try again."
  exit 1
fi

# Check if root .env file exists (for AWS credentials)
if [ ! -f .env ]; then
  echo "ERROR: Root .env file not found!"
  echo "Please run ./scripts/generate-credentials.sh first to generate AWS credentials."
  exit 1
fi

# Load AWS credentials from root .env
echo "Loading AWS credentials from root .env..."
# shellcheck source=/dev/null
source .env

# Determine project name and paths based on environment
if [ "$DURABLE_ENV" = "devlocal" ]; then
    PROJECT_NAME="echobase-devlocal-durable"
    CONTAINER_PREFIX="echobase-devlocal-durable"
else
    PROJECT_NAME="echobase-ci-durable"
    CONTAINER_PREFIX="echobase-ci-durable"
fi

CONTAINER_NAME="${CONTAINER_PREFIX}-mariadb"
LOCALSTACK_CONTAINER="${CONTAINER_PREFIX}-localstack"
NGINX_CONTAINER="${CONTAINER_PREFIX}-nginx"

# Function to generate secure random password
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

# Function to generate MariaDB encryption key (256-bit hex)
generate_encryption_key() {
    openssl rand -hex 32
}

# Function to print infrastructure details
print_infrastructure_details() {
    echo "Database Details:"
    if [ "$DURABLE_ENV" = "devlocal" ]; then
        echo "  Database Container: echobase-devlocal-durable-mariadb"
        echo "  LocalStack Container: echobase-devlocal-durable-localstack"
        echo "  Nginx Container: echobase-devlocal-durable-nginx"
        echo "  Network: echobase-devlocal-durable-network"
        echo "  Database Port: 3306"
        echo "  LocalStack Port: 4566"
        echo "  Load Balancer: https://localhost (ports 443, 8080, 8081)"
    else
        echo "  Database Container: echobase-ci-durable-mariadb"
        echo "  LocalStack Container: echobase-ci-durable-localstack"
        echo "  Nginx Container: echobase-ci-durable-nginx"
        echo "  Network: echobase-ci-durable-network"
        echo "  Database Port: 3307"
        echo "  LocalStack Port: 4567"
        echo "  Load Balancer: https://localhost:1443 (ports 180, 1443, 8180, 8181)"
    fi
    echo ""
    echo "Credentials: Stored in AWS Secrets Manager (source of truth)"
    echo "  Secret Name: echobase/database/credentials"
    echo "  Location: Durable LocalStack container"
    echo ""
    echo "This infrastructure persists across blue-green deployments."
    echo "To tear down: ./durable/teardown.sh $DURABLE_ENV"
    echo ""
}

# ==========================================
# TRANSACTIONAL SETUP: Secrets Manager FIRST, then Database
# ==========================================
# This ensures Secrets Manager (source of truth) is populated BEFORE
# database is created, preventing orphaned credentials if Terraform fails.

# Step 1: Ensure LocalStack is running (needed to check/store credentials)
LS_STATUS=$(docker inspect -f '{{.State.Status}}' "$LOCALSTACK_CONTAINER" 2>/dev/null || echo "not-found")

if [ "$LS_STATUS" != "running" ]; then
    echo "Starting LocalStack (required for Secrets Manager)..."

    # Create minimal env file for LocalStack only
    # Placeholder MYSQL_* values suppress Compose warnings — only LocalStack is started here,
    # so the mariadb service (which references these) is never created with these values.
    TEMP_ENV_FILE=$(mktemp)
    cat "durable/.env.${DURABLE_ENV}" > "$TEMP_ENV_FILE"
    echo "" >> "$TEMP_ENV_FILE"
    echo "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID" >> "$TEMP_ENV_FILE"
    echo "AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY" >> "$TEMP_ENV_FILE"
    echo "AWS_REGION=${AWS_REGION:-us-east-1}" >> "$TEMP_ENV_FILE"
    echo "MYSQL_ROOT_PASSWORD=placeholder" >> "$TEMP_ENV_FILE"
    echo "MYSQL_DATABASE=placeholder" >> "$TEMP_ENV_FILE"
    echo "MYSQL_USER=placeholder" >> "$TEMP_ENV_FILE"
    echo "MYSQL_PASSWORD=placeholder" >> "$TEMP_ENV_FILE"

    # Start only LocalStack
    docker compose -f durable/docker-compose.yml --env-file "$TEMP_ENV_FILE" -p "$PROJECT_NAME" up -d localstack
    rm "$TEMP_ENV_FILE"

    # Wait for LocalStack to be ready
    echo "Waiting for LocalStack to be ready..."
    MAX_WAIT=60
    SLEEP_INTERVAL=2
    MAX_ITERATIONS=$((MAX_WAIT / SLEEP_INTERVAL))
    for i in $(seq 1 $MAX_ITERATIONS); do
        if docker exec "$LOCALSTACK_CONTAINER" curl -sf http://localhost:4566/_localstack/health > /dev/null 2>&1; then
            echo "✓ LocalStack is ready"
            break
        fi
        if [ $i -eq $MAX_ITERATIONS ]; then
            echo "ERROR: LocalStack did not become ready in time"
            exit 1
        fi
        echo "Waiting for LocalStack... ($i/$MAX_ITERATIONS)"
        sleep $SLEEP_INTERVAL
    done
fi

# Step 2: Check if credentials exist in Secrets Manager
echo "Checking Secrets Manager for existing credentials..."
if docker exec "$LOCALSTACK_CONTAINER" awslocal secretsmanager get-secret-value --secret-id echobase/database/credentials > /dev/null 2>&1; then
    echo "✓ Found credentials in Secrets Manager (source of truth)"

    # Retrieve credentials from Secrets Manager
    SECRET_JSON=$(docker exec "$LOCALSTACK_CONTAINER" awslocal secretsmanager get-secret-value --secret-id echobase/database/credentials --query SecretString --output text)

    MYSQL_ROOT_PASSWORD=$(echo "$SECRET_JSON" | grep -o '"root_password":"[^"]*"' | cut -d'"' -f4)
    MYSQL_USER=$(echo "$SECRET_JSON" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
    MYSQL_PASSWORD=$(echo "$SECRET_JSON" | grep -o '"password":"[^"]*"' | cut -d'"' -f4)
    MYSQL_DATABASE=$(echo "$SECRET_JSON" | grep -o '"database":"[^"]*"' | cut -d'"' -f4)

    # Retrieve encryption key from Secrets Manager
    if docker exec "$LOCALSTACK_CONTAINER" awslocal secretsmanager get-secret-value --secret-id echobase/database/encryption-key > /dev/null 2>&1; then
        echo "✓ Found encryption key in Secrets Manager"
        ENCRYPTION_SECRET_JSON=$(docker exec "$LOCALSTACK_CONTAINER" awslocal secretsmanager get-secret-value --secret-id echobase/database/encryption-key --query SecretString --output text)
        DB_ENCRYPTION_KEY=$(echo "$ENCRYPTION_SECRET_JSON" | grep -o '"key_hex":"[^"]*"' | cut -d'"' -f4)
    else
        echo "WARNING: Credentials exist but encryption key missing - will regenerate"
        DB_ENCRYPTION_KEY=""
    fi

else
    # Step 3: Generate new credentials and store in Secrets Manager FIRST
    echo "No credentials found in Secrets Manager"
    echo "Generating new database credentials and encryption key..."

    MYSQL_ROOT_PASSWORD=$(generate_password)
    MYSQL_USER="app_user"
    MYSQL_PASSWORD=$(generate_password)
    MYSQL_DATABASE="orders_db"
    DB_ENCRYPTION_KEY=$(generate_encryption_key)

    echo "✓ New credentials and encryption key generated"
    echo "DEBUG: Generated credentials:"
    echo "  MYSQL_USER=$MYSQL_USER"
    echo "  MYSQL_DATABASE=$MYSQL_DATABASE"
    echo "  MYSQL_PASSWORD (first 8 chars)=${MYSQL_PASSWORD:0:8}..."
    echo "  MYSQL_ROOT_PASSWORD (first 8 chars)=${MYSQL_ROOT_PASSWORD:0:8}..."
    echo "  DB_ENCRYPTION_KEY (first 8 chars)=${DB_ENCRYPTION_KEY:0:8}..."

    echo ""
    echo "==========================================  "
    echo "STORING CREDENTIALS IN SECRETS MANAGER:"
    echo "=========================================="
    echo ""

    # Export credentials for terraform-apply.sh
    export MYSQL_USER MYSQL_PASSWORD MYSQL_DATABASE MYSQL_ROOT_PASSWORD DB_ENCRYPTION_KEY

    # Apply Terraform to store credentials in Secrets Manager
    # If this fails, database won't be created (transactional)
    if ! ./durable/terraform-apply.sh "$DURABLE_ENV"; then
        echo ""
        echo "=========================================="
        echo "ERROR: Failed to store credentials in Secrets Manager"
        echo "=========================================="
        echo ""
        echo "Database will NOT be created to maintain consistency."
        echo "Fix the Terraform error and run setup again."
        exit 1
    fi

    echo ""
    echo "✓ Credentials successfully stored in Secrets Manager"
    echo "  Now proceeding to create database with these credentials..."
    echo ""
fi

# Load environment-specific configuration
ENV_FILE="durable/.env.${DURABLE_ENV}"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Environment file $ENV_FILE not found!"
  exit 1
fi

# Create temporary combined .env file
TEMP_ENV_FILE=$(mktemp)
cat "$ENV_FILE" > "$TEMP_ENV_FILE"
echo "" >> "$TEMP_ENV_FILE"
echo "# Database credentials" >> "$TEMP_ENV_FILE"
echo "MYSQL_ROOT_PASSWORD=$MYSQL_ROOT_PASSWORD" >> "$TEMP_ENV_FILE"
echo "MYSQL_DATABASE=$MYSQL_DATABASE" >> "$TEMP_ENV_FILE"
echo "MYSQL_USER=$MYSQL_USER" >> "$TEMP_ENV_FILE"
echo "MYSQL_PASSWORD=$MYSQL_PASSWORD" >> "$TEMP_ENV_FILE"
echo "" >> "$TEMP_ENV_FILE"
echo "# AWS credentials from root .env" >> "$TEMP_ENV_FILE"
echo "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID" >> "$TEMP_ENV_FILE"
echo "AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY" >> "$TEMP_ENV_FILE"
echo "AWS_REGION=${AWS_REGION:-us-east-1}" >> "$TEMP_ENV_FILE"
echo "" >> "$TEMP_ENV_FILE"
echo "# MCP Server" >> "$TEMP_ENV_FILE"
echo "MCP_API_KEY=$MCP_API_KEY" >> "$TEMP_ENV_FILE"

# Step 4: Check database and nginx status
# Note: LocalStack is already running and Secrets Manager already has credentials
DB_STATUS=$(docker inspect -f '{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "not-found")

# Check nginx status (required in both devlocal and CI for blue/green deployments)
NGINX_STATUS=$(docker inspect -f '{{.State.Status}}' "$NGINX_CONTAINER" 2>/dev/null || echo "not-found")
CHECK_NGINX=true

# Determine if we need to start/restart database and nginx
NEEDS_START=false

if [ "$DB_STATUS" = "not-found" ]; then
    echo "Database not found, creating it..."
    NEEDS_START=true
elif [ "$DB_STATUS" != "running" ]; then
    echo "⚠ Database is stopped, starting it..."
    NEEDS_START=true
elif [ "$CHECK_NGINX" = true ] && [ "$NGINX_STATUS" != "running" ]; then
    echo "⚠ Nginx is not running, starting services..."
    NEEDS_START=true
fi

# If database exists and is running, verify credentials match Secrets Manager
if [ "$DB_STATUS" = "running" ] && [ "$NEEDS_START" = false ]; then
    echo "✓ Database is running"
    echo "Verifying database credentials match Secrets Manager..."
    if docker exec "$CONTAINER_NAME" mariadb -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SELECT 1" "$MYSQL_DATABASE" > /dev/null 2>&1; then
        echo "✓ Database credentials are valid"
    else
        echo ""
        echo "=========================================="
        echo "ERROR: Database Credential Mismatch"
        echo "=========================================="
        echo ""
        echo "The database is running but credentials don't match Secrets Manager."
        echo "This can happen if:"
        echo "  1. Database volume persisted with old credentials"
        echo "  2. Secrets Manager was updated with new credentials"
        echo ""
        echo "Solution: Recreate database with correct credentials from Secrets Manager"
        echo "  ./durable/teardown.sh $DURABLE_ENV"
        echo "  ./durable/setup.sh $DURABLE_ENV"
        echo ""
        exit 1
    fi
fi

if [ "$NEEDS_START" = true ]; then
    # Step 5: Start database and nginx with credentials from Secrets Manager
    echo ""
    echo "DEBUG: Credentials from Secrets Manager being used for containers:"
    echo "  MYSQL_USER=$MYSQL_USER"
    echo "  MYSQL_DATABASE=$MYSQL_DATABASE"
    echo "  MYSQL_PASSWORD (first 8 chars)=${MYSQL_PASSWORD:0:8}..."
    echo "  MYSQL_ROOT_PASSWORD (first 8 chars)=${MYSQL_ROOT_PASSWORD:0:8}..."
    echo ""

    echo "Starting database and nginx with credentials from Secrets Manager..."
    docker compose -f durable/docker-compose.yml --env-file "$TEMP_ENV_FILE" -p "$PROJECT_NAME" up -d --build
else
    # Everything already running and verified
    echo ""
    echo "=========================================="
    echo "Durable Infrastructure Already Running!"
    echo "=========================================="
    echo ""
    echo "  Database: $CONTAINER_NAME ($DB_STATUS)"
    echo "  LocalStack: $LOCALSTACK_CONTAINER (running)"
    if [ "$CHECK_NGINX" = true ]; then
        echo "  Nginx: $NGINX_CONTAINER ($NGINX_STATUS)"
    fi

    # Ensure MCP server is running with current API key.
    # Each pipeline generates a new MCP_API_KEY, but durable containers persist.
    # docker compose up -d is idempotent — only recreates if config changed.
    MCP_CONTAINER="${CONTAINER_PREFIX}-mcp-server"
    echo "  Ensuring MCP server has current API key..."
    docker compose -f durable/docker-compose.yml --env-file "$TEMP_ENV_FILE" -p "$PROJECT_NAME" up -d mcp-server
    MCP_STATUS=$(docker inspect -f '{{.State.Status}}' "$MCP_CONTAINER" 2>/dev/null || echo "not-found")
    echo "  MCP Server: $MCP_CONTAINER ($MCP_STATUS)"

    echo ""
    rm "$TEMP_ENV_FILE"
    print_infrastructure_details
    exit 0
fi

# Wait for services to be healthy
echo ""
echo "Waiting for services to be ready..."
echo "  - Database: $CONTAINER_NAME"
echo "  - LocalStack: $LOCALSTACK_CONTAINER"
sleep 5

# Wait for database
MAX_DB_WAIT=${MARIADB_TIMEOUT:-120}
DB_SLEEP_INTERVAL=1
MAX_DB_ITERATIONS=$((MAX_DB_WAIT / DB_SLEEP_INTERVAL))
for i in $(seq 1 $MAX_DB_ITERATIONS); do
    if docker exec "$CONTAINER_NAME" mariadb-admin ping -h 127.0.0.1 -u root -p"$MYSQL_ROOT_PASSWORD" > /dev/null 2>&1; then
        echo "✓ Database is ready"
        break
    fi
    if [ $i -eq $MAX_DB_ITERATIONS ]; then
        echo "ERROR: Database did not become ready in time"
        echo "Showing last 50 lines of database logs:"
        docker logs "$CONTAINER_NAME" --tail 50
        rm "$TEMP_ENV_FILE"
        exit 1
    fi
    echo "Waiting for database... ($i/$MAX_DB_ITERATIONS)"
    sleep $DB_SLEEP_INTERVAL
done

# Verify application user credentials work
echo "Verifying application user credentials..."
echo ""
echo "DEBUG: What password did the MariaDB container actually receive?"
docker inspect "$CONTAINER_NAME" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep "MYSQL_PASSWORD=" | sed 's/MYSQL_PASSWORD=\(........\).*/MYSQL_PASSWORD=\1.../'
echo ""
echo "DEBUG: Testing connection with credentials from memory:"
echo "  User: $MYSQL_USER"
echo "  Password (first 8 chars): ${MYSQL_PASSWORD:0:8}..."
echo ""

if docker exec "$CONTAINER_NAME" mariadb -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SELECT 1" "$MYSQL_DATABASE" > /dev/null 2>&1; then
    echo "✓ Application user credentials verified"
else
    echo "ERROR: Application user cannot connect to database"
    echo "User: $MYSQL_USER"
    echo "Database: $MYSQL_DATABASE"
    echo ""
    echo "DEBUG: Credential mismatch detected!"
    echo "  Password in memory (first 8): ${MYSQL_PASSWORD:0:8}..."
    echo "  Password container received: see above"
    echo ""
    echo "Checking if user exists..."
    docker exec "$CONTAINER_NAME" mariadb -u root -p"$MYSQL_ROOT_PASSWORD" -e "SELECT User, Host FROM mysql.user WHERE User='$MYSQL_USER';" mysql
    rm "$TEMP_ENV_FILE"
    exit 1
fi

# LocalStack is already running and verified (started at beginning of script)
echo "✓ LocalStack is healthy"

# Verify Secrets Manager has credentials (should always be true at this point)
echo "Verifying Secrets Manager has credentials..."
if docker exec "$LOCALSTACK_CONTAINER" awslocal secretsmanager get-secret-value --secret-id echobase/database/credentials > /dev/null 2>&1; then
    echo "✓ Secrets Manager contains database credentials"
else
    echo "ERROR: Secrets Manager does not have credentials (this should not happen)"
    rm "$TEMP_ENV_FILE"
    exit 1
fi

# Clean up temporary file
rm "$TEMP_ENV_FILE"

echo ""
echo "=========================================="
echo "Durable Infrastructure Ready!"
echo "=========================================="
echo ""
print_infrastructure_details
