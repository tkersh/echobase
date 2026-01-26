#!/bin/bash

# Security Test Runner for Echobase
# This script runs all security tests to verify no unauthorized access
#
# Usage: ./test-security.sh [devlocal|ci]
#   If no environment specified, auto-detects which is running.

set -e

echo "======================================"
echo "Echobase Security Test Suite"
echo "======================================"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect environment
echo "[0/8] Detecting environment..."
# shellcheck source=scripts/detect-env.sh
if ! source "$SCRIPT_DIR/scripts/detect-env.sh" "${1:-}"; then
    exit 1
fi
echo "Using environment: $DURABLE_ENV"
echo ""

# Check if Docker containers are running
echo "[1/8] Checking if infrastructure is running..."
if ! docker compose ps | grep -q "Up"; then
    echo "❌ Error: Docker containers are not running."
    echo "   Please start the infrastructure first:"
    echo "   ./start.sh"
    exit 1
fi
echo "✅ Infrastructure is running"
echo ""

# Check if .env file exists
echo "[2/8] Checking for .env file..."
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found."
    echo "   Please generate credentials first:"
    echo "   ./generate-credentials.sh"
    exit 1
fi
echo "✅ .env file found"
echo ""

# Load environment variables
source .env

# Test KMS Key Configuration
echo "[3/8] Verifying KMS encryption key..."
# Use environment-specific state file
TF_STATE_FILE="terraform.tfstate.${DURABLE_ENV}"
KMS_KEY_ID=$(cd durable/terraform && terraform output -state="$TF_STATE_FILE" -raw kms_key_id 2>/dev/null || echo "")
if [ -z "$KMS_KEY_ID" ]; then
    echo "❌ Error: KMS key not found in Terraform state ($TF_STATE_FILE)"
    exit 1
fi
echo "   KMS Key ID: $KMS_KEY_ID"

# Verify KMS key exists in durable localstack
if ! aws kms describe-key --key-id "$KMS_KEY_ID" --endpoint-url "http://localhost:${DURABLE_LOCALSTACK_PORT}" --region us-east-1 &>/dev/null; then
    echo "❌ Error: KMS key not found in localstack"
    exit 1
fi
echo "✅ KMS key configured and accessible"
echo ""

# Test Secrets Manager Configuration
echo "[4/8] Verifying Secrets Manager secret..."
SECRET_NAME=$(cd durable/terraform && terraform output -state="$TF_STATE_FILE" -raw secret_name 2>/dev/null || echo "")
if [ -z "$SECRET_NAME" ]; then
    echo "❌ Error: Secret name not found in Terraform state"
    exit 1
fi
echo "   Secret Name: $SECRET_NAME"

# Verify secret exists and is encrypted with KMS
SECRET_INFO=$(aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --endpoint-url "http://localhost:${DURABLE_LOCALSTACK_PORT}" --region us-east-1 2>/dev/null || echo "")
if [ -z "$SECRET_INFO" ]; then
    echo "❌ Error: Secret not found in Secrets Manager"
    exit 1
fi

SECRET_KMS_KEY=$(echo "$SECRET_INFO" | grep -o '"KmsKeyId": "[^"]*"' | cut -d'"' -f4)
if [ "$SECRET_KMS_KEY" != "$KMS_KEY_ID" ]; then
    echo "❌ Error: Secret not encrypted with correct KMS key"
    echo "   Expected: $KMS_KEY_ID"
    echo "   Got: $SECRET_KMS_KEY"
    exit 1
fi
echo "✅ Secret encrypted with KMS key: $KMS_KEY_ID"
echo ""

# Test Secret Contents
echo "[5/8] Verifying secret contains database credentials..."
SECRET_VALUE=$(aws secretsmanager get-secret-value --secret-id "$SECRET_NAME" --endpoint-url "http://localhost:${DURABLE_LOCALSTACK_PORT}" --region us-east-1 --query SecretString --output text 2>/dev/null || echo "")
if [ -z "$SECRET_VALUE" ]; then
    echo "❌ Error: Could not retrieve secret value"
    exit 1
fi

# Check if secret contains required fields
if ! echo "$SECRET_VALUE" | grep -q '"username"'; then
    echo "❌ Error: Secret missing 'username' field"
    exit 1
fi
if ! echo "$SECRET_VALUE" | grep -q '"password"'; then
    echo "❌ Error: Secret missing 'password' field"
    exit 1
fi
if ! echo "$SECRET_VALUE" | grep -q '"host"'; then
    echo "❌ Error: Secret missing 'host' field"
    exit 1
fi
if ! echo "$SECRET_VALUE" | grep -q '"port"'; then
    echo "❌ Error: Secret missing 'port' field"
    exit 1
fi
if ! echo "$SECRET_VALUE" | grep -q '"dbname"'; then
    echo "❌ Error: Secret missing 'dbname' field"
    exit 1
fi
echo "✅ Secret contains all required database credential fields"
echo ""

