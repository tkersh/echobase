#!/bin/bash
# Wait for HTTP endpoint to become accessible
# Usage: ./wait-for-endpoint.sh <url> <timeout> <service-name>
#
# Example:
#   ./wait-for-endpoint.sh http://localhost:4666/_localstack/health 150 "LocalStack"

set -e

URL=$1
TIMEOUT=${2:-120}
SERVICE_NAME=${3:-"endpoint"}
HEALTH_CHECK_INTERVAL=${HEALTH_CHECK_INTERVAL:-3}

if [ -z "$URL" ]; then
    echo "ERROR: URL is required"
    echo "Usage: $0 <url> [timeout] [service-name]"
    exit 1
fi

# Function to get the Docker host IP when running inside a container
get_docker_host_ip() {
    # Check if we're running inside a container
    if [ -f /.dockerenv ] || grep -q docker /proc/1/cgroup 2>/dev/null; then
        # Try host.docker.internal first (works on Docker Desktop)
        if getent hosts host.docker.internal >/dev/null 2>&1; then
            echo "host.docker.internal"
            return
        fi
        # Try to get the gateway IP
        GATEWAY_IP=$(ip route | awk '/default/ {print $3}' | head -1)
        if [ -n "$GATEWAY_IP" ]; then
            echo "$GATEWAY_IP"
            return
        fi
    fi
    echo "localhost"
}

# Replace localhost with Docker host IP if needed
if echo "$URL" | grep -q "localhost"; then
    DOCKER_HOST_IP=$(get_docker_host_ip)
    if [ "$DOCKER_HOST_IP" != "localhost" ]; then
        ORIGINAL_URL="$URL"
        URL=$(echo "$URL" | sed "s/localhost/$DOCKER_HOST_IP/")
        echo "Running inside container, using Docker host IP: $DOCKER_HOST_IP"
        echo "Modified URL: $ORIGINAL_URL -> $URL"
    fi
fi

ITERATIONS=$((TIMEOUT / HEALTH_CHECK_INTERVAL))

echo "Waiting for ${SERVICE_NAME} to be accessible at ${URL} (timeout: ${TIMEOUT}s)..."

# First attempt - show the actual error for debugging
FIRST_TRY=true

for i in $(seq 1 $ITERATIONS); do
    # Show verbose output on first attempt for diagnostics
    if [ "$FIRST_TRY" = true ]; then
        echo "Testing connectivity (first attempt, showing errors)..."
        if curl -f -v "$URL" 2>&1 | head -20; then
            echo "✓ ${SERVICE_NAME} is accessible! (took ${HEALTH_CHECK_INTERVAL}s)"
            exit 0
        else
            echo "Initial connection test failed (will retry silently)..."
            FIRST_TRY=false
        fi
    fi

    # Subsequent attempts - silent
    if curl -f -s "$URL" > /dev/null 2>&1; then
        elapsed=$((i * HEALTH_CHECK_INTERVAL))
        echo "✓ ${SERVICE_NAME} is accessible! (took ${elapsed}s)"
        exit 0
    fi

    echo "Waiting for ${SERVICE_NAME}... ($i/$ITERATIONS)"

    if [ $i -eq $ITERATIONS ]; then
        echo ""
        echo "========================================="
        echo "ERROR: ${SERVICE_NAME} not accessible after ${TIMEOUT}s"
        echo "========================================="
        echo "URL: ${URL}"
        echo ""
        echo "=== Diagnostic Information ==="
        echo "Testing with verbose curl output:"
        curl -f -v "$URL" 2>&1 | head -30 || true
        echo ""
        echo "Network connectivity test:"
        echo "Hostname resolution:"
        HOST=$(echo "$URL" | sed 's|http[s]*://||' | cut -d: -f1 | cut -d/ -f1)
        nslookup "$HOST" 2>&1 || getent hosts "$HOST" 2>&1 || echo "Could not resolve $HOST"
        echo ""
        echo "Port mappings on host:"
        docker ps --format "table {{.Names}}\t{{.Ports}}" | grep -i localstack || echo "No LocalStack containers found"
        exit 1
    fi

    sleep ${HEALTH_CHECK_INTERVAL}
done
