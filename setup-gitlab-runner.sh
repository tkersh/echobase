#!/bin/bash

# GitLab Runner Setup Script for Local Development
# This script helps you install and configure a GitLab Runner on your local machine

set -e

echo "============================================"
echo "GitLab Runner Setup for Echobase"
echo "============================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running on macOS or Linux
OS_TYPE=$(uname -s)
print_info "Detected OS: $OS_TYPE"
echo ""

# Step 1: Check prerequisites
print_info "Step 1: Checking prerequisites..."
echo ""

# Check Docker
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    print_info "✓ Docker installed: $DOCKER_VERSION"
else
    print_error "✗ Docker not found. Please install Docker first."
    echo "  Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check Docker Compose
if command -v docker compose &> /dev/null; then
    COMPOSE_VERSION=$(docker compose --version)
    print_info "✓ Docker Compose installed: $COMPOSE_VERSION"
else
    print_error "✗ Docker Compose not found. Please install Docker Compose first."
    exit 1
fi

# Check Terraform
if command -v terraform &> /dev/null; then
    TERRAFORM_VERSION=$(terraform --version | head -n1)
    print_info "✓ Terraform installed: $TERRAFORM_VERSION"
else
    print_error "✗ Terraform not found. Please install Terraform first."
    echo "  Visit: https://www.terraform.io/downloads"
    exit 1
fi

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_info "✓ Node.js installed: $NODE_VERSION"
else
    print_error "✗ Node.js not found. Please install Node.js first."
    echo "  Visit: https://nodejs.org/"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    print_info "✓ npm installed: $NPM_VERSION"
else
    print_error "✗ npm not found. It should come with Node.js."
    exit 1
fi

echo ""
print_info "All prerequisites satisfied! ✓"
echo ""

# Step 2: Check if GitLab Runner is already installed
print_info "Step 2: Checking GitLab Runner installation..."
echo ""

if command -v gitlab-runner &> /dev/null; then
    RUNNER_VERSION=$(gitlab-runner --version | head -n1)
    print_warning "GitLab Runner is already installed: $RUNNER_VERSION"
    echo ""
    read -p "Do you want to reinstall? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Skipping installation..."
        SKIP_INSTALL=true
    else
        SKIP_INSTALL=false
    fi
else
    SKIP_INSTALL=false
fi

# Step 3: Install GitLab Runner
if [ "$SKIP_INSTALL" = false ]; then
    print_info "Step 3: Installing GitLab Runner..."
    echo ""

    if [ "$OS_TYPE" = "Darwin" ]; then
        # macOS installation
        print_info "Installing GitLab Runner for macOS..."

        if command -v brew &> /dev/null; then
            print_info "Using Homebrew to install GitLab Runner..."
            brew install gitlab-runner
        else
            print_warning "Homebrew not found. Installing manually..."
            sudo curl --output /usr/local/bin/gitlab-runner https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-darwin-amd64
            sudo chmod +x /usr/local/bin/gitlab-runner
        fi

    elif [ "$OS_TYPE" = "Linux" ]; then
        # Linux installation
        print_info "Installing GitLab Runner for Linux..."

        # Download the binary
        sudo curl -L --output /usr/local/bin/gitlab-runner https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-linux-amd64

        # Give it execute permissions
        sudo chmod +x /usr/local/bin/gitlab-runner

        # Create a GitLab CI user (if doesn't exist)
        if ! id -u gitlab-runner &> /dev/null; then
            sudo useradd --comment 'GitLab Runner' --create-home gitlab-runner --shell /bin/bash
            print_info "Created gitlab-runner user"
        fi

        # Add gitlab-runner to docker group
        sudo usermod -aG docker gitlab-runner
        print_info "Added gitlab-runner to docker group"

        # Install as service
        sudo gitlab-runner install --user=gitlab-runner --working-directory=/home/gitlab-runner
        print_info "Installed GitLab Runner as service"

    else
        print_error "Unsupported OS: $OS_TYPE"
        exit 1
    fi

    echo ""
    print_info "GitLab Runner installed successfully! ✓"
    echo ""
