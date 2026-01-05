#!/bin/bash

echo "=========================================="
echo "Echobase Setup Script"
echo "=========================================="
echo ""

# Check if docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running. Please start Docker and try again."
  exit 1
fi

# Check if terraform is installed
if ! command -v terraform &> /dev/null; then
  echo "Warning: Terraform is not installed. Please install Terraform to provision infrastructure."
  echo "Visit: https://developer.hashicorp.com/terraform/downloads"
fi

# Check if root .env file exists (created by generate-credentials.sh)
echo "Checking root .env file..."
if [ ! -f .env ]; then
  echo ""
  echo "ERROR: Root .env file not found!"
  echo "You must run ./generate-credentials.sh first to generate secure credentials."
  echo ""
  read -p "Would you like to run ./generate-credentials.sh now? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./generate-credentials.sh
    if [ ! -f .env ]; then
      echo "ERROR: Failed to generate .env file."
      exit 1
    fi
  else
    echo "Setup cannot continue without credentials. Exiting."
    exit 1
  fi
fi

# Install Node.js dependencies FIRST (before building Docker images)
# This ensures package.json is up-to-date before Docker copies it
echo ""
echo "Installing Node.js dependencies..."
echo "Installing API Gateway dependencies..."
cd backend/api-gateway || exit
npm install
cd ../..

echo "Installing Order Processor dependencies..."
cd backend/order-processor || exit
npm install
cd ../..

echo "Installing Frontend dependencies..."
cd frontend || exit
npm install
cd ..

# Setup durable infrastructure (database)
echo ""
echo "Setting up durable infrastructure (database)..."
echo " (idempotent - safe to run multiple times)"

./durable/setup.sh devlocal

# Verify durable setup succeeded
if [ $? -ne 0 ]; then
  echo ""
  echo "ERROR: Durable infrastructure setup failed!"
  echo "Please check the error messages above and try again."
  exit 1
fi

# Start Docker containers
echo ""
echo "Starting Docker infrastructure (Localstack)..."
docker compose up -d localstack

# Wait for infrastructure to be ready
echo ""
echo "Waiting for infrastructure to be ready..."
sleep 10

# Initialize Terraform (needs Localstack running)
if command -v terraform &> /dev/null; then
  echo ""
  echo "Initializing Terraform..."
  cd terraform || exit
  terraform init
  terraform providers lock -platform=linux_amd64 -platform=linux_arm64 -platform=darwin_amd64 -platform=darwin_arm64 -platform=windows_amd64

  echo ""
  echo "Applying Terraform configuration (creating AWS resources)..."

  # Export database credentials as Terraform variables
  # These are read from the root .env file
  if [ -f ../.env ]; then
    echo "Loading database credentials from .env file..."
    source ../.env
    export TF_VAR_db_user=$DB_USER
    export TF_VAR_db_password=$DB_PASSWORD
    export TF_VAR_db_host=$DB_HOST
    export TF_VAR_db_port=$DB_PORT
    export TF_VAR_db_name=$DB_NAME
    export TF_VAR_localstack_endpoint=http://localhost:4576
  else
    echo "Warning: .env file not found!"
    echo "Database credentials will not be available to Terraform."
    echo "Please run ./generate-credentials.sh first."
    exit 1
  fi

  terraform apply -auto-approve
  cd ..
else
  echo ""
  echo "Skipping Terraform setup (not installed)"
  echo "You can manually create the SQS queue using AWS CLI:"
  echo "aws --endpoint-url=http://localhost:4576 sqs create-queue --queue-name order-processing-queue"
fi

# Build and start application containers
# IMPORTANT: Use --build to rebuild images with updated dependencies
echo ""
echo "Building and starting application containers..."
echo "This will rebuild Docker images to include any new dependencies..."
docker compose up -d --build api-gateway order-processor frontend

# Wait for services to be ready
echo ""
echo "Waiting for services to be ready..."
sleep 10

# Check if services are healthy
echo ""
echo "Checking service health..."
docker compose ps

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Infrastructure Summary:"
echo ""
echo "✓ Durable Layer (Persistent):"
echo "    Database: echobase-devlocal-durable-mariadb (port 3306)"
echo "    Network: echobase-devlocal-durable-network"
echo "    Status: Running and persists across deployments"
echo ""
echo "✓ Ephemeral Layer (Deployed):"
echo "    API Gateway: Ready (port 3001)"
echo "    Frontend: Ready (port 3443)"
echo "    Order Processor: Ready"
echo "    LocalStack: Running (port 4566)"
echo ""
echo "Next Steps:"
echo "  1. Start the application: ./start.sh"
echo "  2. Access frontend: https://localhost:3443"
echo "  3. Access API: https://localhost:3001"
echo ""
echo "Management:"
echo "  - View logs: docker compose logs -f"
echo "  - Stop app: docker compose down (database persists)"
echo "  - Stop database: ./durable/teardown.sh devlocal"
echo "  - Restart everything: ./start.sh"
echo ""
