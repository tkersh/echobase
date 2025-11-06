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
  echo "WARNING: Root .env file not found!"
  echo "It's recommended to run ./generate-credentials.sh first to generate secure credentials."
  echo "Otherwise, Docker Compose will use default/empty values."
fi

# Start Docker containers
echo ""
echo "Starting Docker containers (Localstack and MariaDB)..."
docker-compose up -d

# Wait for services to be ready
echo ""
echo "Waiting for services to be ready..."
sleep 10

# Check if services are healthy
echo ""
echo "Checking service health..."
docker-compose ps

# Initialize Terraform
if command -v terraform &> /dev/null; then
  echo ""
  echo "Initializing Terraform..."
  cd terraform
  terraform init

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
  echo "aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name order-processing-queue"
fi

# Install Node.js dependencies
echo ""
echo "Installing Node.js dependencies..."
echo "Installing API Gateway dependencies..."
cd backend/api-gateway
npm install
cd ../..

echo "Installing Order Processor dependencies..."
cd backend/order-processor
npm install
cd ../..

echo "Installing Frontend dependencies..."
cd frontend
npm install
cd ..

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "To start the application, run: ./start.sh"
echo ""
