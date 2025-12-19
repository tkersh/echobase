#!/bin/bash
# Load Docker images from artifacts
# Usage: ./load-docker-images.sh [base] [app]
#
# Options:
#   base - Load base image only
#   app  - Load application images only
#   (no args) - Load all images

set -e

ARTIFACTS_DIR=${ARTIFACTS_DIR:-docker-images}

load_base() {
    echo "Loading base image..."

    # Verify artifact exists and show size
    if [ ! -f "${ARTIFACTS_DIR}/base.tar" ]; then
        echo "ERROR: ${ARTIFACTS_DIR}/base.tar not found!"
        exit 1
    fi

    echo "Base image artifact size:"
    ls -lh "${ARTIFACTS_DIR}/base.tar"

    # Load with timeout (always load to ensure fresh image, not corrupted)
    echo "Loading base image from artifact..."
    timeout 300 docker load -i "${ARTIFACTS_DIR}/base.tar" || {
        echo "ERROR: docker load timed out or failed after 5 minutes"
        echo "Checking Docker daemon status..."
        docker info || true
        exit 1
    }

    echo "✓ Base image loaded successfully"
}

load_app() {
    echo "Loading application images..."
    # Note: MariaDB is built in durable infrastructure, not loaded from artifacts
    for image in api-gateway frontend order-processor; do
        if [ -f "${ARTIFACTS_DIR}/${image}.tar" ]; then
            echo "Loading echobase-${image}:latest..."
            echo "  Size: $(ls -lh "${ARTIFACTS_DIR}/${image}.tar" | awk '{print $5}')"
            timeout 300 docker load -i "${ARTIFACTS_DIR}/${image}.tar" || {
                echo "ERROR: Failed to load ${image} image (timeout after 5 minutes)"
                exit 1
            }
        else
            echo "WARNING: ${ARTIFACTS_DIR}/${image}.tar not found, skipping..."
        fi
    done
}

case "${1:-all}" in
    base)
        load_base
        ;;
    app)
        load_app
        ;;
    all|*)
        load_base
        load_app
        ;;
esac

echo "✓ Docker images loaded successfully"
