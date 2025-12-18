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
  echo "Please run ./generate-credentials.sh first to generate AWS credentials."
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
    CREDENTIALS_FILE="durable/.credentials.devlocal"
else
    PROJECT_NAME="echobase-ci-durable"
    CONTAINER_PREFIX="echobase-ci-durable"
    CREDENTIALS_FILE="durable/.credentials.ci"
fi

CONTAINER_NAME="${CONTAINER_PREFIX}-mariadb"
LOCALSTACK_CONTAINER="${CONTAINER_PREFIX}-localstack"

# Function to generate secure random password
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

# Function to print infrastructure details
print_infrastructure_details() {
    echo "Database Details:"
    if [ "$DURABLE_ENV" = "devlocal" ]; then
        echo "  Database Container: echobase-devlocal-durable-mariadb"
        echo "  LocalStack Container: echobase-devlocal-durable-localstack"
        echo "  Network: echobase-devlocal-durable-network"
        echo "  Database Port: 3306"
        echo "  LocalStack Port: 4566"
    else
        echo "  Database Container: echobase-ci-durable-mariadb"
        echo "  LocalStack Container: echobase-ci-durable-localstack"
        echo "  Network: echobase-ci-durable-network"
        echo "  Database Port: 3307"
        echo "  LocalStack Port: 4567"
    fi
    echo ""
    echo "Credentials stored in: $CREDENTIALS_FILE"
    echo "Secrets Manager: echobase/database/credentials"
    echo ""
    echo "This infrastructure persists across blue-green deployments."
    echo "To tear down: ./durable/teardown.sh $DURABLE_ENV"
    echo ""
}

# Check if credentials file already exists
if [ -f "$CREDENTIALS_FILE" ]; then
    echo "✓ Found existing credentials file: $CREDENTIALS_FILE"
    echo "  Loading existing database credentials..."
    # shellcheck source=/dev/null
    source "$CREDENTIALS_FILE"
else
    echo "Generating new database credentials..."

    # Generate secure credentials
    MYSQL_ROOT_PASSWORD=$(generate_password)
    MYSQL_USER="app_user"
    MYSQL_PASSWORD=$(generate_password)
    MYSQL_DATABASE="orders_db"

    # Save credentials to file
    cat > "$CREDENTIALS_FILE" <<EOF
# Database Credentials for $DURABLE_ENV
# Generated: $(date)
# WARNING: This file contains sensitive credentials. Keep secure!

MYSQL_ROOT_PASSWORD=$MYSQL_ROOT_PASSWORD
MYSQL_USER=$MYSQL_USER
MYSQL_PASSWORD=$MYSQL_PASSWORD
MYSQL_DATABASE=$MYSQL_DATABASE
EOF

    chmod 600 "$CREDENTIALS_FILE"
    echo "✓ Database credentials generated and saved to $CREDENTIALS_FILE"
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

# Check if infrastructure already exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    CONTAINER_STATUS=$(docker inspect -f '{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "not-found")

    if [ "$CONTAINER_STATUS" = "running" ]; then
        echo "✓ Durable infrastructure already exists and is running"
        echo "  Database: $CONTAINER_NAME"
        echo "  LocalStack: $LOCALSTACK_CONTAINER"
        echo ""

        # Check if Terraform has been applied
        if docker exec "$LOCALSTACK_CONTAINER" awslocal secretsmanager get-secret-value --secret-id echobase/database/credentials > /dev/null 2>&1; then
            echo "✓ Secrets Manager already configured"
        else
            echo "⚠ Secrets Manager not configured yet"
            echo "  Applying Terraform configuration..."
            ./durable/terraform-apply.sh "$DURABLE_ENV"
        fi

        rm "$TEMP_ENV_FILE"

        echo ""
        echo "=========================================="
        echo "Durable Infrastructure Already Running!"
        echo "=========================================="
        echo ""
        print_infrastructure_details
        exit 0
    elif [ "$CONTAINER_STATUS" = "exited" ]; then
        echo "⚠ Durable infrastructure exists but is stopped"
        echo "  Starting existing containers..."
        docker compose -f durable/docker-compose.yml --env-file "$TEMP_ENV_FILE" -p "$PROJECT_NAME" up -d
    fi
else
    echo "Creating new durable infrastructure..."
    echo "Project name: $PROJECT_NAME"
    echo ""

    # Start durable infrastructure
    docker compose -f durable/docker-compose.yml --env-file "$TEMP_ENV_FILE" -p "$PROJECT_NAME" up -d
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

# Wait for LocalStack
MAX_LS_WAIT=${LOCALSTACK_TIMEOUT:-150}
SLEEP_INTERVAL=2
MAX_LS_ITERATIONS=$((MAX_LS_WAIT / SLEEP_INTERVAL))
for i in $(seq 1 $MAX_LS_ITERATIONS); do
    if docker exec "$LOCALSTACK_CONTAINER" curl -sf http://localhost:4566/_localstack/health > /dev/null 2>&1; then
        echo "✓ LocalStack is ready"
        break
    fi
    if [ $i -eq $MAX_LS_ITERATIONS ]; then
        echo "ERROR: LocalStack did not become ready in time"
        echo "Showing last 50 lines of LocalStack logs:"
        docker logs "$LOCALSTACK_CONTAINER" --tail 50
        rm "$TEMP_ENV_FILE"
        exit 1
    fi
    echo "Waiting for LocalStack... ($i/$MAX_LS_ITERATIONS)"
    sleep $SLEEP_INTERVAL
done

# Apply Terraform to configure Secrets Manager and KMS
echo ""
echo "Applying Terraform configuration..."
echo "  - Creating KMS key for database encryption"
echo "  - Storing database credentials in Secrets Manager"
./durable/terraform-apply.sh "$DURABLE_ENV"

# Clean up temporary file
rm "$TEMP_ENV_FILE"

echo ""
echo "=========================================="
echo "Durable Infrastructure Ready!"
echo "=========================================="
echo ""
print_infrastructure_details
