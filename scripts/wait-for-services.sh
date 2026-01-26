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

# Function to get container name for a service
# Uses docker ps directly to work without compose file context
get_container_name() {
    local service=$1
    docker ps \
        --filter "name=${PROJECT_NAME}" \
        --format "{{.Names}}" \
        | grep -E "(^|-)${service}(-[0-9]+)?$" \
        | head -1
}

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

        # Get container name using direct docker commands (works without compose files)
        local container_name
        container_name=$(get_container_name "$service")

        if [ -n "$container_name" ]; then
            # Container exists - check health status
            local health_status
            health_status=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$container_name" 2>/dev/null || echo "unknown")

            if [ "$health_status" = "healthy" ]; then
                echo "✓ $service is healthy! (took ${elapsed}s)"
                return 0
            elif [ "$health_status" = "no-healthcheck" ]; then
                # Container has no healthcheck, consider it healthy if running
                local running_status
                running_status=$(docker inspect --format='{{.State.Running}}' "$container_name" 2>/dev/null || echo "false")
                if [ "$running_status" = "true" ]; then
                    echo "✓ $service is running (no healthcheck defined)! (took ${elapsed}s)"
                    return 0
                fi
            fi
            echo "Waiting for $service ($container_name)... status=$health_status ($iteration/$max_iterations, ${elapsed}s elapsed)"
        else
            echo "WARNING: $service container not found, waiting... ($iteration/$max_iterations)"
        fi

        sleep "$HEALTH_CHECK_INTERVAL"
    done

    # Timeout reached - collect diagnostics
    local container_name
    container_name=$(get_container_name "$service")

    echo ""
    echo "========================================="
    echo "ERROR: $service failed to become healthy after ${timeout}s"
    echo "========================================="
    echo ""
    echo "=== Container Status ==="
    if [ -n "$container_name" ]; then
        docker inspect --format='Name: {{.Name}}  Status: {{.State.Status}}  Health: {{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$container_name" || true
    else
        echo "Container not found"
    fi
    echo ""
    echo "=== Container Logs (last 100 lines) ==="
    if [ -n "$container_name" ]; then
        docker logs --tail=100 "$container_name" 2>&1 || true
    else
        echo "Container not found"
    fi
    echo ""
    echo "=== All Containers in Project ==="
    docker ps --filter "name=${PROJECT_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || true
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

    local container_name
    container_name=$(get_container_name "$service")

    while [ $iteration -lt $max_iterations ]; do
        iteration=$((iteration + 1))
        elapsed=$((iteration * HEALTH_CHECK_INTERVAL))

        if [ -n "$container_name" ]; then
            if docker exec "$container_name" curl -f -s "$url" > /dev/null 2>&1; then
                echo "✓ $service endpoint is ready! (took ${elapsed}s)"
                return 0
            fi
        fi

        echo "Waiting for $service endpoint... ($iteration/$max_iterations, ${elapsed}s elapsed)"
        sleep "$HEALTH_CHECK_INTERVAL"
    done

    echo "ERROR: $service endpoint not ready after ${timeout}s"
    if [ -n "$container_name" ]; then
        docker logs --tail=50 "$container_name" 2>&1 || true
    fi
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
