#!/bin/bash

# Echobase Start Script
# Single entrypoint: handles first-time setup and daily restarts.
# Idempotent - safe to run repeatedly. Skips steps that are already done.
#
# Usage:
#   ./start.sh             # Start (or set up) everything
#   ./start.sh --rebuild   # Force-rebuild Docker images

set -e
set -o pipefail

echo "=========================================="
echo "Echobase Start"
echo "=========================================="
echo ""

# ── Ctrl+C cleanup ──────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Shutting down application services..."
  docker compose down
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── Pre-flight checks ───────────────────────────────────────────
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running. Please start Docker and try again."
  exit 1
fi

if ! command -v terraform &> /dev/null; then
  echo "Warning: Terraform is not installed. Please install Terraform to provision infrastructure."
  echo "Visit: https://developer.hashicorp.com/terraform/downloads"
fi

# ── Credentials ──────────────────────────────────────────────────
echo "Checking .env.secrets file..."
if [ ! -f .env.secrets ]; then
  echo ""
  echo ".env.secrets not found — generating credentials..."
  ./scripts/generate-credentials.sh
  if [ ! -f .env.secrets ]; then
    echo "ERROR: Failed to generate .env.secrets file."
    exit 1
  fi
fi

# Load environment variables (config + secrets)
set -a
source .env
source .env.secrets
set +a

# ── Parse flags ──────────────────────────────────────────────────
REBUILD_FLAG=""
if [ "$1" == "--rebuild" ] || [ "$1" == "-r" ]; then
  echo "Will force-rebuild Docker images."
  REBUILD_FLAG="--build"
fi

# ── Node.js dependencies ────────────────────────────────────────
# Only install if node_modules is missing (skip on repeat runs).
install_deps() {
  local dir="$1"
  local label="$2"
  if [ ! -d "$dir/node_modules" ]; then
    echo "Installing $label dependencies..."
    (cd "$dir" && npm install) || {
      echo "ERROR: Failed to install $label dependencies"
      exit 1
    }
  fi
}

install_deps "backend/api-gateway"    "API Gateway"
install_deps "backend/mcp-server"     "MCP Server"
install_deps "backend/order-processor" "Order Processor"
install_deps "frontend"               "Frontend"

# ── Base Docker image ───────────────────────────────────────────
# Build base image if it doesn't exist (other images depend on it)
if ! docker image inspect echobase-node-base:latest > /dev/null 2>&1; then
  echo ""
  echo "Building base Docker image..."
  docker build -t echobase-node-base:latest docker/base/
fi

# ── Durable infrastructure ───────────────────────────────────────
echo ""
echo "Ensuring durable infrastructure is running (idempotent)..."
./durable/setup.sh devlocal

# ── Ephemeral LocalStack ─────────────────────────────────────────
echo ""
echo "Starting ephemeral LocalStack..."
docker compose up -d localstack

echo "Waiting for LocalStack to be ready..."
sleep 10

# ── Terraform (SQS queues) ───────────────────────────────────────
if command -v terraform &> /dev/null; then
  echo ""
  echo "Applying Terraform configuration..."
  (
    cd terraform
    terraform init -input=false > /dev/null 2>&1
    terraform providers lock \
      -platform=linux_amd64 -platform=linux_arm64 \
      -platform=darwin_amd64 -platform=darwin_arm64 \
      -platform=windows_amd64 > /dev/null 2>&1

    source ../.env
    source ../.env.secrets
    export TF_VAR_db_user=$DB_USER
    export TF_VAR_db_password=$DB_PASSWORD
    export TF_VAR_db_host=$DB_HOST
    export TF_VAR_db_port=$DB_PORT
    export TF_VAR_db_name=$DB_NAME
    export TF_VAR_localstack_endpoint=http://localhost:4576

    terraform apply -auto-approve
  )
else
  echo ""
  echo "Skipping Terraform (not installed)."
fi

# ── Application containers ───────────────────────────────────────
echo ""
echo "Building and starting application containers..."
docker compose up -d --build $REBUILD_FLAG api-gateway order-processor frontend

echo ""
echo "Waiting for services to be healthy..."
sleep 10

echo ""
docker compose ps

echo ""
echo "=========================================="
echo "Echobase is running!"
echo "=========================================="
echo ""
echo "  Frontend: https://localhost:3443"
echo "  API:      https://localhost:3001"
echo ""
echo "  View logs:  docker compose logs -f"
echo "  Stop app:   docker compose down  (database persists)"
echo "  Stop all:   ./durable/teardown.sh devlocal"
echo ""
echo "Following logs (Ctrl+C to stop)..."
echo ""

docker compose logs -f
