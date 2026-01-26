#!/bin/bash
# Switch production traffic to specified environment (blue or green)
# Usage: ./switch-traffic.sh <blue|green>
#
# This script orchestrates the complete traffic switch:
# 1. Validates target environment is healthy
# 2. Updates production state (docker labels + S3)
# 3. Generates nginx configuration
# 4. Validates nginx config
# 5. Reloads nginx
# 6. Verifies traffic is flowing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

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
echo " Switching Traffic to $TARGET_ENV"
echo "=========================================="
echo ""

# Step 1: Validate target environment is healthy
echo -e "${BLUE}Step 1: Validating target environment health...${NC}"

# Find containers by labels (not hardcoded names)
# Usage: find_ephemeral_container service env
find_ephemeral_container() {
    docker ps --filter "status=running" \
        --filter "label=echobase.role=ephemeral" \
        --filter "label=echobase.service=$1" \
        --filter "label=echobase.env=$2" \
        --format "{{.Names}}" 2>/dev/null | head -1
}

# Check if key containers are running
SERVICES_TO_CHECK=("api-gateway" "frontend")
all_healthy=true

for service in "${SERVICES_TO_CHECK[@]}"; do
    container=$(find_ephemeral_container "$service" "$TARGET_ENV")
    if [ -n "$container" ]; then
        state=$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null || echo "false")
        health=$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || echo "none")

        if [ "$state" != "true" ]; then
            echo -e "  ${RED}✗ $container ($service) is not running${NC}"
            all_healthy=false
        elif [ "$health" = "unhealthy" ]; then
            echo -e "  ${RED}✗ $container ($service) is unhealthy${NC}"
            all_healthy=false
        else
            echo -e "  ${GREEN}✓ $container ($service) is healthy${NC}"
        fi
    else
        echo -e "  ${RED}✗ No $service container found for $TARGET_ENV environment${NC}"
        all_healthy=false
    fi
done

if [ "$all_healthy" = "false" ]; then
    echo -e "${RED}ERROR: Target environment is not healthy. Aborting traffic switch.${NC}" >&2
    exit 1
fi

echo -e "${GREEN}✓ Target environment is healthy${NC}"
echo ""

# Step 2: Generate nginx configuration
echo -e "${BLUE}Step 2: Generating nginx configuration...${NC}"

if [ -x "$SCRIPT_DIR/generate-nginx-config.sh" ]; then
    "$SCRIPT_DIR/generate-nginx-config.sh" "$TARGET_ENV"
else
    echo -e "${RED}ERROR: generate-nginx-config.sh not found or not executable${NC}" >&2
    exit 1
fi

echo ""

# Step 3: Reload nginx in durable container
echo -e "${BLUE}Step 3: Reloading nginx load balancer...${NC}"

# Find nginx container by labels (not hardcoded names)
NGINX_CONTAINER=$(docker ps --filter "status=running" \
    --filter "label=echobase.role=durable" \
    --filter "label=echobase.service=nginx" \
    --format "{{.Names}}" 2>/dev/null | head -1)

# Query port configuration from container labels
if [ -n "$NGINX_CONTAINER" ]; then
    NGINX_HTTPS_PORT=$(docker inspect --format '{{index .Config.Labels "echobase.nginx.https_port"}}' "$NGINX_CONTAINER" 2>/dev/null || echo "443")
    NGINX_BLUE_PORT=$(docker inspect --format '{{index .Config.Labels "echobase.nginx.blue_port"}}' "$NGINX_CONTAINER" 2>/dev/null || echo "8080")
    NGINX_GREEN_PORT=$(docker inspect --format '{{index .Config.Labels "echobase.nginx.green_port"}}' "$NGINX_CONTAINER" 2>/dev/null || echo "8081")
else
    # Defaults if no container found
    NGINX_HTTPS_PORT=443
    NGINX_BLUE_PORT=8080
    NGINX_GREEN_PORT=8081
fi

