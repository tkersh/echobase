#!/bin/bash

# Local CI Testing Script (Without gitlab-runner exec)
# Simulates GitLab CI environment by running the same Docker containers and commands

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_fail() {
    echo -e "${RED}[✗]${NC} $1"
}

run_docker_job() {
    local job_name=$1
    local docker_image=$2
    local commands=$3
    local description=$4

    echo ""
    print_info "Testing: ${YELLOW}${job_name}${NC}"
    print_info "Description: ${description}"
    print_info "Image: ${docker_image}"
    echo ""

    if docker run --rm \
        -v "$(pwd):/project" \
        -v "/var/run/docker.sock:/var/run/docker.sock" \
        -w /project \
        --privileged \
        "$docker_image" \
        /bin/sh -c "$commands"; then

        print_success "✓ ${job_name} passed"
        ((PASSED++))
        return 0
    else
        print_fail "✗ ${job_name} failed"
        ((FAILED++))
        return 1
    fi
}

test_validate_env() {
    print_header "Test 1: Environment Check"

    local commands='
        apk add --no-cache bash curl git terraform nodejs npm > /dev/null 2>&1 &&
        echo "Checking versions:" &&
        echo "  Docker: $(docker --version)" &&
        echo "  Docker Compose: $(docker compose --version)" &&
        echo "  Terraform: $(terraform --version | head -1)" &&
        echo "  Node.js: $(node --version)" &&
        echo "  npm: $(npm --version)" &&
        echo "" &&
        if [ ! -f .env.secrets ]; then
            echo "WARNING: .env.secrets file not found"
            exit 1
        fi &&
        echo "✓ .env.secrets file exists" &&
        echo "" &&
        echo "Environment check passed!"
    '

    run_docker_job \
        "validate:env-check" \
        "docker/compose:latest" \
        "$commands" \
        "Verify all required tools are available"
}

test_validate_terraform() {
    print_header "Test 2: Terraform Validation"

    print_info "Testing: ${YELLOW}validate:terraform${NC}"
    print_info "Description: Validate Terraform configuration"
    print_info "Image: hashicorp/terraform:latest"
    echo ""

    # Terraform image doesn't have sh, run commands directly
    cd terraform || exit 1

    echo "Initializing Terraform..."
    if docker run --rm -v "$(pwd):/workspace" -w /workspace hashicorp/terraform:latest init -backend=false > /dev/null; then
        echo "✓ Terraform initialized"
    else
        print_fail "✗ Terraform init failed"
        cd ..
        ((FAILED++))
        return 1
    fi

    echo ""
    echo "Validating Terraform configuration..."
    if docker run --rm -v "$(pwd):/workspace" -w /workspace hashicorp/terraform:latest validate; then
        echo ""
        echo "✓ Terraform validation passed"
    else
        print_fail "✗ Terraform validation failed"
        cd ..
        ((FAILED++))
        return 1
    fi

    echo ""
    echo "Checking Terraform formatting..."
    if docker run --rm -v "$(pwd):/workspace" -w /workspace hashicorp/terraform:latest fmt -check -recursive; then
        echo "✓ Terraform formatting is correct"
    else
        print_fail "✗ Terraform formatting check failed"
        cd ..
        ((FAILED++))
        return 1
    fi

    cd ..
    echo ""
    print_success "✓ validate:terraform passed"
    ((PASSED++))
    return 0
}

test_validate_docker_compose() {
    print_header "Test 3: Docker Compose Validation"

    print_info "Testing: ${YELLOW}validate:docker compose${NC}"
    print_info "Description: Validate Docker Compose configuration"
    echo ""

    echo "Validating docker-compose.yml..."
    if docker compose config > /dev/null 2>&1; then
        echo "✓ Docker Compose configuration is valid!"
        echo ""
        print_success "✓ validate:docker compose passed"
        ((PASSED++))
        return 0
    else
        echo ""
        print_fail "✗ Docker Compose validation failed"
        echo ""
        echo "Running docker compose config to show errors:"
        docker compose config 2>&1 | head -20
        ((FAILED++))
        return 1
    fi
}

