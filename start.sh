#!/bin/bash

echo "=========================================="
echo "Starting Echobase Application"
echo "=========================================="
echo ""

# Check if Docker containers are running
if ! docker-compose ps | grep -q "Up"; then
  echo "Docker containers are not running. Starting them now..."
  docker-compose up -d
  sleep 10
fi

echo "Starting services..."
echo ""

# Function to cleanup on exit
cleanup() {
  echo ""
  echo "Shutting down services..."
  kill $API_PID $PROCESSOR_PID $FRONTEND_PID 2>/dev/null
  exit 0
}

trap cleanup SIGINT SIGTERM

# Start API Gateway
echo "Starting API Gateway on port 3001..."
cd backend/api-gateway
node server.js &
API_PID=$!
cd ../..

# Start Order Processor
echo "Starting Order Processor..."
cd backend/order-processor
node processor.js &
PROCESSOR_PID=$!
cd ../..

# Start Frontend
echo "Starting React Frontend on port 3000..."
cd frontend
BROWSER=none npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "=========================================="
echo "All services started!"
echo "=========================================="
echo ""
echo "Services running:"
echo "  - Frontend:        http://localhost:3000"
echo "  - API Gateway:     http://localhost:3001"
echo "  - Order Processor: Running in background"
echo "  - Localstack:      http://localhost:4566"
echo "  - MariaDB:         localhost:3306"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for all background processes
wait