#!/bin/bash
# Apply Terraform configuration for Durable Infrastructure
# This creates persistent KMS keys and Secrets Manager secrets
# Usage: ./durable/terraform-apply.sh <environment>
#   environment: devlocal or ci

set -e

ENVIRONMENT=$1

if [ -z "$ENVIRONMENT" ]; then
    echo "ERROR: Environment is required"
    echo "Usage: $0 <environment>"
    echo "  environment: devlocal or ci"
    exit 1
fi

if [ "$ENVIRONMENT" != "devlocal" ] && [ "$ENVIRONMENT" != "ci" ]; then
    echo "ERROR: Invalid environment '$ENVIRONMENT'"
    echo "Must be 'devlocal' or 'ci'"
    exit 1
fi

# Source environment variables from root .env
# shellcheck source=/dev/null
if [ -f .env ]; then
    echo "Sourcing .env file..."
    source .env
    echo "AWS credentials from .env: AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:+set}, AWS_REGION=${AWS_REGION}"
else
    echo "ERROR: .env file not found in project root"
    exit 1
fi

# Source durable environment-specific configuration
DURABLE_ENV_FILE="durable/.env.${ENVIRONMENT}"
# shellcheck source=/dev/null
if [ -f "$DURABLE_ENV_FILE" ]; then
    echo "Sourcing ${DURABLE_ENV_FILE}..."
    source "$DURABLE_ENV_FILE"
    echo "After sourcing durable env: AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:+set}, AWS_REGION=${AWS_REGION}"

    # Set AWS metadata disable flag based on LocalStack usage
    if [ "${USING_LOCALSTACK_FOR_AWS}" = "true" ]; then
        echo "LocalStack mode detected: disabling AWS EC2 metadata service"
        export AWS_EC2_METADATA_DISABLED=true
    fi
else
    echo "ERROR: ${DURABLE_ENV_FILE} not found"
    exit 1
fi

# Load database credentials from credentials file
CREDENTIALS_FILE="durable/.credentials.${ENVIRONMENT}"
if [ ! -f "$CREDENTIALS_FILE" ]; then
    echo "ERROR: Credentials file not found: $CREDENTIALS_FILE"
    echo "Please run: ./durable/setup.sh ${ENVIRONMENT}"
    exit 1
fi

echo "Loading database credentials from ${CREDENTIALS_FILE}..."
# shellcheck source=/dev/null
source "$CREDENTIALS_FILE"

DB_USER=$MYSQL_USER
DB_PASSWORD=$MYSQL_PASSWORD
DB_NAME=$MYSQL_DATABASE

echo "Database credentials loaded successfully"

# Set LocalStack endpoint based on environment
DURABLE_LOCALSTACK_CONTAINER="${DURABLE_CONTAINER_PREFIX}-localstack"

# Function to get Docker host IP when running inside a container (e.g., GitLab runner)
get_docker_host_ip() {
    # Try host.docker.internal first (Docker Desktop, newer Docker versions)
    if getent hosts host.docker.internal >/dev/null 2>&1; then
        echo "host.docker.internal"
        return
    fi
    # Try to get the gateway IP (default Docker bridge)
    GATEWAY_IP=$(ip route | awk '/default/ {print $3}' | head -1)
    if [ -n "$GATEWAY_IP" ]; then
        echo "$GATEWAY_IP"
        return
    fi
    # Fallback to localhost
    echo "localhost"
}

# Determine if we're inside a container (GitLab runner)
if [ -f /.dockerenv ] || grep -q docker /proc/1/cgroup 2>/dev/null; then
    DOCKER_HOST_IP=$(get_docker_host_ip)
    LOCALSTACK_ENDPOINT="http://${DOCKER_HOST_IP}:${DURABLE_LOCALSTACK_PORT}"
    echo "Detected running inside container, using Docker host IP: ${DOCKER_HOST_IP}"
else
    LOCALSTACK_ENDPOINT="http://localhost:${DURABLE_LOCALSTACK_PORT}"
