#!/bin/bash

# Run all E2E tests with proper setup and teardown
# This script runs from the project root and uses the root .env file

set -e

echo "========================================="
echo "Running Complete E2E Test Suite"
echo "========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Ensure we're in project root
cd "$(dirname "$0")" || exit

# Check .env exists
if [ ! -f ".env" ]; then
    print_error ".env file not found in project root"
    exit 1
fi

# Setup environment
echo ""
echo "Step 1: Setting up test environment..."
bash "./e2e-tests/scripts/setup-tests.sh" || {
    print_error "Setup failed"
    exit 1
}

# Run tests
echo ""
echo "Step 2: Running tests..."
cd e2e-tests || exit

# Run tests and capture exit code
set +e
npm test
TEST_EXIT_CODE=$?
set -e

# Generate report
if [ $TEST_EXIT_CODE -eq 0 ]; then
    print_success "All tests passed!"
else
    print_error "Some tests failed"
fi

# Show report location
echo ""
echo "Test report available at:"
echo "  $(pwd)/playwright-report/index.html"
echo ""
echo "View report with:"
echo "  cd e2e-tests && npm run report"
echo ""

# Return to project root for cleanup
cd ..

# Cleanup
echo "Step 3: Cleaning up test data..."
bash "./e2e-tests/scripts/cleanup-tests.sh" || {
    print_error "Cleanup failed"
}

exit $TEST_EXIT_CODE