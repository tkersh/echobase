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

# Run E2E tests
echo ""
echo "Step 2: Running E2E tests..."
cd e2e-tests || exit

# Run tests and capture exit code
set +e
npm test
E2E_EXIT_CODE=$?
set -e

# Generate report
if [ $E2E_EXIT_CODE -eq 0 ]; then
    print_success "All E2E tests passed!"
else
    print_error "Some E2E tests failed"
fi

# Show report location and open in browser
echo ""
echo "E2E test report available at:"
echo "  $(pwd)/playwright-report/index.html"
echo ""

# Open report in browser
if [ -f "playwright-report/index.html" ]; then
    echo "Opening E2E test report in browser..."
    if command -v open &> /dev/null; then
        # macOS
        open playwright-report/index.html
    elif command -v xdg-open &> /dev/null; then
        # Linux
        xdg-open playwright-report/index.html
    elif command -v start &> /dev/null; then
        # Windows (Git Bash)
        start playwright-report/index.html
    else
        echo "Could not automatically open browser. View report with:"
        echo "  cd e2e-tests && npm run report"
    fi
    echo ""
fi

# Return to project root for security tests
cd ..

# Run security tests
echo "Step 3: Running security tests..."
set +e
bash "./test-security.sh"
SECURITY_EXIT_CODE=$?
set -e

if [ $SECURITY_EXIT_CODE -eq 0 ]; then
    print_success "All security tests passed!"
else
    print_error "Some security tests failed"
fi
echo ""

# Cleanup
echo "Step 4: Cleaning up test data..."
bash "./e2e-tests/scripts/cleanup-tests.sh" || {
    print_error "Cleanup failed"
}

# Exit with failure if either test suite failed
if [ $E2E_EXIT_CODE -ne 0 ] || [ $SECURITY_EXIT_CODE -ne 0 ]; then
    echo ""
    print_error "Test suite failed!"
    echo "  E2E Tests: $([ $E2E_EXIT_CODE -eq 0 ] && echo '✓ PASSED' || echo '✗ FAILED')"
    echo "  Security Tests: $([ $SECURITY_EXIT_CODE -eq 0 ] && echo '✓ PASSED' || echo '✗ FAILED')"
    echo ""
    exit 1
else
    echo ""
    print_success "All test suites passed!"
    echo "  E2E Tests: ✓ PASSED"
    echo "  Security Tests: ✓ PASSED"
    echo ""
    exit 0
fi