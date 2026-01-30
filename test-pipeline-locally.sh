#!/bin/bash

# Local GitLab CI Pipeline Testing Script
# Tests pipeline jobs locally using gitlab-runner exec before pushing to GitLab

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
SKIPPED=0

# Test results array
declare -a RESULTS

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

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
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

run_job() {
    local job_name=$1
    local docker_image=$2
    local description=$3

    echo ""
    print_info "Testing job: ${YELLOW}${job_name}${NC}"
    print_info "Description: ${description}"
    print_info "Image: ${docker_image}"
    echo ""

    if gitlab-runner exec docker "$job_name" \
        --docker-image "$docker_image" \
        --docker-privileged \
        --docker-volumes /var/run/docker.sock:/var/run/docker.sock \
        2>&1 | tee "/tmp/gitlab-runner-${job_name}.log"; then

        print_success "Job '${job_name}' passed"
        RESULTS+=("${GREEN}✓${NC} ${job_name}")
        ((PASSED++))
        return 0
    else
        print_fail "Job '${job_name}' failed"
        print_error "See logs: /tmp/gitlab-runner-${job_name}.log"
        RESULTS+=("${RED}✗${NC} ${job_name}")
        ((FAILED++))
        return 1
    fi
}

skip_job() {
    local job_name=$1
    local reason=$2

    print_warning "Skipping job '${job_name}': ${reason}"
    RESULTS+=("${YELLOW}⊘${NC} ${job_name} (${reason})")
    ((SKIPPED++))
}

check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check if gitlab-runner is installed
    if ! command -v gitlab-runner &> /dev/null; then
        print_error "gitlab-runner not found. Please install it first."
        exit 1
    fi
    print_success "gitlab-runner is installed"

    # Check if Docker is running
    if ! docker ps &> /dev/null; then
        print_error "Docker is not running. Please start Docker Desktop."
        exit 1
    fi
    print_success "Docker is running"

    # Check if .env file exists
    if [ ! -f .env ]; then
        print_warning ".env file not found. Some tests may fail."
        print_info "Run ./scripts/generate-credentials.sh to create it."
    else
        print_success ".env file exists"
    fi

    # Check if in correct directory
    if [ ! -f .gitlab-ci.yml ]; then
        print_error "Not in the correct directory. Please run from project root."
        exit 1
    fi
    print_success "In correct directory"

    echo ""
    print_info "All prerequisites satisfied!"
}

test_validation_stage() {
    print_header "Stage 1: Validation"

    run_job "validate:env-check" \
        "docker/compose:latest" \
        "Check environment prerequisites"

    run_job "validate:terraform" \
        "hashicorp/terraform:latest" \
        "Validate Terraform configuration"

    run_job "validate:docker compose" \
        "docker/compose:latest" \
        "Validate Docker Compose configuration"
}

test_build_stage() {
    print_header "Stage 2: Build"

    run_job "build:dependencies" \
        "node:18-alpine" \
        "Install Node.js dependencies"

    # Skip docker image build as it takes a long time
    skip_job "build:docker-images" "Takes too long for local testing"
}

test_unit_tests() {
    print_header "Stage 3: Unit Tests"

    # Note: Unit tests may fail in exec mode due to missing dependencies/artifacts
    print_warning "Unit tests may fail due to gitlab-runner exec limitations"

    if [ -d "backend/api-gateway/node_modules" ]; then
        run_job "test:api-gateway-unit" \
            "node:18-alpine" \
            "Run API Gateway unit tests" || true
    else
        skip_job "test:api-gateway-unit" "Dependencies not installed"
    fi
}

print_summary() {
    print_header "Test Summary"

    echo ""
    echo "Results:"
    echo "--------"
    for result in "${RESULTS[@]}"; do
        echo -e "  $result"
    done

    echo ""
    echo "Statistics:"
    echo "-----------"
    echo -e "  ${GREEN}Passed:${NC}  $PASSED"
    echo -e "  ${RED}Failed:${NC}  $FAILED"
    echo -e "  ${YELLOW}Skipped:${NC} $SKIPPED"
    echo -e "  ${BLUE}Total:${NC}   $((PASSED + FAILED + SKIPPED))"
    echo ""

    if [ $FAILED -eq 0 ]; then
        print_success "All tests passed! ✓"
        echo ""
        print_info "Your pipeline is ready to push to GitLab!"
        echo ""
        echo "Next steps:"
        echo "  1. git add .gitlab-ci.yml"
        echo "  2. git commit -m 'Add GitLab CI/CD pipeline'"
        echo "  3. git push origin main"
        echo ""
        return 0
    else
        print_error "Some tests failed. Please fix errors before pushing."
        echo ""
        print_info "Check logs in /tmp/gitlab-runner-*.log"
        echo ""
        return 1
    fi
}

show_help() {
    cat << EOF
GitLab CI Pipeline Local Testing Script

Usage: $0 [OPTIONS]

OPTIONS:
    -a, --all           Run all test stages (default)
    -v, --validate      Run only validation stage
    -b, --build         Run only build stage
    -t, --test          Run only test stage
    -j, --job <name>    Run specific job
    -h, --help          Show this help message

EXAMPLES:
    $0                          # Run all stages
    $0 --validate               # Run only validation stage
    $0 --job validate:terraform # Run specific job

NOTES:
    - gitlab-runner exec has limitations (no artifacts, no caching)
    - Some jobs may fail due to these limitations
    - For full testing, push to a test branch in GitLab

LOGS:
    Test logs are saved to /tmp/gitlab-runner-<job-name>.log

EOF
}

main() {
    local stage="all"
    local specific_job=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -a|--all)
                stage="all"
                shift
                ;;
            -v|--validate)
                stage="validate"
                shift
                ;;
            -b|--build)
                stage="build"
                shift
                ;;
            -t|--test)
                stage="test"
                shift
                ;;
            -j|--job)
                specific_job="$2"
                shift 2
                ;;
            -h|--help)
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
    print_header "GitLab CI Pipeline Local Testing"

    print_info "Testing GitLab CI pipeline locally before pushing..."
    print_warning "Note: gitlab-runner exec has limitations (see --help)"

    # Check prerequisites
    check_prerequisites

    # Run specific job if requested
    if [ -n "$specific_job" ]; then
        print_header "Running Specific Job: $specific_job"

        case $specific_job in
            validate:*)
                run_job "$specific_job" "docker/compose:latest" "Custom validation job"
                ;;
            build:dependencies)
                run_job "$specific_job" "node:18-alpine" "Build dependencies"
                ;;
            build:docker-images)
                run_job "$specific_job" "docker/compose:latest" "Build Docker images"
                ;;
            test:*)
                run_job "$specific_job" "node:18-alpine" "Custom test job"
                ;;
            *)
                print_error "Unknown job: $specific_job"
                exit 1
                ;;
        esac
    else
        # Run stages based on selection
        case $stage in
            all)
                test_validation_stage
                test_build_stage
                test_unit_tests
                ;;
            validate)
                test_validation_stage
                ;;
            build)
                test_build_stage
                ;;
            test)
                test_unit_tests
                ;;
        esac
    fi

    # Print summary
    print_summary
}

# Trap Ctrl+C
trap 'echo ""; print_warning "Testing interrupted"; exit 130' INT

# Run main function
main "$@"
