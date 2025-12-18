#!/bin/bash
# Save Docker images as tar files for artifact storage
# Usage: save-docker-images.sh [output-dir]

set -e

OUTPUT_DIR=${1:-docker-images}

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Components to save (MariaDB is built in durable infrastructure, not saved as artifact)
COMPONENTS=("api-gateway" "frontend" "order-processor")

echo "Saving Docker images to $OUTPUT_DIR..."
echo ""

for component in "${COMPONENTS[@]}"; do
  image_name="echobase-${component}:latest"
  output_file="${OUTPUT_DIR}/${component}.tar"

  echo "Saving ${image_name}..."
  docker save "$image_name" -o "$output_file"

  # Show file size
  size=$(ls -lh "$output_file" | awk '{print $5}')
  echo "  ✓ Saved to ${output_file} (${size})"
done

echo ""
echo "All images saved successfully!"
echo "Total size:"
ls -lh "$OUTPUT_DIR"