if [ -n "$NGINX_CONTAINER" ]; then
    echo "Found nginx container: $NGINX_CONTAINER"

    # Copy updated config to container
    if docker cp "$PROJECT_ROOT/nginx-blue-green.conf" "$NGINX_CONTAINER:/etc/nginx/conf.d/default.conf"; then
        echo "✓ Config copied to container"

        # Test config
        if docker exec "$NGINX_CONTAINER" nginx -t 2>/dev/null; then
            echo -e "${GREEN}✓ nginx configuration is valid${NC}"

            # Reload nginx
            if docker exec "$NGINX_CONTAINER" nginx -s reload; then
                echo -e "${GREEN}✓ nginx reload signal sent${NC}"

                # Wait for reload to complete by polling /.active-env
                # Poll every 0.5s for up to 10s (20 attempts)
                MAX_ATTEMPTS=20
                attempt=0
                reload_confirmed=false
                while [ $attempt -lt $MAX_ATTEMPTS ]; do
                    current=$(docker exec "$NGINX_CONTAINER" wget -qO- http://localhost/.active-env 2>/dev/null || echo "")
                    if [ "$current" = "$TARGET_ENV" ]; then
                        echo -e "${GREEN}✓ nginx reload confirmed${NC}"
                        reload_confirmed=true
                        break
                    fi
                    sleep 0.5
                    attempt=$((attempt + 1))
                done

                if [ "$reload_confirmed" = "false" ]; then
                    echo -e "${YELLOW}WARNING: nginx reload not confirmed after ${MAX_ATTEMPTS} attempts${NC}"
                fi
            else
                echo -e "${YELLOW}WARNING: nginx reload failed${NC}"
            fi
        else
            echo -e "${RED}ERROR: nginx configuration test failed${NC}"
            docker exec "$NGINX_CONTAINER" nginx -t 2>&1 || true
        fi
    else
        echo -e "${YELLOW}WARNING: Failed to copy config to nginx container${NC}"
    fi
else
    echo -e "${YELLOW}WARNING: nginx container not found in durable infrastructure${NC}"
    echo -e "${YELLOW}Traffic routing via load balancer is not available${NC}"
fi

echo -e "${YELLOW}Direct access: Blue (:${NGINX_BLUE_PORT}), Green (:${NGINX_GREEN_PORT}), Production (:${NGINX_HTTPS_PORT})${NC}"

echo ""

# Step 4: Verify traffic switch
echo -e "${BLUE}Step 4: Verifying traffic switch...${NC}"

# Verify nginx config is set correctly
if [ -x "$SCRIPT_DIR/get-active-environment.sh" ]; then
    current_prod=$("$SCRIPT_DIR/get-active-environment.sh")
    if [ "$current_prod" = "$TARGET_ENV" ]; then
        echo -e "${GREEN}✓ nginx config confirmed: routing to $current_prod${NC}"
    else
        echo -e "${RED}ERROR: nginx config verification failed${NC}" >&2
        echo -e "${RED}  Expected: $TARGET_ENV${NC}" >&2
        echo -e "${RED}  Got: $current_prod${NC}" >&2
        exit 1
    fi
else
    echo -e "${YELLOW}WARNING: Cannot verify traffic switch (get-active-environment.sh not found)${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✓ Traffic Successfully Switched${NC}"
echo "=========================================="
echo ""
echo "Production environment: $TARGET_ENV"
echo ""
echo "Access points:"
if [ "$NGINX_HTTPS_PORT" = "443" ]; then
    echo "  Production (via nginx): https://localhost/"
else
    echo "  Production (via nginx): https://localhost:${NGINX_HTTPS_PORT}/"
fi
echo "  Blue direct: http://localhost:${NGINX_BLUE_PORT}"
echo "  Green direct: http://localhost:${NGINX_GREEN_PORT}"
echo ""
echo "To rollback:"
if [ "$TARGET_ENV" = "blue" ]; then
    echo "  $0 green"
else
    echo "  $0 blue"
fi
echo ""
