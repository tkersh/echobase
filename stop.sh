#!/bin/bash

# Echobase Stop Script
# Gracefully shuts down all services, letting databases finish cleanly.
#
# Usage:
#   ./stop.sh           # Stop ephemeral services only (database keeps running)
#   ./stop.sh --all     # Stop everything including durable infrastructure
#
# Why not use `docker stop $(docker ps -q)`?
#   That command only waits 10 seconds before sending SIGKILL, which isn't
#   enough time for MariaDB to flush its InnoDB buffers. This can corrupt
#   the database.
#
# This script uses `mysqladmin shutdown` to initiate a clean database shutdown,
# then waits for it to complete naturally (no arbitrary timeout).

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Echobase Stop"
echo "=========================================="
echo ""

# Parse flags
STOP_ALL=false
if [ "$1" == "--all" ] || [ "$1" == "-a" ]; then
  STOP_ALL=true
fi

# Load environment
if [ -f .env ]; then
  set -a
  source .env
  [ -f .env.secrets ] && source .env.secrets
  set +a
fi

# Match project naming from durable/setup.sh
DURABLE_ENV="${DURABLE_ENV:-devlocal}"
DURABLE_PROJECT="echobase-${DURABLE_ENV}-durable"
MARIADB_CONTAINER="echobase-${DURABLE_ENV}-durable-mariadb"

# ── Stop ephemeral services ─────────────────────────────────────
echo -e "${YELLOW}Stopping ephemeral services...${NC}"
if docker compose ps --quiet 2>/dev/null | grep -q .; then
  docker compose down
  echo -e "${GREEN}Ephemeral services stopped.${NC}"
else
  echo "No ephemeral services running."
fi

# ── Stop durable services (if --all) ────────────────────────────
if [ "$STOP_ALL" = true ]; then
  echo ""
  echo -e "${YELLOW}Stopping durable infrastructure...${NC}"

  # Check if durable services are running
  if docker compose -f durable/docker-compose.yml -p "$DURABLE_PROJECT" ps --quiet 2>/dev/null | grep -q .; then

    # Check if MariaDB is running
    DB_STATUS=$(docker inspect -f '{{.State.Status}}' "$MARIADB_CONTAINER" 2>/dev/null || echo "not-found")

    if [ "$DB_STATUS" = "running" ]; then
      echo "Initiating graceful MariaDB shutdown..."

      # Get root password from secrets manager or environment
      if [ -n "$MYSQL_ROOT_PASSWORD" ]; then
        ROOT_PASS="$MYSQL_ROOT_PASSWORD"
      else
        # Try to get it from the container's environment
        ROOT_PASS=$(docker inspect "$MARIADB_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep "MYSQL_ROOT_PASSWORD=" | cut -d= -f2-)
      fi

      if [ -n "$ROOT_PASS" ]; then
        # Send shutdown command to MariaDB - this initiates a clean internal shutdown
        # MariaDB will flush all dirty pages, write checkpoint, close connections
        echo "Sending shutdown command to MariaDB..."
        docker exec "$MARIADB_CONTAINER" mysqladmin -u root -p"$ROOT_PASS" shutdown 2>/dev/null || true

        # Wait for container to stop naturally (MariaDB knows how long it needs)
        echo "Waiting for MariaDB to finish shutdown..."
        MAX_WAIT=300  # 5 minute safety net (should never need this long)
        WAITED=0
        while [ "$WAITED" -lt "$MAX_WAIT" ]; do
          STATUS=$(docker inspect -f '{{.State.Status}}' "$MARIADB_CONTAINER" 2>/dev/null || echo "stopped")
          if [ "$STATUS" != "running" ]; then
            echo -e "${GREEN}MariaDB shutdown complete.${NC}"
            break
          fi
          sleep 1
          WAITED=$((WAITED + 1))
          # Show progress every 10 seconds
          if [ $((WAITED % 10)) -eq 0 ]; then
            echo "  Still shutting down... (${WAITED}s)"
          fi
        done

        if [ "$WAITED" -ge "$MAX_WAIT" ]; then
          echo -e "${RED}Warning: MariaDB did not stop within ${MAX_WAIT}s, forcing stop${NC}"
        fi
      else
        echo "Could not retrieve MariaDB root password, using docker stop with extended timeout..."
        docker stop -t 60 "$MARIADB_CONTAINER" 2>/dev/null || true
      fi
    fi

    # Stop remaining durable services
    echo "Stopping remaining durable services..."
    docker compose -f durable/docker-compose.yml -p "$DURABLE_PROJECT" down

    echo -e "${GREEN}Durable infrastructure stopped.${NC}"
  else
    echo "No durable services running."
  fi
fi

echo ""
echo "=========================================="
if [ "$STOP_ALL" = true ]; then
  echo -e "${GREEN}All services stopped.${NC}"
  echo ""
  echo "To restart everything: ./start.sh"
else
  echo -e "${GREEN}Ephemeral services stopped.${NC}"
  echo -e "Database is still running (use ${YELLOW}./stop.sh --all${NC} to stop everything)"
  echo ""
  echo "To restart app: ./start.sh"
fi
echo "=========================================="
