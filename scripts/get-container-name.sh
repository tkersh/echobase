#!/bin/bash
# Get actual container name for a service
# Usage: get-container-name.sh <project-prefix> <service-name>
# Example: get-container-name.sh echobase-green api-gateway
# Returns: The actual container name (handles both Compose v1 and v2 naming)

set -e

PROJECT_PREFIX=${1:?Project prefix required}
SERVICE_NAME=${2:?Service name required}

# Find container name (handles both v1 and v2 naming conventions)
# Use grep to ensure BOTH prefix and service name match (docker filters are OR'd)
CONTAINER_NAME=$(docker ps \
  --filter "name=${PROJECT_PREFIX}" \
  --format "{{.Names}}" \
  | grep "${SERVICE_NAME}" \
  | head -1)

if [ -z "$CONTAINER_NAME" ]; then
  echo "ERROR: Container not found for project '$PROJECT_PREFIX', service '$SERVICE_NAME'" >&2
  echo "" >&2
  echo "Available containers matching '$PROJECT_PREFIX':" >&2
  docker ps --filter "name=${PROJECT_PREFIX}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" >&2
  echo "" >&2
  echo "All running containers:" >&2
  docker ps --format "table {{.Names}}\t{{.Status}}" >&2
  exit 1
fi

echo "$CONTAINER_NAME"
