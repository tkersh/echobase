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
echo "Stopping and removing containers..."
for container in mariadb localstack nginx mcp-server otel-collector jaeger prometheus loki grafana; do
    container_name="${CONTAINER_PREFIX}-${container}"
    if docker inspect "$container_name" >/dev/null 2>&1; then
        echo "  Removing: $container_name"
        docker stop "$container_name" 2>/dev/null || true
        docker rm "$container_name" 2>/dev/null || true
    else
        echo "  Skipping: $container_name (not found)"
    fi
done

echo ""
echo "Removing network..."
if docker network inspect ${NETWORK_NAME} >/dev/null 2>&1; then
    docker network rm ${NETWORK_NAME} 2>/dev/null || true
    echo "  ✓ Removed network: ${NETWORK_NAME}"
else
    echo "  Network already removed: ${NETWORK_NAME}"
fi

# Optionally remove volumes
if [ "$REMOVE_VOLUMES" = true ]; then
    echo ""
    echo "Removing data volumes..."
    for volume in mariadb-data localstack-data nginx-config jaeger-badger-data prometheus-data loki-data grafana-data; do
        volume_name="${VOLUME_PREFIX}-${volume}"
        if docker volume inspect "$volume_name" >/dev/null 2>&1; then
            docker volume rm "$volume_name" 2>/dev/null || true
            echo "  ✓ Removed volume: $volume_name"
        else
            echo "  Skipping: $volume_name (not found)"
        fi
    done
    echo ""
    echo "=========================================="
    echo "✓ Durable infrastructure removed (including data volumes)"
    echo "=========================================="
else
    echo ""
    echo "=========================================="
    echo "✓ Durable infrastructure stopped"
    echo "=========================================="
    echo ""
    echo "Data volumes preserved:"
    for volume in mariadb-data localstack-data nginx-config jaeger-badger-data prometheus-data loki-data grafana-data; do
        volume_name="${VOLUME_PREFIX}-${volume}"
        if docker volume inspect "$volume_name" >/dev/null 2>&1; then
            size=$(docker volume inspect "$volume_name" --format '{{.Mountpoint}}' | xargs du -sh 2>/dev/null | cut -f1 || echo "unknown")
            echo "  - ${volume_name} (size: ${size})"
        fi
    done
    echo ""
    echo "To remove data volumes, run: $0 $DURABLE_ENV --volumes"
fi

echo ""