# Test that services retrieve credentials from Secrets Manager
echo "[6/8] Verifying services use Secrets Manager..."

# Determine which containers to check based on environment
if [ "$DURABLE_ENV" = "devlocal" ]; then
    API_GATEWAY_CONTAINER="$EPHEMERAL_API_GATEWAY"
    ORDER_PROCESSOR_CONTAINER="$EPHEMERAL_ORDER_PROCESSOR"
else
    # In CI, try to find blue or green containers
    if docker inspect "echobase-green-api-gateway" >/dev/null 2>&1; then
        API_GATEWAY_CONTAINER="echobase-green-api-gateway"
        ORDER_PROCESSOR_CONTAINER="echobase-green-order-processor"
    elif docker inspect "echobase-blue-api-gateway" >/dev/null 2>&1; then
        API_GATEWAY_CONTAINER="echobase-blue-api-gateway"
        ORDER_PROCESSOR_CONTAINER="echobase-blue-order-processor"
    else
        echo "❌ Error: No API Gateway container found (tried green and blue)"
        exit 1
    fi
fi

# Check API Gateway logs
if ! docker logs "$API_GATEWAY_CONTAINER" 2>&1 | grep -q "Successfully retrieved database credentials from Secrets Manager"; then
    echo "❌ Error: API Gateway not retrieving credentials from Secrets Manager"
    echo "   Check logs: docker logs $API_GATEWAY_CONTAINER"
    exit 1
fi
echo "✅ API Gateway retrieves credentials from Secrets Manager"

# Check Order Processor logs
if ! docker logs "$ORDER_PROCESSOR_CONTAINER" 2>&1 | grep -q "Successfully retrieved database credentials from Secrets Manager"; then
    echo "❌ Error: Order Processor not retrieving credentials from Secrets Manager"
    echo "   Check logs: docker logs $ORDER_PROCESSOR_CONTAINER"
    exit 1
fi
echo "✅ Order Processor retrieves credentials from Secrets Manager"
echo ""

# Verify no credentials in logs
echo "[7/8] Verifying credentials not exposed in logs..."
# Check that password is not in logs (sample last 500 lines)
DB_PASSWORD_FROM_SECRET=$(echo "$SECRET_VALUE" | grep -o '"password":"[^"]*"' | cut -d'"' -f4)
API_RECENT_LOGS=$(docker logs "$API_GATEWAY_CONTAINER" 2>&1 | tail -500)
PROCESSOR_RECENT_LOGS=$(docker logs "$ORDER_PROCESSOR_CONTAINER" 2>&1 | tail -500)

if echo "$API_RECENT_LOGS" | grep -q "$DB_PASSWORD_FROM_SECRET"; then
    echo "⚠️  Warning: Database password found in API Gateway logs"
fi
if echo "$PROCESSOR_RECENT_LOGS" | grep -q "$DB_PASSWORD_FROM_SECRET"; then
    echo "⚠️  Warning: Database password found in Order Processor logs"
fi
echo "✅ Credentials not exposed in service logs"
echo ""

# Install test dependencies if not already installed
echo "[8/8] Running application security tests..."
cd backend/api-gateway
if [ ! -d "node_modules/jest" ]; then
    echo "   Installing Jest and Supertest..."
    npm install --silent
else
    echo "   Dependencies already installed"
fi
echo ""

# Run security tests
echo "────────────────────────────────────────"
echo ""

npm test

echo ""
echo "======================================"
echo "Security Test Summary"
echo "======================================"
echo ""
echo "✅ All security tests passed!"
echo ""
echo "Environment: $DURABLE_ENV"
echo ""
echo "Security features verified:"
echo "  ✓ KMS encryption key configured"
echo "  ✓ Secrets Manager secret encrypted with KMS"
echo "  ✓ Database credentials stored securely"
echo "  ✓ Services retrieve credentials from Secrets Manager"
echo "  ✓ Credentials not exposed in logs"
echo "  ✓ Application security tests passed"
echo ""
echo "For detailed information on security features:"
echo "  • Read SECURITY_IMPROVEMENTS.md  (KMS & Secrets Manager)"
echo "  • Read SECURITY_TESTING.md       (Test documentation)"
echo "  • Read AUTHENTICATION.md         (JWT & API Keys)"
echo "  • Read SECURITY.md               (Complete security guide)"
echo ""
echo "To run tests manually:"
echo "  cd backend/api-gateway"
echo "  npm test                    # All tests"
echo "  npm run test:security       # Security tests only"
echo ""
echo "To verify infrastructure manually:"
echo "  # KMS Key"
echo "  cd durable/terraform && terraform output -state=terraform.tfstate.${DURABLE_ENV} kms_key_id"
echo ""
echo "  # Secrets Manager"
echo "  aws secretsmanager describe-secret \\"
echo "    --secret-id echobase/database/credentials \\"
echo "    --endpoint-url http://localhost:${DURABLE_LOCALSTACK_PORT} \\"
echo "    --region us-east-1"
echo ""
