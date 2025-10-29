#!/bin/bash

# Security Test Runner for Echobase
# This script runs all security tests to verify no unauthorized access

set -e

echo "======================================"
echo "Echobase Security Test Suite"
echo "======================================"
echo ""

# Check if Docker containers are running
echo "[1/4] Checking if infrastructure is running..."
if ! docker-compose ps | grep -q "Up"; then
    echo "❌ Error: Docker containers are not running."
    echo "   Please start the infrastructure first:"
    echo "   ./start.sh"
    exit 1
fi
echo "✅ Infrastructure is running"
echo ""

# Check if .env file exists
echo "[2/4] Checking for .env file..."
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found."
    echo "   Please generate credentials first:"
    echo "   ./generate-credentials.sh"
    exit 1
fi
echo "✅ .env file found"
echo ""

# Load environment variables
source .env

# Install test dependencies if not already installed
echo "[3/4] Installing test dependencies..."
cd backend/api-gateway
if [ ! -d "node_modules/jest" ]; then
    echo "   Installing Jest and Supertest..."
    npm install --silent
else
    echo "   Dependencies already installed"
fi
echo ""

# Run security tests
echo "[4/4] Running security tests..."
echo "────────────────────────────────────────"
echo ""

npm test

echo ""
echo "======================================"
echo "Security Test Summary"
echo "======================================"
echo ""
echo "Tests completed. Review the results above."
echo ""
echo "For detailed information on security testing:"
echo "  • Read SECURITY_TESTING.md"
echo "  • Read AUTHENTICATION.md"
echo ""
echo "To run tests manually:"
echo "  cd backend/api-gateway"
echo "  npm test                    # All tests"
echo "  npm run test:security       # Security tests only"
echo ""
