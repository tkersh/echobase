#!/bin/sh
# 40-ssl-setup.sh
# Fetches SSL certificates from Secrets Manager at startup.
# Shared by frontend and durable nginx — both COPY from this file.
#
# Required env vars:
#   SSL_SECRET_ID  — Secrets Manager secret name (e.g. echobase/frontend/ssl)
#   AWS_ENDPOINT_URL — (optional) custom endpoint for LocalStack
#
# Optional env vars:
#   SSL_DIR — directory to write certs into (default: /etc/nginx/ssl)

set -e

echo "SSL Setup: Initializing..."

# Configuration
SSL_SECRET_ID=${SSL_SECRET_ID:-echobase/frontend/ssl}
SSL_DIR=${SSL_DIR:-/etc/nginx/ssl}
KEY_FILE="$SSL_DIR/localhost.key"
CERT_FILE="$SSL_DIR/localhost.crt"

# Ensure SSL directory exists
mkdir -p "$SSL_DIR"

# Fetch from Secrets Manager
echo "SSL Setup: Fetching secret '$SSL_SECRET_ID' from Secrets Manager..."

# Construct AWS CLI arguments
AWS_ARGS="secretsmanager get-secret-value --secret-id $SSL_SECRET_ID --query SecretString --output text"

if [ -n "$AWS_ENDPOINT_URL" ]; then
    echo "SSL Setup: Using custom endpoint: $AWS_ENDPOINT_URL"
    AWS_ARGS="$AWS_ARGS --endpoint-url $AWS_ENDPOINT_URL"
fi

# Fetch and parse secret — fail fast on error
if ! SECRET_JSON=$(aws $AWS_ARGS 2>&1); then
    echo "SSL Setup: ERROR: Failed to fetch secret '$SSL_SECRET_ID' from Secrets Manager."
    echo "SSL Setup: $SECRET_JSON"
    echo "SSL Setup: Ensure durable/setup.sh has been run to seed SSL secrets."
    exit 1
fi

echo "SSL Setup: Secret fetched successfully."

# Extract key and cert using jq
echo "$SECRET_JSON" | jq -r .key > "$KEY_FILE"
echo "$SECRET_JSON" | jq -r .cert > "$CERT_FILE"

# Validate files have content
if [ ! -s "$KEY_FILE" ] || [ ! -s "$CERT_FILE" ]; then
    echo "SSL Setup: ERROR: Parsed certificate content is empty."
    exit 1
fi

echo "SSL Setup: Certificates written to disk."

# Set permissions
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"

echo "SSL Setup: Complete."
