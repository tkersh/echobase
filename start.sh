#!/bin/bash

echo "=========================================="
echo "Starting Echobase Application"
echo "=========================================="
echo ""

# Function to cleanup on exit
cleanup() {
  echo ""
  echo "Shutting down services..."
  docker-compose stop
  exit 0
}

trap cleanup SIGINT SIGTERM

# Check if .env file exists
if [ ! -f .env ]; then
  echo "ERROR: Root .env file not found!"
  echo "Please run ./generate-credentials.sh first to create secure credentials."
  exit 1
fi

# Load environment variables from .env file
echo "Loading environment variables from .env..."
set -a
source .env
set +a

# Check if --rebuild flag is passed
REBUILD_FLAG=""
if [ "$1" == "--rebuild" ] || [ "$1" == "-r" ]; then
  echo "Rebuilding Docker images with latest code and dependencies..."
  REBUILD_FLAG="--build"
else
  echo "Starting services with existing Docker images..."
  echo "(Use './start.sh --rebuild' to rebuild images if you've updated dependencies)"
fi

# Start all services with docker-compose
echo "Starting all services with Docker Compose..."
docker-compose up -d $REBUILD_FLAG

echo ""
echo "Waiting for services to be healthy..."
sleep 5

# Check service health
echo ""
echo "Service Status:"
docker-compose ps

echo ""
echo "=========================================="
echo "All services started!"
echo "=========================================="
echo ""
echo "Services running:"
echo "  - Frontend:        https://localhost:3443"
echo "  - API Gateway:     https://localhost:3001"
echo "  - Order Processor: Running in Docker"
echo "  - Localstack:      http://localhost:4566"
echo "  - MariaDB:         localhost:3306"
echo ""
echo "To view logs:"
echo "  - All services:    docker-compose logs -f"
echo "  - API Gateway:     docker-compose logs -f api-gateway"
echo "  - Order Processor: docker-compose logs -f order-processor"
echo "  - Frontend:        docker-compose logs -f frontend"
echo ""
echo "To rebuild after code/dependency changes:"
echo "  ./start.sh --rebuild"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Follow logs from all services
docker-compose logs -f