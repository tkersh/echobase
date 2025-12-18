#!/bin/bash
# Verify build metadata in Docker images or running containers
# Usage: verify-build-metadata.sh <mode> [container-prefix]
# Modes:
#   images - Check metadata in images (docker run --rm)
#   containers - Check metadata in running containers (docker exec)

set -e

MODE=${1:-images}
CONTAINER_PREFIX=${2:-echobase-green}

# Metadata file paths
API_METADATA="/app/build-metadata.json"
FRONTEND_METADATA="/usr/share/nginx/html/build-metadata.json"
ORDER_PROCESSOR_METADATA="/app/build-metadata.json"

echo "=== Verifying Build Metadata (mode: $MODE) ==="
echo ""

verify_image() {
  local component=$1
  local metadata_path=$2
  local image_name="echobase-${component}:latest"

  echo "Checking ${component} image:"
  if docker run --rm "$image_name" cat "$metadata_path" 2>/dev/null; then
    echo "  ✓ Build metadata found"
  else
    echo "  ✗ Build metadata not found!"
    return 1
  fi
  echo ""
}

verify_container() {
  local component=$1
  local metadata_path=$2

  # Get script directory to find get-container-name.sh
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  # Find actual container name using get-container-name.sh
  local container_name
  container_name=$("$script_dir/get-container-name.sh" "$CONTAINER_PREFIX" "$component" 2>&1)
  if [ $? -eq 0 ]; then
    echo "Checking ${component} (container: ${container_name}):"
  else
    echo "Checking ${component}:"
    echo "  ✗ Container not found!"
    echo ""
    return 1
  fi

  if docker exec "$container_name" cat "$metadata_path" 2>/dev/null; then
    echo "  ✓ Build metadata found"
  else
    echo "  ✗ Build metadata not found!"
    return 1
  fi
  echo ""
}

EXIT_CODE=0

if [ "$MODE" = "images" ]; then
  verify_image "api-gateway" "$API_METADATA" || EXIT_CODE=1
  verify_image "frontend" "$FRONTEND_METADATA" || EXIT_CODE=1
  verify_image "order-processor" "$ORDER_PROCESSOR_METADATA" || EXIT_CODE=1
elif [ "$MODE" = "containers" ]; then
  verify_container "api-gateway" "$API_METADATA" || EXIT_CODE=1
  verify_container "frontend" "$FRONTEND_METADATA" || EXIT_CODE=1
  verify_container "order-processor" "$ORDER_PROCESSOR_METADATA" || EXIT_CODE=1
else
  echo "ERROR: Invalid mode '$MODE'. Use 'images' or 'containers'"
  exit 1
fi

if [ $EXIT_CODE -eq 0 ]; then
  echo "✓ All components have build metadata"
else
  echo "✗ Some components missing build metadata"
fi

exit $EXIT_CODE