fi

echo "LocalStack endpoint: ${LOCALSTACK_ENDPOINT}"

# Wait for LocalStack to be ready
echo "Waiting for durable LocalStack to be ready..."
MAX_WAIT=${LOCALSTACK_TIMEOUT:-60}
SLEEP_INTERVAL=2
MAX_ITERATIONS=$((MAX_WAIT / SLEEP_INTERVAL))

# Check LocalStack health using docker exec (works from both host and GitLab runner)
for i in $(seq 1 "$MAX_ITERATIONS"); do
    # Use docker exec to check health from inside the container (bypasses network issues)
    if docker exec "${DURABLE_LOCALSTACK_CONTAINER}" curl -sf http://localhost:4566/_localstack/health > /dev/null 2>&1; then
        echo "✓ LocalStack is ready"
        break
    fi
    if [ "$i" -eq "$MAX_ITERATIONS" ]; then
        echo "ERROR: LocalStack did not become ready in time (${MAX_WAIT}s)"
        echo "Container: ${DURABLE_LOCALSTACK_CONTAINER}"
        echo "Checking container status:"
        docker ps --filter "name=${DURABLE_LOCALSTACK_CONTAINER}" || true
        echo ""
        echo "Attempting to show LocalStack logs:"
        docker logs "${DURABLE_LOCALSTACK_CONTAINER}" --tail 50 2>&1 || true
        exit 1
    fi
    echo "Waiting for LocalStack... ($i/$MAX_ITERATIONS)"
    sleep "$SLEEP_INTERVAL"
done

cd durable/terraform

echo "Initializing Terraform..."
terraform init

echo "Configuring Terraform variables..."
echo "DEBUG: Before check - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:+set}, value=${AWS_ACCESS_KEY_ID}"

# Verify AWS credentials are loaded
if [ -z "$AWS_ACCESS_KEY_ID" ]; then
    echo "ERROR: AWS_ACCESS_KEY_ID not found"
    echo "Make sure .env file contains AWS credentials"
    exit 1
fi

# Export AWS credentials as environment variables (AWS provider looks for these first)
echo "AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:+set (${#AWS_ACCESS_KEY_ID} chars)}"
echo "AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:+set (${#AWS_SECRET_ACCESS_KEY} chars)}"
echo "AWS_REGION: ${AWS_REGION}"
export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY
export AWS_REGION

# Export Terraform variables
export TF_VAR_aws_region=${AWS_REGION}
export TF_VAR_aws_access_key_id=${AWS_ACCESS_KEY_ID}
export TF_VAR_aws_secret_access_key=${AWS_SECRET_ACCESS_KEY}
export TF_VAR_localstack_endpoint=${LOCALSTACK_ENDPOINT}
export TF_VAR_db_user=${DB_USER}
export TF_VAR_db_password=${DB_PASSWORD}
export TF_VAR_db_host=${DURABLE_CONTAINER_PREFIX}-mariadb
export TF_VAR_db_port=3306
export TF_VAR_db_name=${DB_NAME}
export TF_VAR_environment=${ENVIRONMENT}

echo ""
echo "=== Terraform Variable Check ==="
echo "Environment: ${ENVIRONMENT}"
echo "LocalStack Endpoint: ${TF_VAR_localstack_endpoint}"
echo "DB Host: ${TF_VAR_db_host}"
echo "DB Port: ${TF_VAR_db_port}"
echo "DB Name: ${TF_VAR_db_name}"
echo "DB User: ${TF_VAR_db_user}"
echo "================================"
echo ""

echo "Applying Terraform configuration..."
terraform apply -auto-approve

cd ../..

echo "✓ Durable infrastructure Terraform apply completed successfully"
echo ""
echo "KMS and Secrets Manager are now configured in durable LocalStack"
echo "Green and blue environments should connect to:"
echo "  - LocalStack: ${DURABLE_LOCALSTACK_CONTAINER}:4566"
echo "  - Secret Name: echobase/database/credentials"
