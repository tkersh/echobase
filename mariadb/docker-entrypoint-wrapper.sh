#!/bin/bash
# MariaDB entrypoint wrapper that fetches encryption key from Secrets Manager
# This script runs before the standard MariaDB entrypoint

set -e

KEYFILE_PATH="/etc/mysql/encryption/keyfile.enc"
SECRET_NAME="echobase/database/encryption-key"

echo "MariaDB Entrypoint Wrapper: Fetching encryption key from Secrets Manager..."

# Determine the Secrets Manager endpoint
# In durable infrastructure, we connect to the durable LocalStack
if [ -n "$SECRETS_MANAGER_ENDPOINT" ]; then
    ENDPOINT_URL="$SECRETS_MANAGER_ENDPOINT"
else
    # Default to durable LocalStack container (internal Docker network)
    ENDPOINT_URL="http://echobase-devlocal-durable-localstack:4566"
fi

echo "  Using endpoint: $ENDPOINT_URL"

# Function to fetch encryption key with retries
fetch_encryption_key() {
    local max_attempts=30
    local attempt=1
    local wait_time=2

    while [ $attempt -le $max_attempts ]; do
        echo "  Attempt $attempt/$max_attempts: Fetching encryption key..."

        # Try to fetch the secret
        SECRET_JSON=$(aws secretsmanager get-secret-value \
            --secret-id "$SECRET_NAME" \
            --endpoint-url "$ENDPOINT_URL" \
            --region "${AWS_REGION:-us-east-1}" \
            --query SecretString \
            --output text 2>/dev/null) && break

        if [ $attempt -eq $max_attempts ]; then
            echo "ERROR: Failed to fetch encryption key after $max_attempts attempts"
            echo "  Secret: $SECRET_NAME"
            echo "  Endpoint: $ENDPOINT_URL"
            exit 1
        fi

        echo "  Waiting ${wait_time}s before retry..."
        sleep $wait_time
        attempt=$((attempt + 1))
    done

    echo "  Successfully fetched encryption key from Secrets Manager"
}

# Fetch the encryption key
fetch_encryption_key

# Parse the JSON and extract key_id and key_hex
KEY_ID=$(echo "$SECRET_JSON" | grep -o '"key_id":[0-9]*' | cut -d':' -f2)
KEY_HEX=$(echo "$SECRET_JSON" | grep -o '"key_hex":"[^"]*"' | cut -d'"' -f4)

if [ -z "$KEY_ID" ] || [ -z "$KEY_HEX" ]; then
    echo "ERROR: Failed to parse encryption key from secret"
    echo "  Expected JSON with key_id and key_hex fields"
    exit 1
fi

# Ensure the encryption directory exists with proper permissions
mkdir -p /etc/mysql/encryption
chown mysql:mysql /etc/mysql/encryption
chmod 750 /etc/mysql/encryption

# Write the keyfile in MariaDB's expected format: key_id;hex_key
echo "${KEY_ID};${KEY_HEX}" > "$KEYFILE_PATH"

# Set proper permissions (readable only by mysql user)
chown mysql:mysql "$KEYFILE_PATH"
chmod 600 "$KEYFILE_PATH"

echo "  Encryption key written to $KEYFILE_PATH"
echo "  Key ID: $KEY_ID"
echo "MariaDB Entrypoint Wrapper: Ready to start MariaDB"

# Execute the original MariaDB entrypoint with all arguments
exec docker-entrypoint.sh "$@"
