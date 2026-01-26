#!/bin/bash
# Detect which environment (blue or green) should receive the next deployment
# SINGLE SOURCE OF TRUTH: Queries nginx load balancer config
# Outputs: "blue" or "green" to stdout
#
# Logic:
# 1. Query nginx to see which environment is active (production)
# 2. Deploy to the OTHER environment
# 3. If nginx is not available, FAIL (nginx is required - no fallback)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Main detection logic
detect_target() {
    echo -e "${BLUE}Detecting target environment for deployment...${NC}" >&2
    echo "" >&2

    # Query nginx for active environment (REQUIRED - no fallback)
    echo "  Step 1: Checking nginx load balancer..." >&2

    if [ ! -x "$SCRIPT_DIR/get-active-environment.sh" ]; then
        echo "" >&2
        echo -e "  ${RED}ERROR: get-active-environment.sh not found or not executable${NC}" >&2
        echo "  Path checked: $SCRIPT_DIR/get-active-environment.sh" >&2
        echo "" >&2
        echo "  nginx is REQUIRED for blue/green deployments." >&2
        echo "  Ensure durable infrastructure is running: ./durable/setup.sh ci" >&2
        exit 1
    fi

    # Pre-flight check: verify Docker is accessible
    echo "  Pre-flight: Checking Docker access..." >&2
    if ! docker_version=$(docker --version 2>&1); then
        echo -e "  ${RED}ERROR: Docker CLI not working${NC}" >&2
        echo "  Output: $docker_version" >&2
        exit 1
    fi
    echo "  Docker CLI: OK ($docker_version)" >&2

    if ! docker_ps=$(docker ps --format "{{.Names}}" 2>&1 | head -5); then
        echo -e "  ${RED}ERROR: Cannot list Docker containers${NC}" >&2
        echo "  Output: $docker_ps" >&2
        exit 1
    fi
    echo "  Docker ps: OK (can list containers)" >&2
    echo "" >&2

    # Run get-active-environment.sh
    # - stdout contains the result: "blue", "green", or "none"
    # - stderr contains debug info (passed through to our stderr)
    local active_env
    local stderr_file
    stderr_file=$(mktemp)

    if ! active_env=$("$SCRIPT_DIR/get-active-environment.sh" 2>"$stderr_file"); then
        echo "" >&2
        echo -e "  ${RED}ERROR: Failed to query nginx${NC}" >&2
        echo "" >&2
        echo "  Debug output from get-active-environment.sh:" >&2
        cat "$stderr_file" | sed 's/^/    /' >&2
        rm -f "$stderr_file"
        echo "" >&2
        echo "  nginx is REQUIRED for blue/green deployments." >&2
        echo "  Possible causes:" >&2
        echo "    1. Docker socket not accessible" >&2
        echo "    2. nginx container not running" >&2
        echo "    3. Durable infrastructure not set up" >&2
        echo "" >&2
        exit 1
    fi

    # Show debug output even on success (helps with troubleshooting)
    if [ -s "$stderr_file" ]; then
        cat "$stderr_file" >&2
    fi
    rm -f "$stderr_file"

    echo "  nginx reports active environment: $active_env" >&2

    if [ "$active_env" = "blue" ]; then
        echo -e "  ✓ Blue is active (production) → deploying to ${YELLOW}GREEN${NC}" >&2
        echo "" >&2
        echo -e "${GREEN}✓ Target environment: green${NC}" >&2
        echo "green"
        return 0
    elif [ "$active_env" = "green" ]; then
        echo -e "  ✓ Green is active (production) → deploying to ${BLUE}BLUE${NC}" >&2
        echo "" >&2
        echo -e "${GREEN}✓ Target environment: blue${NC}" >&2
        echo "blue"
        return 0
    elif [ "$active_env" = "none" ]; then
        # No active environment - this is bootstrap scenario
        # Default to green for first deployment
        echo -e "  ${YELLOW}No active environment in nginx (bootstrap scenario)${NC}" >&2
        echo -e "  Defaulting to ${YELLOW}GREEN${NC} for initial deployment" >&2
        echo "" >&2
        echo -e "${GREEN}✓ Target environment: green${NC}" >&2
        echo "green"
        return 0
    else
        echo "" >&2
        echo -e "  ${RED}ERROR: nginx returned unexpected value: '$active_env'${NC}" >&2
        echo "  Expected: 'blue', 'green', or 'none'" >&2
        echo "" >&2
        echo "  This may indicate a problem with nginx configuration." >&2
        echo "  Check: docker exec <nginx-container> cat /etc/nginx/conf.d/default.conf" >&2
        exit 1
    fi
}

# Run detection and output to stdout
detect_target
