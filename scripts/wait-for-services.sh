#!/bin/bash
# Wait for Docker Compose services to become healthy
# Usage: ./wait-for-services.sh <project-name> <service1> <service2> ...
#
# Environment variables:
#   HEALTH_CHECK_INTERVAL - Seconds between checks (default: 3)
#   <SERVICE>_TIMEOUT - Timeout in seconds for specific service (default: 120)
#
# Example:
#   MARIADB_TIMEOUT=180 ./wait-for-services.sh echobase-green mariadb localstack api-gateway

set -e

# Configuration
PROJECT_NAME=$1
HEALTH_CHECK_INTERVAL=${HEALTH_CHECK_INTERVAL:-3}
DEFAULT_TIMEOUT=120

if [ -z "$PROJECT_NAME" ]; then
    echo "ERROR: Project name is required"
    echo "Usage: $0 <project-name> <service1> <service2> ..."
    exit 1
fi

if [ $# -lt 2 ]; then
    echo "ERROR: At least one service name is required"
    echo "Usage: $0 <project-name> <service1> <service2> ..."
    exit 1
fi

shift  # Remove project name from arguments

# Function to get timeout for a specific service
get_timeout() {
    local service=$1
    local service_upper
    service_upper=$(echo "$service" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
    local timeout_var="${service_upper}_TIMEOUT"
    local timeout=${!timeout_var:-$DEFAULT_TIMEOUT}
    echo "$timeout"
}

# Function to wait for a service to be healthy
wait_for_service() {
    local service=$1
    local timeout
    timeout=$(get_timeout "$service")
    local max_iterations=$((timeout / HEALTH_CHECK_INTERVAL))
    local iteration=0

    echo "Waiting for $service to be healthy (timeout: ${timeout}s)..."

    while [ $iteration -lt $max_iterations ]; do
        iteration=$((iteration + 1))
        elapsed=$((iteration * HEALTH_CHECK_INTERVAL))

        # Check if service is healthy
        if docker compose -p "$PROJECT_NAME" ps "$service" 2>/dev/null | grep -q "healthy"; then
            echo "✓ $service is healthy! (took ${elapsed}s)"
            return 0
        fi

        # Check if service exists but isn't healthy yet
        if docker compose -p "$PROJECT_NAME" ps "$service" 2>/dev/null | grep -q "$service"; then
            echo "Waiting for $service... ($iteration/$max_iterations, ${elapsed}s elapsed)"
        else
            echo "WARNING: $service container not found, waiting... ($iteration/$max_iterations)"
        fi

        sleep "$HEALTH_CHECK_INTERVAL"
    done

    # Timeout reached - collect diagnostics
    echo ""
    echo "========================================="
    echo "ERROR: $service failed to become healthy after ${timeout}s"
    echo "========================================="
    echo ""
    echo "=== Container Status ==="
    docker compose -p "$PROJECT_NAME" ps "$service" || true
    echo ""
    echo "=== Container Logs (last 100 lines) ==="
    docker compose -p "$PROJECT_NAME" logs --tail=100 "$service" || true
    echo ""
    echo "=== All Containers in Project ==="
    docker compose -p "$PROJECT_NAME" ps || true
    echo ""

    return 1
}

# Function to check service health via endpoint
check_endpoint() {
    local service=$1
    local url=$2
    local timeout
    timeout=$(get_timeout "$service")
    local max_iterations=$((timeout / HEALTH_CHECK_INTERVAL))
    local iteration=0

    echo "Waiting for $service endpoint to be ready: $url (timeout: ${timeout}s)..."

    while [ $iteration -lt $max_iterations ]; do
        iteration=$((iteration + 1))
        elapsed=$((iteration * HEALTH_CHECK_INTERVAL))

        if docker compose -p "$PROJECT_NAME" exec -T "$service" curl -f -s "$url" > /dev/null 2>&1; then
            echo "✓ $service endpoint is ready! (took ${elapsed}s)"
            return 0
        fi

        echo "Waiting for $service endpoint... ($iteration/$max_iterations, ${elapsed}s elapsed)"
        sleep "$HEALTH_CHECK_INTERVAL"
    done

    echo "ERROR: $service endpoint not ready after ${timeout}s"
    docker compose -p "$PROJECT_NAME" logs --tail=50 "$service" || true
    return 1
}

# Main logic - wait for each service sequentially
echo "========================================="
echo "Waiting for services in project: $PROJECT_NAME"
echo "Health check interval: ${HEALTH_CHECK_INTERVAL}s"
echo "Services: $*"
echo "========================================="
echo ""

EXIT_CODE=0

for service in "$@"; do
    if ! wait_for_service "$service"; then
        EXIT_CODE=1
        echo "FAILED: $service did not become healthy"
        break
    fi
    echo ""
done

if [ $EXIT_CODE -eq 0 ]; then
    echo "========================================="
    echo "✓ All services are healthy!"
    echo "========================================="
else
    echo "========================================="
    echo "✗ Service health check failed"
    echo "========================================="
fi

exit $EXIT_CODE