fi

# Step 4: Verify installation
print_info "Step 4: Verifying installation..."
echo ""

if command -v gitlab-runner &> /dev/null; then
    RUNNER_VERSION=$(gitlab-runner --version | head -n1)
    print_info "✓ GitLab Runner version: $RUNNER_VERSION"
else
    print_error "GitLab Runner installation failed."
    exit 1
fi

echo ""

# Step 5: Register the runner
print_info "Step 5: Runner registration"
echo ""
print_warning "You need to register the runner with your GitLab instance."
echo ""
echo "Before proceeding, get your registration token from GitLab:"
echo "  1. Go to your GitLab project"
echo "  2. Navigate to Settings > CI/CD > Runners"
echo "  3. Expand the 'Runners' section"
echo "  4. Copy the registration token"
echo ""
read -p "Do you want to register the runner now? (Y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo ""
    print_info "Starting runner registration..."
    echo ""

    # Prompt for GitLab URL
    read -p "Enter your GitLab instance URL (default: https://gitlab.com): " GITLAB_URL
    GITLAB_URL=${GITLAB_URL:-https://gitlab.com}

    # Prompt for registration token
    read -p "Enter your registration token: " REGISTRATION_TOKEN

    # Prompt for description
    read -p "Enter a description (default: Local Development Runner): " DESCRIPTION
    DESCRIPTION=${DESCRIPTION:-Local Development Runner}

    # Register the runner with Docker executor
    gitlab-runner register \
        --non-interactive \
        --url "$GITLAB_URL" \
        --registration-token "$REGISTRATION_TOKEN" \
        --executor "docker" \
        --docker-image "docker:24-dind" \
        --docker-privileged \
        --docker-volumes "/var/run/docker.sock:/var/run/docker.sock" \
        --docker-volumes "/certs/client" \
        --description "$DESCRIPTION" \
        --tag-list "docker-local" \
        --run-untagged="false" \
        --locked="false"

    echo ""
    print_info "Runner registered successfully! ✓"
else
    echo ""
    print_warning "Skipping registration. You can register later with:"
    echo "  gitlab-runner register"
fi

echo ""

# Step 6: Start the runner
print_info "Step 6: Starting GitLab Runner..."
echo ""

gitlab-runner start

# Verify runner status
if gitlab-runner status | grep -q "running"; then
    print_info "✓ GitLab Runner is running"
else
    print_warning "GitLab Runner may not be running. Check with: gitlab-runner status"
fi

echo ""

# Step 7: Display runner information
print_info "Step 7: Runner information"
echo ""

echo "Registered runners:"
gitlab-runner list

echo ""

# Step 8: Final instructions
print_info "============================================"
print_info "Setup Complete! ✓"
print_info "============================================"
echo ""
print_info "Next steps:"
echo ""
echo "1. Verify your runner appears in GitLab:"
echo "   Settings > CI/CD > Runners"
echo ""
echo "2. Ensure your .env file exists:"
echo "   ./scripts/generate-credentials.sh"
echo ""
echo "3. Commit and push to trigger the pipeline:"
echo "   git add .gitlab-ci.yml"
echo "   git commit -m 'Add GitLab CI/CD pipeline'"
echo "   git push"
echo ""
echo "4. Monitor pipeline execution:"
echo "   Go to CI/CD > Pipelines in GitLab"
echo ""
print_info "Useful commands:"
echo ""
echo "  gitlab-runner status          # Check runner status"
echo "  gitlab-runner list            # List registered runners"
echo "  gitlab-runner restart         # Restart the runner"
echo "  gitlab-runner unregister      # Unregister a runner"
echo "  gitlab-runner --debug run     # Run in debug mode"
echo ""
print_info "Documentation: See GITLAB_CI_SETUP.md for detailed guide"
echo ""
print_info "Happy CI/CD-ing! 🚀"
echo ""
