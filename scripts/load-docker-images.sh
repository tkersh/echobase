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
    docker load -i ${ARTIFACTS_DIR}/base.tar
}

load_app() {
    echo "Loading application images..."
    # Note: MariaDB is built in durable infrastructure, not loaded from artifacts
    for image in api-gateway frontend order-processor; do
        if [ -f "${ARTIFACTS_DIR}/${image}.tar" ]; then
            echo "Loading echobase-${image}:latest..."
            docker load -i "${ARTIFACTS_DIR}/${image}.tar"
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
