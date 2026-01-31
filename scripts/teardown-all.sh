#!/bin/bash
# Master teardown script - removes all echobase infrastructure
# Usage: ./scripts/teardown-all.sh [--volumes] [--include-ci]
#
# This script tears down EVERYTHING for local development cleanup:
#   - Blue ephemeral environment
#   - Green ephemeral environment
#   - Devlocal ephemeral environment (api-gateway, frontend, order-processor, localstack)
#   - Devlocal durable infrastructure (MariaDB, LocalStack, nginx, MCP server)
#   - CI durable infrastructure (with --include-ci)
#
# Options:
#   --volumes     Also remove data volumes (WARNING: Deletes all data!)
#   --include-ci  Also teardown CI durable infrastructure
#
# This is a development convenience script - use with caution!

set -e

# Parse arguments
REMOVE_VOLUMES=false
INCLUDE_CI=false

for arg in "$@"; do
    case $arg in
        --volumes)
            REMOVE_VOLUMES=true
            ;;
        --include-ci)
            INCLUDE_CI=true
            ;;
        --help|-h)
            echo "Usage: $0 [--volumes] [--include-ci]"
            echo ""
            echo "Tears down all echobase infrastructure for local development cleanup."
            echo ""
            echo "Options:"
            echo "  --volumes     Also remove data volumes (WARNING: Deletes all data!)"
            echo "  --include-ci  Also teardown CI durable infrastructure"
            echo ""
            echo "Components removed:"
            echo "  - echobase-blue-* (blue ephemeral environment)"
            echo "  - echobase-green-* (green ephemeral environment)"
            echo "  - echobase-devlocal-* (devlocal ephemeral: api-gateway, frontend, etc.)"
            echo "  - echobase-devlocal-durable-* (devlocal durable: MariaDB, LocalStack, nginx, MCP)"
            echo "  - echobase-ci-durable-* (CI durable, only with --include-ci)"
            exit 0
            ;;
    esac
done

echo "=========================================="
echo "MASTER TEARDOWN - Removing All Infrastructure"
echo "=========================================="
echo ""
if [ "$REMOVE_VOLUMES" = true ]; then
    echo "⚠️  WARNING: --volumes flag set - ALL DATA WILL BE DELETED!"
    echo ""
fi

# Get script directory for calling other scripts
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Track what we've removed
REMOVED_ITEMS=()
SKIPPED_ITEMS=()

# Function to teardown an ephemeral environment
teardown_ephemeral() {
    local env_name=$1
    local env_upper
    env_upper=$(echo "$env_name" | tr '[:lower:]' '[:upper:]')
    local project_name="echobase-${env_name}"
    local compose_file="docker-compose.${env_name}.yml"

    echo "----------------------------------------"
    echo "Tearing down ${env_upper} ephemeral environment..."
    echo "----------------------------------------"

    # Check if any containers exist for this environment
    if docker ps -a --format '{{.Names}}' | grep -q "^${project_name}-"; then
        echo "  Found containers for $project_name"

        # Use docker compose if compose files exist, otherwise use docker directly
        if [ -f "$PROJECT_ROOT/docker-compose.yml" ] && [ -f "$PROJECT_ROOT/$compose_file" ]; then
            docker compose -f "$PROJECT_ROOT/docker-compose.yml" -f "$PROJECT_ROOT/$compose_file" \
                -p "$project_name" down --remove-orphans 2>/dev/null || true
        fi

        # Also clean up any orphaned containers with docker directly
        for container in $(docker ps -a --format '{{.Names}}' | grep "^${project_name}-"); do
            echo "  Removing container: $container"
            docker stop "$container" 2>/dev/null || true
            docker rm "$container" 2>/dev/null || true
        done

        REMOVED_ITEMS+=("$env_name ephemeral")
        echo "  ✓ ${env_upper} environment removed"
    else
        SKIPPED_ITEMS+=("$env_name ephemeral (not running)")
        echo "  Skipped: No $env_name containers found"
    fi
    echo ""
}

