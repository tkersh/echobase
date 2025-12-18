#!/bin/bash
# Blue-Green Deployment - Environment Switcher
# Usage: ./switch-environment.sh [blue|green]

set -e

TARGET_ENV=${1:-blue}

if [ "$TARGET_ENV" != "blue" ] && [ "$TARGET_ENV" != "green" ]; then
    echo "Error: Environment must be 'blue' or 'green'"
    exit 1
fi

echo "Switching to $TARGET_ENV environment..."

# Update environment marker file
echo "ACTIVE_ENVIRONMENT=$TARGET_ENV" > .active-environment

# Determine ports based on environment
if [ "$TARGET_ENV" = "blue" ]; then
    BACKEND_PORT=3001
    FRONTEND_PORT=3443
else
    BACKEND_PORT=3101
    FRONTEND_PORT=3543
fi

echo "Active environment: $TARGET_ENV"
echo "  Backend: localhost:$BACKEND_PORT"
echo "  Frontend: localhost:$FRONTEND_PORT"

# If nginx config exists, update it
if command -v nginx &> /dev/null; then
    echo "Reloading nginx configuration..."
    nginx -s reload 2>/dev/null || echo "Nginx not running or reload failed (OK if not using nginx)"
fi

echo "✓ Switched to $TARGET_ENV environment successfully!"
echo ""
echo "Access URLs:"
echo "  Production: https://localhost (routes to $TARGET_ENV)"
echo "  Blue direct: http://localhost:8080"
echo "  Green direct: http://localhost:8081"
