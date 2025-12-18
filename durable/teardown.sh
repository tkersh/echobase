#!/bin/bash
# Teardown script for durable infrastructure
# Usage: ./durable/teardown.sh [devlocal|ci] [--volumes]
#
# This script tears down the durable database infrastructure.
# Use --volumes flag to also remove data volumes (WARNING: This deletes all data!)

set -e

DURABLE_ENV=${1:-devlocal}
REMOVE_VOLUMES=false

if [ "$DURABLE_ENV" != "devlocal" ] && [ "$DURABLE_ENV" != "ci" ]; then
    echo "Error: Environment must be 'devlocal' or 'ci'"
    echo "Usage: $0 [devlocal|ci] [--volumes]"
    exit 1
fi

# Check for --volumes flag
if [ "$2" = "--volumes" ] || [ "$3" = "--volumes" ]; then
    REMOVE_VOLUMES=true
fi

echo "=========================================="
echo "Tearing down Durable Infrastructure"
echo "Environment: $DURABLE_ENV"
if [ "$REMOVE_VOLUMES" = true ]; then
    echo "WARNING: This will also remove data volumes!"
fi
echo "=========================================="
echo ""

# Determine project name and container prefix based on environment
if [ "$DURABLE_ENV" = "devlocal" ]; then
    PROJECT_NAME="echobase-devlocal-durable"
    CONTAINER_PREFIX="echobase-devlocal-durable"
    NETWORK_NAME="echobase-devlocal-durable-network"
    VOLUME_PREFIX="echobase-devlocal-durable"
else
    PROJECT_NAME="echobase-ci-durable"
    CONTAINER_PREFIX="echobase-ci-durable"
    NETWORK_NAME="echobase-ci-durable-network"
    VOLUME_PREFIX="echobase-ci-durable"
fi

echo "Stopping durable infrastructure..."
echo "  Project: $PROJECT_NAME"
echo "  Containers: ${CONTAINER_PREFIX}-*"
echo ""

# Check if containers exist
if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_PREFIX}"; then
    echo "No durable infrastructure containers found for environment: $DURABLE_ENV"
    exit 0
fi

# Stop and remove containers
echo "Stopping containers..."
docker stop ${CONTAINER_PREFIX}-mariadb ${CONTAINER_PREFIX}-localstack 2>/dev/null || true
docker rm ${CONTAINER_PREFIX}-mariadb ${CONTAINER_PREFIX}-localstack 2>/dev/null || true

# Remove network
echo "Removing network..."
docker network rm ${NETWORK_NAME} 2>/dev/null || true

# Optionally remove volumes
if [ "$REMOVE_VOLUMES" = true ]; then
    echo "Removing data volumes..."
    docker volume rm ${VOLUME_PREFIX}-mariadb-data ${VOLUME_PREFIX}-localstack-data 2>/dev/null || true
    echo ""
    echo "✓ Durable infrastructure removed (including data volumes)"
    echo ""
    echo "NOTE: Credentials file still exists at: durable/.credentials.${DURABLE_ENV}"
    echo "      If you want to start fresh, delete it: rm durable/.credentials.${DURABLE_ENV}"
else
    echo ""
    echo "✓ Durable infrastructure stopped (data volumes preserved)"
    echo "  Data volumes:"
    echo "    - ${VOLUME_PREFIX}-mariadb-data"
    echo "    - ${VOLUME_PREFIX}-localstack-data"
    echo ""
    echo "  To remove data volumes, run: $0 $DURABLE_ENV --volumes"
fi

echo ""
