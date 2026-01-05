#!/bin/bash

set -e

echo "======================================"
echo "Echobase Infrastructure Teardown"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Step 0: Verify Docker services are running
echo "Step 0: Verifying Docker services are running..."
if ! docker compose ps | grep -q "localstack"; then
    print_warning "Docker services not running. Starting them now..."
    if docker compose up -d; then
        print_status "Docker services started"
        # Wait for localstack to be healthy
        echo "Waiting for localstack to be healthy..."
        sleep 5
        RETRIES=30
        until docker compose exec -T localstack curl -f http://localhost:4566/_localstack/health 2>/dev/null || [ $RETRIES -eq 0 ]; do
            echo -n "."
            sleep 2
            RETRIES=$((RETRIES-1))
        done
        echo ""
        if [ $RETRIES -eq 0 ]; then
            print_error "Localstack failed to become healthy"
            exit 1
        fi
        print_status "Localstack is healthy"
    else
        print_error "Failed to start Docker services"
        exit 1
    fi
else
    print_status "Docker services are already running"
fi

echo ""

# Step 1: Destroy Terraform infrastructure
echo "Step 1: Destroying Terraform infrastructure..."
if [ -d "terraform" ]; then
    cd terraform

    # Export database credentials and LocalStack endpoint as Terraform variables
    # These are needed for terraform destroy to work properly
    if [ -f ../.env ]; then
        print_status "Loading database credentials from .env file..."
        source ../.env
        export TF_VAR_db_user=$DB_USER
        export TF_VAR_db_password=$DB_PASSWORD
        export TF_VAR_db_host=$DB_HOST
        export TF_VAR_db_port=$DB_PORT
        export TF_VAR_db_name=$DB_NAME
    else
        print_warning ".env file not found - using default values for Terraform variables"
        export TF_VAR_db_user=app_user
        export TF_VAR_db_host=mariadb
        export TF_VAR_db_port=3306
        export TF_VAR_db_name=orders_db
    fi

    # Set LocalStack endpoint to ephemeral instance (port 4576) which has SQS enabled
    # Durable LocalStack (port 4566) only has secretsmanager and KMS
    export TF_VAR_localstack_endpoint=http://localhost:4576

    if terraform destroy -auto-approve; then
        print_status "Terraform infrastructure destroyed successfully"
    else
        print_error "Failed to destroy Terraform infrastructure"
        exit 1
    fi
    cd ..
else
    print_warning "Terraform directory not found, skipping..."
fi

echo ""

# Step 2: Stop and remove Docker containers
echo "Step 2: Stopping and removing Docker containers..."
if docker compose ps -q 2>/dev/null | grep -q .; then
    if docker compose down; then
        print_status "Docker containers stopped and removed"
    else
        print_error "Failed to stop Docker containers"
        exit 1
    fi
else
    print_warning "No running containers found, skipping..."
fi

echo ""

# Step 3: Remove Docker volumes
echo "Step 3: Removing Docker volumes..."
print_warning "This will delete all persistent data including the database!"
read -p "Do you want to remove volumes? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if docker compose down -v; then
        print_status "Docker volumes removed"
    else
        print_error "Failed to remove Docker volumes"
        exit 1
    fi
else
    print_warning "Skipped volume removal"
fi

echo ""

# Step 4: Clean up orphaned containers (optional)
echo "Step 4: Cleaning up orphaned containers..."
ORPHANED=$(docker ps -a -q -f "name=echobase" 2>/dev/null)
if [ -n "$ORPHANED" ]; then
    docker rm -f "$ORPHANED"
    print_status "Orphaned containers removed"
else
    print_warning "No orphaned containers found"
fi

echo ""

# Step 5: Final shutdown of local environment
echo "Step 5: Ensuring local environment is shut down..."
if docker compose down 2>/dev/null; then
    print_status "Local environment shut down successfully"
else
    print_warning "Local environment already shut down or not found"
fi

echo ""

# Step 6: Summary
echo "======================================"
echo "Teardown Complete"
echo "======================================"
print_status "Terraform infrastructure destroyed"
print_status "Docker containers removed"
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Docker volumes removed"
fi
print_status "Local environment shut down"
echo ""
echo "To rebuild the infrastructure, run:"
echo "  ./generate-credentials.sh (ONLY on first run!)"
echo "  ./setup.sh"
#echo "  docker compose up -d"
#echo "  cd terraform && terraform init && terraform apply -auto-approve"
