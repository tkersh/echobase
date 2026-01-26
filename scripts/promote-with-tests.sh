#!/bin/bash
# Promote to production with automated smoke tests and rollback on failure
#
# Usage: ./promote-with-tests.sh <blue|green>
#
# This script orchestrates:
#   1. Records current production environment (for rollback)
#   2. Switches traffic to target environment
#   3. Runs smoke tests against production
#   4. On failure: automatically rolls back to previous environment
#
# Retry Policy: 2 retries with 5-second delay before rollback
#
# Exit codes:
#   0 - Promotion successful, all tests passed
#   1 - Promotion failed, rolled back to previous environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MAX_RETRIES=2
RETRY_DELAY=5  # seconds

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Validate arguments
if [ $# -ne 1 ]; then
    echo -e "${RED}ERROR: Usage: $0 <blue|green>${NC}" >&2
    exit 1
fi

TARGET_ENV=$1

if [ "$TARGET_ENV" != "blue" ] && [ "$TARGET_ENV" != "green" ]; then
    echo -e "${RED}ERROR: Environment must be 'blue' or 'green', got: $TARGET_ENV${NC}" >&2
    exit 1
fi

echo ""
echo "=========================================="
echo " Promote with Tests: $TARGET_ENV"
echo "=========================================="
echo ""

# Step 1: Record current production environment (for potential rollback)
echo -e "${BLUE}Step 1: Recording current production state...${NC}"

PREVIOUS_ENV=$("$SCRIPT_DIR/get-active-environment.sh" 2>/dev/null) || PREVIOUS_ENV="none"

if [ "$PREVIOUS_ENV" = "none" ]; then
    echo -e "${YELLOW}No previous production environment (bootstrap scenario)${NC}"
    echo -e "${YELLOW}Rollback will not be possible if tests fail${NC}"
    CAN_ROLLBACK=false
elif [ "$PREVIOUS_ENV" = "$TARGET_ENV" ]; then
    echo -e "${YELLOW}Target environment is already production${NC}"
    echo "Running smoke tests to verify..."
    CAN_ROLLBACK=false
else
    echo -e "${GREEN}Previous environment: $PREVIOUS_ENV${NC}"
    echo "Rollback target if tests fail: $PREVIOUS_ENV"
    CAN_ROLLBACK=true
fi

echo ""

# Step 2: Switch traffic to target environment
echo -e "${BLUE}Step 2: Switching traffic to $TARGET_ENV...${NC}"

# Debug: Show network connectivity before switch
echo ""
echo -e "${YELLOW}=== Pre-switch Debug ===${NC}"
echo "Containers on durable network:"
docker network inspect echobase-ci-durable-network --format '{{range .Containers}}  {{.Name}}{{println}}{{end}}' 2>/dev/null || echo "  (failed to inspect network)"
echo ""

if ! "$SCRIPT_DIR/switch-traffic.sh" "$TARGET_ENV"; then
    echo -e "${RED}ERROR: Traffic switch failed${NC}" >&2
    exit 1
fi

# Debug: Verify nginx can reach the target environment after switch
echo ""
echo -e "${YELLOW}=== Post-switch Verification ===${NC}"
NGINX_CONTAINER=$(docker ps --filter "label=echobase.service=nginx" --format "{{.Names}}" | head -1)
if [ -n "$NGINX_CONTAINER" ]; then
    echo "Testing nginx -> $TARGET_ENV connectivity:"
    echo -n "  Frontend (echobase-${TARGET_ENV}-frontend:443): "
    docker exec "$NGINX_CONTAINER" wget -q --spider --timeout=5 --no-check-certificate "https://echobase-${TARGET_ENV}-frontend:443/" 2>/dev/null && echo "OK" || echo "FAIL"
    echo -n "  API Gateway (echobase-${TARGET_ENV}-api-gateway:3001): "
    docker exec "$NGINX_CONTAINER" wget -q --spider --timeout=5 --no-check-certificate "https://echobase-${TARGET_ENV}-api-gateway:3001/health" 2>/dev/null && echo "OK" || echo "FAIL"
    echo ""
    echo "Testing localhost:1443 from runner host:"
    echo -n "  curl -sk https://localhost:1443/: "
    curl -sk --connect-timeout 5 "https://localhost:1443/" >/dev/null 2>&1 && echo "OK" || echo "FAIL"
    echo -n "  curl -sk https://localhost:1443/health: "
    HTTP_CODE=$(curl -sk --connect-timeout 5 -o /dev/null -w "%{http_code}" "https://localhost:1443/health" 2>/dev/null || echo "000")
    echo "HTTP $HTTP_CODE"
fi
echo -e "${YELLOW}=== End Verification ===${NC}"

echo ""

# Step 3: Run smoke tests with retry logic
echo -e "${BLUE}Step 3: Running smoke tests...${NC}"

run_smoke_tests() {
    "$SCRIPT_DIR/smoke-tests.sh"
}

ATTEMPT=1
TESTS_PASSED=false

while [ $ATTEMPT -le $((MAX_RETRIES + 1)) ]; do
    if [ $ATTEMPT -gt 1 ]; then
        echo ""
        echo -e "${YELLOW}Retry attempt $((ATTEMPT - 1)) of $MAX_RETRIES (waiting ${RETRY_DELAY}s)...${NC}"
        sleep "$RETRY_DELAY"
    fi

    echo ""
    echo "--- Smoke Test Attempt $ATTEMPT ---"

    if run_smoke_tests; then
        TESTS_PASSED=true
        break
    fi

    ATTEMPT=$((ATTEMPT + 1))
done

echo ""

# Step 4: Handle test results
if [ "$TESTS_PASSED" = "true" ]; then
    echo "=========================================="
    echo -e "${GREEN}✓ PROMOTION SUCCESSFUL${NC}"
    echo "=========================================="
    echo ""
    echo "Production environment: $TARGET_ENV"
    echo "All smoke tests passed after attempt $((ATTEMPT))"
    echo ""
    exit 0
else
    echo "=========================================="
    echo -e "${RED}✗ SMOKE TESTS FAILED${NC}"
    echo "=========================================="
    echo ""
    echo "Tests failed after $MAX_RETRIES retries"

    # Step 5: Rollback if possible
    if [ "$CAN_ROLLBACK" = "true" ]; then
        echo ""
        echo -e "${YELLOW}Initiating automatic rollback to $PREVIOUS_ENV...${NC}"
        echo ""

        if "$SCRIPT_DIR/switch-traffic.sh" "$PREVIOUS_ENV"; then
            echo ""
            echo -e "${GREEN}✓ Rollback successful${NC}"
            echo "Production restored to: $PREVIOUS_ENV"
        else
            echo ""
            echo -e "${RED}✗ ROLLBACK FAILED${NC}" >&2
            echo -e "${RED}Manual intervention required!${NC}" >&2
            echo "Attempted to restore: $PREVIOUS_ENV"
        fi
    else
        echo ""
        echo -e "${YELLOW}Cannot rollback: no previous environment available${NC}"
        echo "Manual intervention may be required"
    fi

    echo ""
    exit 1
fi
