#!/bin/bash
# Run Terraform apply with standard configuration
# Usage: ./terraform-apply.sh <localstack-endpoint> [environment]
#
# Arguments:
#   localstack-endpoint: URL of LocalStack instance (required)
#   environment: Environment name for conditional resources (optional, default: "green")
#                Use "devlocal" or "ci" for durable environments (creates secrets)
#                Use "green" or "blue" for ephemeral environments (SQS only)
#
# Examples:
#   ./terraform-apply.sh http://localhost:4666        # Green (SQS only)
#   ./terraform-apply.sh http://localhost:4666 green  # Explicit green (SQS only)
#   ./terraform-apply.sh http://localhost:4567 ci     # Durable CI (SQS + Secrets)

set -e

LOCALSTACK_ENDPOINT=$1
ENVIRONMENT=${2:-green}

if [ -z "$LOCALSTACK_ENDPOINT" ]; then
    echo "ERROR: LocalStack endpoint is required"
    echo "Usage: $0 <localstack-endpoint> [environment]"
    exit 1
fi

echo "Terraform environment: $ENVIRONMENT"
if [[ "$ENVIRONMENT" == "devlocal" || "$ENVIRONMENT" == "ci" ]]; then
    echo "  ✓ Durable environment - will create KMS + Secrets Manager + SQS"
else
    echo "  ✓ Ephemeral environment - will create SQS only (secrets in durable LocalStack)"
fi

# Function to get the Docker host IP when running inside a container
get_docker_host_ip() {
    # Check if we're running inside a container
    if [ -f /.dockerenv ] || grep -q docker /proc/1/cgroup 2>/dev/null; then
        # Try host.docker.internal first (works on Docker Desktop)
        if getent hosts host.docker.internal >/dev/null 2>&1; then
            echo "host.docker.internal"
            return
        fi
        # Try to get the gateway IP
        GATEWAY_IP=$(ip route | awk '/default/ {print $3}' | head -1)
        if [ -n "$GATEWAY_IP" ]; then
            echo "$GATEWAY_IP"
            return
        fi
    fi
    echo "localhost"
}

# Replace localhost with Docker host IP if needed
if echo "$LOCALSTACK_ENDPOINT" | grep -q "localhost"; then
    DOCKER_HOST_IP=$(get_docker_host_ip)
    if [ "$DOCKER_HOST_IP" != "localhost" ]; then
        ORIGINAL_ENDPOINT="$LOCALSTACK_ENDPOINT"
        LOCALSTACK_ENDPOINT=$(echo "$LOCALSTACK_ENDPOINT" | sed "s/localhost/$DOCKER_HOST_IP/")
        echo "Running inside container, using Docker host IP: $DOCKER_HOST_IP"
        echo "Modified endpoint: $ORIGINAL_ENDPOINT -> $LOCALSTACK_ENDPOINT"
    fi
fi

# Ensure .env is sourced if it exists and AWS credentials aren't set
if [ -f .env ] && [ -z "$AWS_ACCESS_KEY_ID" ]; then
    echo "Sourcing .env file..."
    source .env
    [ -f .env.secrets ] && source .env.secrets
fi

cd terraform

echo "Initializing Terraform..."
terraform init

echo "Configuring Terraform variables..."
export TF_VAR_localstack_endpoint=$LOCALSTACK_ENDPOINT
export TF_VAR_environment=$ENVIRONMENT
source ../scripts/export-terraform-vars.sh

# For ephemeral environments (green/blue), DB variables aren't used (secrets not created)
# Set safe defaults to avoid warnings
if [[ "$ENVIRONMENT" != "devlocal" && "$ENVIRONMENT" != "ci" ]]; then
    export TF_VAR_db_host=${TF_VAR_db_host:-"not-used-in-ephemeral"}
    export TF_VAR_db_port=${TF_VAR_db_port:-3306}
    export TF_VAR_db_name=${TF_VAR_db_name:-"not-used-in-ephemeral"}
    export TF_VAR_db_user=${TF_VAR_db_user:-"not-used-in-ephemeral"}
    export TF_VAR_db_password=${TF_VAR_db_password:-"not-used-in-ephemeral"}
fi

echo ""
echo "=== Terraform Variable Check ==="
echo "Environment: ${TF_VAR_environment}"
echo "AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:+set (${#AWS_ACCESS_KEY_ID} chars)}"
echo "AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:+set (${#AWS_SECRET_ACCESS_KEY} chars)}"
echo "AWS_REGION: ${AWS_REGION}"
echo "TF_VAR_localstack_endpoint: ${TF_VAR_localstack_endpoint}"
if [[ "$ENVIRONMENT" == "devlocal" || "$ENVIRONMENT" == "ci" ]]; then
    echo "TF_VAR_db_host: ${TF_VAR_db_host}"
    echo "TF_VAR_db_port: ${TF_VAR_db_port} (type: $(echo $TF_VAR_db_port | grep -E '^[0-9]+$' && echo 'number' || echo 'string/invalid'))"
else
    echo "TF_VAR_db_* variables: (not used - secrets not created in ephemeral environments)"
fi
echo "================================"
echo ""

echo "Applying Terraform configuration..."
terraform apply -auto-approve

cd ..

echo "✓ Terraform apply completed successfully"
