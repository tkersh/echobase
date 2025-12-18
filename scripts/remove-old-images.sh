#!/bin/bash
# Remove Docker images to ensure fresh deployment
# Usage: remove-old-images.sh

set -e

# Components to remove
COMPONENTS=("mariadb" "api-gateway" "frontend" "order-processor")

echo "Removing old Docker images..."
echo ""

for component in "${COMPONENTS[@]}"; do
  image_name="echobase-${component}:latest"

  echo "Removing ${image_name}..."
  if docker rmi "$image_name" 2>/dev/null; then
    echo "  ✓ Removed"
  else
    echo "  ℹ Image not found or already removed"
  fi
done

echo ""
echo "Image removal complete!"