test_build_dependencies() {
    print_header "Test 4: Build Dependencies"

    local commands='
        apk add --no-cache bash git > /dev/null 2>&1 &&
        echo "Installing API Gateway dependencies..." &&
        cd backend/api-gateway &&
        npm ci --prefer-offline --no-audit --quiet > /dev/null &&
        echo "✓ API Gateway dependencies installed" &&
        cd ../.. &&
        echo "" &&
        echo "Installing Order Processor dependencies..." &&
        cd backend/order-processor &&
        npm ci --prefer-offline --no-audit --quiet > /dev/null &&
        echo "✓ Order Processor dependencies installed" &&
        cd ../.. &&
        echo "" &&
        echo "Installing Frontend dependencies..." &&
        cd frontend &&
        npm ci --prefer-offline --no-audit --quiet > /dev/null &&
        echo "✓ Frontend dependencies installed" &&
        cd .. &&
        echo "" &&
        echo "Installing E2E test dependencies..." &&
        cd e2e-tests &&
        npm ci --prefer-offline --no-audit --quiet > /dev/null &&
        echo "✓ E2E test dependencies installed" &&
        cd .. &&
        echo "" &&
        echo "All dependencies installed successfully!"
    '

    run_docker_job \
        "build:dependencies" \
        "node:18-alpine" \
        "$commands" \
        "Install Node.js dependencies"
}

test_docker_compose_build() {
    print_header "Test 5: Docker Compose Build"

    print_info "Building Docker images with Docker Compose..."
    print_info "This may take a few minutes..."
    echo ""

    if [ -f .env ]; then
        set -a
        source .env
        [ -f .env.secrets ] && source .env.secrets
        set +a
    fi

    if docker compose build --quiet 2>&1 | grep -v "^$"; then
        print_success "✓ Docker images built successfully"
        ((PASSED++))
    else
        print_fail "✗ Docker image build failed"
        ((FAILED++))
        return 1
    fi
}

print_summary() {
    print_header "Test Summary"

    local total=$((PASSED + FAILED))

    echo "Results:"
    echo "--------"
    echo -e "  ${GREEN}Passed:${NC}  $PASSED / $total"
    echo -e "  ${RED}Failed:${NC}  $FAILED / $total"
    echo ""

    if [ $FAILED -eq 0 ]; then
        print_success "All tests passed! ✓"
        echo ""
        print_info "Your pipeline is ready to push to GitLab!"
        echo ""
        echo "Next steps:"
        echo "  1. Verify runner is online in GitLab:"
        echo "     Settings > CI/CD > Runners"
        echo ""
        echo "  2. Commit and push:"
        echo "     git add .gitlab-ci.yml GITLAB_CI_*.md *.sh"
        echo "     git commit -m 'Add GitLab CI/CD pipeline'"
        echo "     git push origin main"
        echo ""
        echo "  3. Watch pipeline:"
        echo "     CI/CD > Pipelines"
        echo ""
        return 0
    else
        print_error "Some tests failed. Please fix errors before pushing."
        echo ""
        return 1
    fi
}

show_help() {
    cat << EOF
Local CI Testing Script (Direct Docker Testing)

This script tests your GitLab CI pipeline by running the same Docker
containers and commands that GitLab CI would execute.

Usage: $0 [OPTIONS]

OPTIONS:
    --all            Run all tests (default)
    --quick          Run only quick tests (validation)
    --build          Include dependency build test
    --docker-build   Include Docker image build test (slow)
    --help           Show this help

TESTS:
    1. Environment Check      - Verify tools (Docker, Terraform, Node.js)
    2. Terraform Validation   - Validate Terraform configuration
    3. Docker Compose Config  - Validate Docker Compose file
    4. Build Dependencies     - Install Node.js dependencies
    5. Docker Build          - Build Docker images (optional, slow)

EXAMPLES:
    $0                    # Run validation tests only
    $0 --build            # Include dependency installation
    $0 --docker-build     # Include everything (slow)
    $0 --quick            # Run only validation tests

EOF
}

main() {
    local include_build=false
    local include_docker_build=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --all)
                include_build=true
                shift
                ;;
            --quick)
                include_build=false
                include_docker_build=false
                shift
                ;;
            --build)
                include_build=true
                shift
                ;;
            --docker-build)
                include_build=true
                include_docker_build=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # Print banner
    clear
    print_header "GitLab CI Local Testing (Docker Simulation)"

    print_info "Testing pipeline by simulating CI environment..."
    echo ""

    # Check Docker
    if ! docker ps > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker Desktop."
        exit 1
    fi

    # Check if in correct directory
    if [ ! -f .gitlab-ci.yml ]; then
        print_error "Not in project root. Please run from /Users/tadk/work/echobase"
        exit 1
    fi

    # Run tests
    test_validate_env || true
    test_validate_terraform || true
    test_validate_docker_compose || true

    if [ "$include_build" = true ]; then
        test_build_dependencies || true
    fi

    if [ "$include_docker_build" = true ]; then
        test_docker_compose_build || true
    fi

    # Print summary
    print_summary
}

# Trap Ctrl+C
trap 'echo ""; print_error "Testing interrupted"; exit 130' INT

# Run main
main "$@"
