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

# Require HTPASSWD_CONTENTS from the environment (not stored in .env.secrets
# because apr1 password hashes contain $ characters that break shell sourcing)
if [ -z "$HTPASSWD_CONTENTS" ]; then
    echo -e "\033[0;31mError: HTPASSWD_CONTENTS environment variable is not set.\033[0m"
    echo ""
    echo "This variable provides HTTP basic auth credentials for the Prometheus"
    echo "and Jaeger UIs (proxied at /prometheus/ and /jaeger/)."
    echo ""
    echo "Generate it with:"
    echo "  htpasswd -nb admin <password>"
    echo "or:"
    echo "  echo \"admin:\$(openssl passwd -apr1 <password>)\""
    echo ""
    echo "Then export it in your shell profile (~/.zshrc or ~/.bashrc):"
    echo "  export HTPASSWD_CONTENTS='admin:\$apr1\$...'"
    exit 1
fi

# ── Parse flags ──────────────────────────────────────────────────
REBUILD_FLAG=""
if [ "$1" == "--rebuild" ] || [ "$1" == "-r" ]; then
  echo "Will force-rebuild Docker images."
  REBUILD_FLAG="--build"
fi

# ── Node.js dependencies ────────────────────────────────────────
# Install if node_modules is missing or package-lock.json has changed since last install.
install_deps() {
  local dir="$1"
  local label="$2"
  local lockfile="$dir/package-lock.json"
  local checksum_file="$dir/node_modules/.package-lock-checksum"
  local needs_install=false

  if [ ! -d "$dir/node_modules" ]; then
    needs_install=true
  elif [ -f "$lockfile" ]; then
    local current_checksum
    current_checksum=$(shasum "$lockfile" | cut -d' ' -f1)
    local stored_checksum=""
    [ -f "$checksum_file" ] && stored_checksum=$(cat "$checksum_file")
    if [ "$current_checksum" != "$stored_checksum" ]; then
      echo "$label dependencies changed — reinstalling..."
      needs_install=true
    fi
  fi

  if [ "$needs_install" = true ]; then
    echo "Installing $label dependencies..."
    (cd "$dir" && npm install) || {
      echo "ERROR: Failed to install $label dependencies"
      exit 1
    }
    # Store checksum after successful install
    if [ -f "$lockfile" ]; then
      shasum "$lockfile" | cut -d' ' -f1 > "$checksum_file"
    fi
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

scripts/wait-for-endpoint.sh http://localhost:4576/_localstack/health 150 "Ephemeral LocalStack"

# ── Terraform (SQS queues) ───────────────────────────────────────
if command -v terraform &> /dev/null; then
  echo ""
  echo "Applying Terraform configuration..."

  # Multi-platform provider lock (only needed in devlocal for cross-platform .terraform.lock.hcl)
  if [ ! -f terraform/.terraform.lock.hcl ]; then
    echo "Locking Terraform providers for multiple platforms..."
    (
      cd terraform
      terraform init -input=false > /dev/null 2>&1
      terraform providers lock \
        -platform=linux_amd64 -platform=linux_arm64 \
        -platform=darwin_amd64 -platform=darwin_arm64 \
        -platform=windows_amd64 > /dev/null 2>&1
    )
  fi

  scripts/terraform-apply.sh http://localhost:4576
else
  echo ""
  echo "Skipping Terraform (not installed)."
fi

# ── Application containers ───────────────────────────────────────
echo ""
echo "Building and starting application containers..."
docker compose up -d --build $REBUILD_FLAG api-gateway order-processor frontend

echo ""
scripts/wait-for-services.sh echobase-devlocal api-gateway order-processor frontend

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
