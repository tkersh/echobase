#!/bin/bash

# Common shell functions and variables for e2e test scripts
# Source this file in other scripts: source "$(dirname "$0")/common.sh"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Retry function with exponential backoff
# Usage: retry <max_attempts> <command>
retry() {
    local max_attempts=$1
    shift
    local attempt=1
    local delay=1

    while [ $attempt -le $max_attempts ]; do
        if "$@"; then
            return 0
        fi

        if [ $attempt -lt $max_attempts ]; then
            print_warning "Attempt $attempt failed, retrying in ${delay}s..."
            sleep $delay
            delay=$((delay * 2))
        fi

        attempt=$((attempt + 1))
    done

    print_error "Command failed after $max_attempts attempts"
    return 1
}

# Wait for service to be ready
# Usage: wait_for_service <url> <max_attempts> <service_name>
wait_for_service() {
    local url=$1
    local max_attempts=$2
    local service_name=$3
    local attempt=1

    echo "Waiting for $service_name to be ready..."

    while [ $attempt -le $max_attempts ]; do
        if curl -ks "$url" > /dev/null 2>&1; then
            print_success "$service_name is ready"
            return 0
        fi

        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done

    echo ""
    print_error "$service_name failed to start within timeout"
    return 1
}
