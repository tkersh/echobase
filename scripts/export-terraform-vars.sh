#!/bin/bash
# Export Terraform variables for CI/CD pipeline
# This script should be sourced, not executed: source scripts/export-terraform-vars.sh

# Don't use 'set -e' in a sourced script as it will exit the parent shell
# set -e

# Check if .env needs to be sourced (handle both project root and subdirectories)
if [ -z "$AWS_ACCESS_KEY_ID" ]; then
    if [ -f .env ]; then
        echo "Sourcing .env file for Terraform variables..."
        source .env
    elif [ -f ../.env ]; then
        echo "Sourcing ../.env file for Terraform variables..."
        source ../.env
    fi
fi

# AWS credentials (required for Terraform AWS provider)
export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
export AWS_REGION=${AWS_REGION:-us-east-1}

# Terraform database variables
export TF_VAR_db_user=${DB_USER}
export TF_VAR_db_password=${DB_PASSWORD}
export TF_VAR_db_host=${DB_HOST}
export TF_VAR_db_port=${DB_PORT}
export TF_VAR_db_name=${DB_NAME}

# LocalStack endpoint (use docker:4566 for CI, localhost:4566 for local)
export TF_VAR_localstack_endpoint=${TF_VAR_localstack_endpoint:-http://docker:4566}

# Validate required variables
MISSING_VARS=()
[ -z "$AWS_ACCESS_KEY_ID" ] && MISSING_VARS+=("AWS_ACCESS_KEY_ID")
[ -z "$AWS_SECRET_ACCESS_KEY" ] && MISSING_VARS+=("AWS_SECRET_ACCESS_KEY")
[ -z "$TF_VAR_db_user" ] && MISSING_VARS+=("DB_USER/TF_VAR_db_user")
[ -z "$TF_VAR_db_password" ] && MISSING_VARS+=("DB_PASSWORD/TF_VAR_db_password")

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "WARNING: Missing required variables: ${MISSING_VARS[*]}"
fi

echo "✓ Terraform variables exported"
echo "  AWS_REGION: ${AWS_REGION}"
echo "  AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:0:8}..."
echo "  TF_VAR_localstack_endpoint: ${TF_VAR_localstack_endpoint}"
echo "  TF_VAR_db_host: ${TF_VAR_db_host}"
echo "  TF_VAR_db_port: ${TF_VAR_db_port}"
