#!/bin/bash
# Run Terraform destroy with standard configuration
# Usage: ./terraform-destroy.sh [localstack-endpoint]
#
# Example:
#   ./terraform-destroy.sh http://localhost:4567

set -e

LOCALSTACK_ENDPOINT=$1

# Source .env if it exists and AWS credentials aren't set
if [ -f .env ] && [ -z "$AWS_ACCESS_KEY_ID" ]; then
    echo "Sourcing .env file..."
    source .env
fi

# Set localstack endpoint if provided
if [ -n "$LOCALSTACK_ENDPOINT" ]; then
    export TF_VAR_localstack_endpoint=$LOCALSTACK_ENDPOINT
fi

# Export AWS credentials needed for Terraform
export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
export AWS_REGION=${AWS_REGION:-us-east-1}

# Export database variables
export TF_VAR_db_user=${DB_USER}
export TF_VAR_db_password=${DB_PASSWORD}
export TF_VAR_db_host=${DB_HOST}
export TF_VAR_db_port=${DB_PORT}
export TF_VAR_db_name=${DB_NAME}

echo "=== Terraform Destroy Configuration ==="
echo "AWS_REGION: ${AWS_REGION}"
echo "TF_VAR_localstack_endpoint: ${TF_VAR_localstack_endpoint:-not set}"
echo "========================================"

cd terraform

echo "Initializing Terraform..."
terraform init || true

echo "Destroying Terraform resources..."
terraform destroy -auto-approve || true

cd ..

echo "✓ Terraform destroy completed"
