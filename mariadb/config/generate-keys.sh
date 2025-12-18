#!/bin/bash
# Generate encryption keys for MariaDB data-at-rest encryption
# This script creates a keyfile in the format required by MariaDB's file_key_management plugin

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYFILE="$SCRIPT_DIR/keyfile.enc"

echo "Generating MariaDB encryption keyfile..."

# Generate a 256-bit (32-byte) encryption key
# Key ID 1 is used as the default encryption key
KEY_ID=1
KEY_HEX=$(openssl rand -hex 32)

# Write the keyfile in the format: key_id;hex_key
echo "${KEY_ID};${KEY_HEX}" > "$KEYFILE"

# Set permissions to allow container's mysql user to read it
# 644 = owner can read/write, group and others can read
chmod 644 "$KEYFILE"

echo "✓ Encryption keyfile generated: $KEYFILE"
echo "  Key ID: $KEY_ID"
echo "  Key length: 256 bits"
echo ""
echo "IMPORTANT: Keep this file secure!"
echo "- Never commit this file to version control"
echo "- Backup this file in a secure location"
echo "- If this file is lost, encrypted data cannot be recovered"
