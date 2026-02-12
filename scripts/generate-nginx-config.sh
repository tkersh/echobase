#!/bin/bash
# Generate nginx configuration from template based on active environment
# Usage: ./generate-nginx-config.sh [blue|green]
#   If no argument provided, reads from get-active-environment.sh (queries nginx)

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

TEMPLATE_FILE="$PROJECT_ROOT/nginx-blue-green.conf.template"
OUTPUT_FILE="$PROJECT_ROOT/nginx-blue-green.conf"

# Determine active environment
if [ $# -eq 1 ]; then
    ACTIVE_ENV=$1
else
    # Get from nginx config (single source of truth)
    if [ -x "$SCRIPT_DIR/get-active-environment.sh" ]; then
        ACTIVE_ENV=$("$SCRIPT_DIR/get-active-environment.sh")
    else
        echo -e "${RED}ERROR: Cannot determine active environment${NC}" >&2
        exit 1
    fi
fi

# Validate environment
if [ "$ACTIVE_ENV" != "blue" ] && [ "$ACTIVE_ENV" != "green" ]; then
    echo -e "${RED}ERROR: Active environment must be 'blue' or 'green', got: $ACTIVE_ENV${NC}" >&2
    exit 1
fi

# Determine upstreams based on active environment
if [ "$ACTIVE_ENV" = "blue" ]; then
    ACTIVE_BACKEND="backend_blue"
    ACTIVE_FRONTEND="frontend_blue"
else
    ACTIVE_BACKEND="backend_green"
    ACTIVE_FRONTEND="frontend_green"
fi

echo -e "${BLUE}Generating nginx configuration...${NC}"
echo "  Template: $TEMPLATE_FILE"
echo "  Output: $OUTPUT_FILE"
echo "  Active environment: $ACTIVE_ENV"
echo "  Active backend: $ACTIVE_BACKEND"
echo "  Active frontend: $ACTIVE_FRONTEND"
echo ""

# Check if template exists
if [ ! -f "$TEMPLATE_FILE" ]; then
    echo -e "${RED}ERROR: Template file not found: $TEMPLATE_FILE${NC}" >&2
    exit 1
fi

# Generate config by replacing template variables
sed -e "s/{{ACTIVE_ENV}}/$ACTIVE_ENV/g" \
    -e "s/{{ACTIVE_BACKEND}}/$ACTIVE_BACKEND/g" \
    -e "s/{{ACTIVE_FRONTEND}}/$ACTIVE_FRONTEND/g" \
    "$TEMPLATE_FILE" > "$OUTPUT_FILE"

echo -e "${GREEN}✓ nginx configuration generated${NC}"

# Validate generated config syntax if nginx is available (e.g., inside the nginx container)
# This catches sed substitution errors before traffic switch
if command -v nginx &>/dev/null; then
  echo "Validating nginx configuration syntax..."
  if nginx -t -c "$OUTPUT_FILE" 2>/dev/null; then
    echo -e "${GREEN}✓ nginx configuration valid${NC}"
  else
    echo -e "${RED}ERROR: Generated nginx configuration is invalid!${NC}" >&2
    echo -e "${RED}Check $OUTPUT_FILE for syntax errors.${NC}" >&2
    exit 1
  fi
else
  echo -e "${YELLOW}Note: nginx not available locally; full validation will occur during traffic switch${NC}"
fi

echo ""
echo -e "${GREEN}✓ nginx config ready: $OUTPUT_FILE${NC}"
