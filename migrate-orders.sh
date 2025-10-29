#!/bin/bash

# Migration script to add user_id column to orders table
# This script updates an existing database with the new schema

set -e

echo "======================================"
echo "Orders Table Migration Script"
echo "Adding user_id foreign key reference"
echo "======================================"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found."
    echo "   Please ensure you're running this from the project root."
    exit 1
fi

# Load environment variables
source .env

# Check if MariaDB container is running
echo "[1/4] Checking if MariaDB is running..."
if ! docker-compose ps mariadb | grep -q "Up"; then
    echo "❌ Error: MariaDB container is not running."
    echo "   Please start the infrastructure first:"
    echo "   docker-compose up -d mariadb"
    exit 1
fi
echo "✅ MariaDB is running"
echo ""

# Create backup
echo "[2/4] Creating database backup..."
BACKUP_FILE="backup_orders_$(date +%Y%m%d_%H%M%S).sql"
docker exec echobase-mariadb-1 mariadb-dump -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" orders > "$BACKUP_FILE" 2>/dev/null || true
if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
    echo "✅ Backup created: $BACKUP_FILE"
else
    echo "⚠️  Warning: Could not create backup (table may not exist yet)"
    rm -f "$BACKUP_FILE"
fi
echo ""

# Run migration
echo "[3/4] Running migration..."
docker exec -i echobase-mariadb-1 mariadb -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < migrate-add-user-id.sql
echo ""

# Verify migration
echo "[4/4] Verifying migration..."
echo "Current orders table structure:"
docker exec echobase-mariadb-1 mariadb -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "DESCRIBE orders;"
echo ""

echo "======================================"
echo "Migration Summary"
echo "======================================"
echo ""
echo "✅ Migration completed successfully!"
echo ""
echo "Changes made:"
echo "  • Added user_id column (INT NULL) to orders table"
echo "  • Added foreign key constraint: orders.user_id -> users.id"
echo "  • Added index on user_id for performance"
echo "  • Configured ON DELETE SET NULL for data integrity"
echo ""
echo "Notes:"
echo "  • Existing orders have user_id set to NULL"
echo "  • New orders from JWT-authenticated users will have user_id populated"
echo "  • Orders from API key authentication will have user_id as NULL"
echo ""
if [ -f "$BACKUP_FILE" ]; then
    echo "Backup file: $BACKUP_FILE"
    echo "Keep this backup in case you need to rollback."
fi
echo ""