# Function to teardown durable infrastructure
teardown_durable() {
    local durable_env=$1
    local durable_upper
    durable_upper=$(echo "$durable_env" | tr '[:lower:]' '[:upper:]')
    local container_prefix="echobase-${durable_env}-durable"
    local network_name="${container_prefix}-network"
    local volume_prefix="${container_prefix}"

    echo "----------------------------------------"
    echo "Tearing down ${durable_upper} durable infrastructure..."
    echo "----------------------------------------"

    # Check if any durable containers exist
    if docker ps -a --format '{{.Names}}' | grep -q "^${container_prefix}-"; then
        echo "  Found durable containers for $durable_env"

        # Stop and remove durable containers
        for service in mariadb localstack nginx mcp-server; do
            container_name="${container_prefix}-${service}"
            if docker inspect "$container_name" >/dev/null 2>&1; then
                echo "  Removing: $container_name"
                docker stop "$container_name" 2>/dev/null || true
                docker rm "$container_name" 2>/dev/null || true
            fi
        done

        # Remove network
        if docker network inspect "$network_name" >/dev/null 2>&1; then
            docker network rm "$network_name" 2>/dev/null || true
            echo "  Removed network: $network_name"
        fi

        # Optionally remove volumes
        if [ "$REMOVE_VOLUMES" = true ]; then
            for volume in mariadb-data localstack-data; do
                volume_name="${volume_prefix}_${volume}"
                if docker volume inspect "$volume_name" >/dev/null 2>&1; then
                    docker volume rm "$volume_name" 2>/dev/null || true
                    echo "  Removed volume: $volume_name"
                fi
                # Also try alternate naming convention
                volume_name="${volume_prefix}-${volume}"
                if docker volume inspect "$volume_name" >/dev/null 2>&1; then
                    docker volume rm "$volume_name" 2>/dev/null || true
                    echo "  Removed volume: $volume_name"
                fi
            done
        fi

        REMOVED_ITEMS+=("$durable_env durable")
        echo "  ✓ ${durable_upper} durable infrastructure removed"
    else
        SKIPPED_ITEMS+=("$durable_env durable (not running)")
        echo "  Skipped: No $durable_env durable containers found"
    fi
    echo ""
}

# Function to clean up orphaned networks and volumes
cleanup_orphans() {
    echo "----------------------------------------"
    echo "Cleaning up orphaned resources..."
    echo "----------------------------------------"

    # Remove any echobase networks that might be orphaned
    for network in $(docker network ls --format '{{.Name}}' | grep "^echobase"); do
        # Check if network is in use
        if [ "$(docker network inspect "$network" --format '{{len .Containers}}')" = "0" ]; then
            echo "  Removing orphaned network: $network"
            docker network rm "$network" 2>/dev/null || true
        fi
    done

    # Remove dangling volumes if --volumes flag is set
    if [ "$REMOVE_VOLUMES" = true ]; then
        for volume in $(docker volume ls --format '{{.Name}}' | grep "^echobase"); do
            echo "  Removing volume: $volume"
            docker volume rm "$volume" 2>/dev/null || true
        done
    fi

    echo "  ✓ Orphan cleanup complete"
    echo ""
}

# Function to teardown devlocal ephemeral environment
# Devlocal uses the base docker-compose.yml with hardcoded container names (echobase-devlocal-*)
# and no explicit -p flag, so we tear it down using docker compose down + direct container removal
teardown_devlocal_ephemeral() {
    echo "----------------------------------------"
    echo "Tearing down DEVLOCAL ephemeral environment..."
    echo "----------------------------------------"

    local prefix="echobase-devlocal"

    # Check if any devlocal ephemeral containers exist (exclude durable containers)
    if docker ps -a --format '{{.Names}}' | grep "^${prefix}-" | grep -v "${prefix}-durable" | grep -q .; then
        echo "  Found devlocal ephemeral containers"

        # Use docker compose down from the project root (matches how start.sh brings them up)
        if [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
            docker compose -f "$PROJECT_ROOT/docker-compose.yml" down --remove-orphans 2>/dev/null || true
        fi

        # Also clean up any remaining containers directly
        for container in $(docker ps -a --format '{{.Names}}' | grep "^${prefix}-" | grep -v "${prefix}-durable"); do
            echo "  Removing container: $container"
            docker stop "$container" 2>/dev/null || true
            docker rm "$container" 2>/dev/null || true
        done

        REMOVED_ITEMS+=("devlocal ephemeral")
        echo "  ✓ DEVLOCAL ephemeral environment removed"
    else
        SKIPPED_ITEMS+=("devlocal ephemeral (not running)")
        echo "  Skipped: No devlocal ephemeral containers found"
    fi
    echo ""
}

# Execute teardowns
echo ""

# 1. Teardown ephemeral environments
teardown_ephemeral "blue"
teardown_ephemeral "green"
teardown_devlocal_ephemeral

# 2. Teardown devlocal durable infrastructure
teardown_durable "devlocal"

# 3. Optionally teardown CI durable infrastructure
if [ "$INCLUDE_CI" = true ]; then
    teardown_durable "ci"
fi

# 4. Clean up orphaned resources
cleanup_orphans

# Summary
echo "=========================================="
echo "TEARDOWN COMPLETE"
echo "=========================================="
echo ""
if [ ${#REMOVED_ITEMS[@]} -gt 0 ]; then
    echo "Removed:"
    for item in "${REMOVED_ITEMS[@]}"; do
        echo "  ✓ $item"
    done
fi
if [ ${#SKIPPED_ITEMS[@]} -gt 0 ]; then
    echo ""
    echo "Skipped (not found):"
    for item in "${SKIPPED_ITEMS[@]}"; do
        echo "  - $item"
    done
fi
echo ""

if [ "$REMOVE_VOLUMES" = true ]; then
    echo "Data volumes were REMOVED."
else
    echo "Data volumes were PRESERVED."
    echo "To also remove data, run: $0 --volumes"
fi

if [ "$INCLUDE_CI" = false ]; then
    echo ""
    echo "CI infrastructure was NOT touched."
    echo "To also remove CI infrastructure, run: $0 --include-ci"
fi

echo ""
