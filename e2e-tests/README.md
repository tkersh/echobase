# Echobase E2E Test Suite

Comprehensive end-to-end testing suite for the Echobase multi-tier application using Playwright.

## Table of Contents

- [Overview](#overview)
- [Test Coverage](#test-coverage)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Utilities](#utilities)
- [Writing Tests](#writing-tests)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

## Overview

This E2E test suite provides comprehensive testing coverage for the Echobase application, including:

- **API Tests**: Backend API endpoint testing
- **Frontend Tests**: React UI component and page testing
- **Integration Tests**: Full flow testing from UI to database
- **Security Tests**: Security vulnerability and protection testing

**Technology Stack:**
- Playwright for browser automation and API testing
- MySQL2 for database verification
- Jest as the test runner (via Playwright)

## Test Coverage

### API Tests (39 tests)

#### Authentication API (`auth.api.spec.js`)
- User registration (10 tests)
  - Valid registration
  - Duplicate username/email detection
  - Field validation (username, email, password)
  - Password complexity requirements
- User login (6 tests)
  - Valid/invalid credentials
  - Missing fields
  - Error handling
- JWT token validation (4 tests)
  - Valid token acceptance
  - Invalid/missing token rejection

#### Orders API (`orders.api.spec.js`)
- Order submission (11 tests)
  - Valid order creation
  - Authentication requirements
  - Field validation
  - Data type validation
  - Edge cases (negative values, large numbers, decimals)
- Multiple orders (1 test)
- Orders info endpoint (1 test)

### Frontend Tests (30 tests)

#### Registration Page (`registration.frontend.spec.js`)
- Form display and validation
- Successful registration
- Duplicate detection
- Password validation
- Session persistence
- XSS protection
- Input sanitization

#### Login Page (`login.frontend.spec.js`)
- Form display
- Valid/invalid login
- Session persistence
- Error handling
- Password masking
- Navigation

#### Orders Page (`orders.frontend.spec.js`)
- Form display
- Order submission
- Logout functionality
- Protected route access
- Field validation
- Special characters handling
- Multiple consecutive orders

### Integration Tests (8 tests)

#### Full Flow (`full-flow.integration.spec.js`)
- Complete registration → login → order flow
- UI and API flows
- Logout and re-login
- Multiple orders per user
- Concurrent orders from multiple users
- Session persistence across page refreshes

#### Async Processing (`async-processing.integration.spec.js`)
- SQS queue processing
- Database persistence
- Multiple order processing
- Different data types (decimals, large numbers)
- Special characters preservation
- Multi-user order isolation
- Timestamp verification
- Rapid consecutive submissions

### Security Tests (25+ tests)

#### SQL Injection Protection
- Username field
- Login credentials
- Order product name

#### XSS Protection
- Registration form
- Order form

#### Authentication & Authorization
- Token requirement
- Token validation
- Protected routes

#### Input Validation
- Password complexity
- Email format
- Required fields
- Negative values

#### Security Headers & HTTPS
- HTTPS enforcement
- Security headers verification

#### Error Handling
- Information leakage prevention
- Graceful error handling

#### Session Management
- Session cleanup on logout
- Token invalidation

#### Rate Limiting
- Excessive request protection

**Total: 100+ E2E tests**

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ installed
- Services running via `docker compose up`
- Database initialized with schema

## Installation

### Automated Setup

Run the setup script to install dependencies and verify the environment:

```bash
cd e2e-tests
../e2e-tests/scripts/setup-tests.sh
```

### Manual Setup

1. Navigate to the e2e-tests directory:
```bash
cd e2e-tests
```

2. Install dependencies:
```bash
npm install
```

3. Install Playwright browsers:
```bash
npx playwright install chromium
```

4. Ensure services are running:
```bash
cd ..
docker compose up -d
```

5. Wait for services to be healthy (check logs):
```bash
docker compose logs -f
```

## Running Tests

### All Tests

```bash
# Using the comprehensive script (recommended)
./scripts/run-all-tests.sh

# Or manually
npm test
```

### Test Categories

```bash
# API tests only
npm run test:api

# Frontend tests only
npm run test:frontend

# Integration tests only
npm run test:integration

# Security tests only
npm run test:security
```

### Interactive Mode

```bash
# UI Mode (recommended for development)
npm run test:ui

# Headed mode (see browser)
npm run test:headed

# Debug mode
npm run test:debug
```

### Specific Test Files

```bash
# Run a specific test file
npx playwright test tests/api/auth.api.spec.js

# Run tests matching a pattern
npx playwright test --grep "registration"

# Run a specific test
npx playwright test --grep "should register a new user"
```

### View Test Reports

```bash
npm run report
```

## Test Structure

```
e2e-tests/
├── config/                           # Centralized configuration
│   └── test-config.js                # Configuration constants
├── fixtures/                         # Playwright fixtures
│   └── test-fixtures.js              # Reusable test fixtures
├── helpers/                          # Test helper functions
│   └── test-helpers.js               # Common workflows
├── tests/
│   ├── api/                          # API tests
│   │   ├── auth.api.spec.js          # Authentication tests
│   │   └── orders.api.spec.js        # Orders API tests
│   ├── frontend/                     # Frontend UI tests
│   │   ├── registration.frontend.spec.js
│   │   ├── login.frontend.spec.js
│   │   └── orders.frontend.spec.js
│   ├── integration/                  # Full flow tests
│   │   ├── full-flow.integration.spec.js
│   │   └── async-processing.integration.spec.js
│   └── security/                     # Security tests (split by concern)
│       ├── sql-injection.security.spec.js
│       ├── xss-protection.security.spec.js
│       ├── authentication.security.spec.js
│       ├── input-validation.security.spec.js
│       ├── https-security.security.spec.js
│       ├── error-handling.security.spec.js
│       ├── session-management.security.spec.js
│       └── rate-limiting.security.spec.js
├── utils/                            # Test utilities
│   ├── db-helper.js                  # Database operations
│   ├── api-helper.js                 # API client
│   └── test-data.js                  # Test data generators
├── scripts/                          # Helper scripts
│   ├── common.sh                     # Shared shell functions
│   ├── setup-tests.sh                # Environment setup
│   ├── cleanup-tests.sh              # Cleanup test data
│   └── run-all-tests.sh              # Run all tests
├── playwright.config.js              # Playwright configuration
├── package.json
└── README.md
```

## Test Fixtures and Helpers

### Using Fixtures (`fixtures/test-fixtures.js`)

The test suite includes Playwright fixtures that automatically handle setup and teardown, eliminating repetitive boilerplate code:

```javascript
import { test, expect } from '../fixtures/test-fixtures.js';

test.describe('My Tests', () => {
  test('example test', async ({ apiHelper, dbHelper, testUsers }) => {
    // dbHelper is already connected, will auto-disconnect after test
    // apiHelper provides API methods
    // testUsers array automatically cleans up users after test

    const userData = createValidUser();
    testUsers.push(userData);  // Tracked for automatic cleanup

    await apiHelper.register(userData);
    const dbUser = await dbHelper.getUserByUsername(userData.username);

    expect(dbUser).toBeTruthy();
    // No manual cleanup needed - fixture handles it!
  });
});
```

**Available Fixtures:**
- `dbHelper` - Database helper with automatic connect/disconnect
- `apiHelper` - API interaction helper
- `testUsers` - Array for tracking test users (auto-cleanup after each test)

### Test Helper Functions (`helpers/test-helpers.js`)

Common test workflows extracted into reusable helpers:

```javascript
import {
  registerUser,
  registerAndLoginUser,
  submitAndWaitForOrder,
  verifyOrderMatches,
  loginViaUI,
  submitOrderViaUI,
  purgeSQSQueue
} from '../helpers/test-helpers.js';

// Register a user with automatic tracking
const { userData, dbUser, regResponse } =
  await registerUser(apiHelper, dbHelper, testUsers);

// Register and login in one step
const { userData, token, dbUser } =
  await registerAndLoginUser(apiHelper, dbHelper, testUsers);

// Submit order and wait for async processing
const { dbOrder, orderData } =
  await submitAndWaitForOrder(apiHelper, dbHelper, userId);

// Verify order matches submitted data
verifyOrderMatches(dbOrder, orderData);

// UI helper functions
await loginViaUI(page, credentials);
await submitOrderViaUI(page, orderData);

// SQS queue management
await purgeSQSQueue();
```

### Configuration (`config/test-config.js`)

Centralized configuration eliminates magic numbers and hardcoded values:

```javascript
import { TEST_CONFIG } from '../config/test-config.js';

// Use configuration constants
await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT_WAIT);
expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CREATED);

const queueUrl = TEST_CONFIG.SQS_QUEUE_URL;
const containerName = TEST_CONFIG.LOCALSTACK_CONTAINER_NAME;
```

**Available Configuration:**
- `LOCALSTACK_CONTAINER_NAME` - Docker container name
- `SQS_QUEUE_URL` - SQS queue URL
- `API_URL`, `FRONTEND_URL` - Service URLs
- `DB_*` - Database connection settings
- `TIMEOUTS.*` - Standard timeout values
- `HTTP_STATUS.*` - HTTP status code constants

### Shell Scripts (`scripts/common.sh`)

Common shell functions for test scripts:

```bash
source "$(dirname "$0")/common.sh"

# Colored output
print_success "Operation completed successfully"
print_error "Something went wrong"
print_warning "Proceeding with caution"
print_info "For your information"

# Retry with exponential backoff
retry 5 curl -s https://localhost:3001/health

# Wait for service to be ready
wait_for_service "https://localhost:3001/health" 30 "API Gateway"
```

## Utilities

### DatabaseHelper

Provides database access for test verification:

```javascript
import DatabaseHelper from '../utils/db-helper.js';

const dbHelper = new DatabaseHelper();
await dbHelper.connect();

// Get user
const user = await dbHelper.getUserByUsername('testuser');

// Get orders
const orders = await dbHelper.getOrdersByUserId(userId);

// Wait for async processing
const order = await dbHelper.waitForOrder(userId, 15000, 500);

await dbHelper.disconnect();
```

**Available Methods:**
- `getUserByUsername(username)`
- `getUserByEmail(email)`
- `getUserById(userId)`
- `getOrdersByUserId(userId)`
- `getLatestOrderByUserId(userId)`
- `getOrderById(orderId)`
- `getUserCount()`
- `getOrderCount()`
- `deleteUserByUsername(username)`
- `deleteOrdersByUserId(userId)`
- `waitForOrder(userId, maxWaitMs, checkIntervalMs)` - Wait for async order processing
- `query(sql, params)` - Execute custom queries

### ApiHelper

Provides API client for testing:

```javascript
import ApiHelper from '../utils/api-helper.js';

const apiHelper = new ApiHelper();

// Register
const response = await apiHelper.register({
  username: 'testuser',
  email: 'test@example.com',
  fullName: 'Test User',
  password: 'TestPass123'
});

// Login
await apiHelper.login({ username: 'testuser', password: 'TestPass123' });

// Submit order (token automatically included)
await apiHelper.submitOrder({
  productName: 'Test Product',
  quantity: 1,
  totalPrice: 99.99
});

// Clear token
apiHelper.clearToken();

// Custom request
await apiHelper.request('GET', '/api/custom', { data: {} });
```

### Test Data Generators

Generate realistic test data:

```javascript
import {
  generateUsername,
  generateEmail,
  generateValidPassword,
  createValidUser,
  createValidOrder,
  invalidPasswords,
  invalidOrders,
  sqlInjectionPayloads,
  xssPayloads
} from '../utils/test-data.js';

const user = createValidUser();
const order = createValidOrder();

// Custom fields
const customUser = createValidUser({ fullName: 'Custom Name' });
const customOrder = createValidOrder({ quantity: 100 });
```

## Writing Tests

### Basic Test Structure

```javascript
import { test, expect } from '@playwright/test';
import DatabaseHelper from '../../utils/db-helper.js';
import ApiHelper from '../../utils/api-helper.js';
import { createValidUser, createValidOrder } from '../../utils/test-data.js';

test.describe('My Test Suite', () => {
  let dbHelper;
  let apiHelper;
  const testUsers = [];

  test.beforeEach(async () => {
    dbHelper = new DatabaseHelper();
    apiHelper = new ApiHelper();
    await dbHelper.connect();
  });

  test.afterEach(async () => {
    // Cleanup test users
    for (const user of testUsers) {
      const dbUser = await dbHelper.getUserByUsername(user.username);
      if (dbUser) {
        await dbHelper.deleteOrdersByUserId(dbUser.id);
        await dbHelper.deleteUserByUsername(user.username);
      }
    }
    testUsers.length = 0;
    await dbHelper.disconnect();
  });

  test('my test', async () => {
    const userData = createValidUser();
    testUsers.push(userData);

    // Test implementation
    const response = await apiHelper.register(userData);
    expect(response.status).toBe(201);
  });
});
```

### Frontend Test Example

```javascript
test('should display and submit form', async ({ page }) => {
  await page.goto('/orders');

  // Fill form
  await page.fill('input[name="productName"]', 'Test Product');
  await page.fill('input[name="quantity"]', '1');
  await page.fill('input[name="totalPrice"]', '99.99');

  // Submit
  await page.click('button[type="submit"]');

  // Verify
  await expect(page.locator('text=/success/i')).toBeVisible();
});
```

### Integration Test Example

```javascript
test('should complete full flow', async ({ page }) => {
  const userData = createValidUser();
  testUsers.push(userData);

  // Register
  await page.goto('/register');
  await page.fill('input[name="username"]', userData.username);
  // ... fill other fields
  await page.click('button[type="submit"]');

  // Verify in database
  const dbUser = await dbHelper.getUserByUsername(userData.username);
  expect(dbUser).toBeTruthy();

  // Submit order
  const orderData = createValidOrder();
  await page.fill('input[name="productName"]', orderData.productName);
  // ... fill other fields
  await page.click('button[type="submit"]');

  // Wait for async processing
  const dbOrder = await dbHelper.waitForOrder(dbUser.id, 15000, 500);
  expect(dbOrder).toBeTruthy();
  expect(dbOrder.product_name).toBe(orderData.productName);
});
```

## Best Practices

1. **Always clean up test data** in `afterEach` hooks
2. **Use unique test data** for each test (use generators)
3. **Test realistic scenarios** not just happy paths
4. **Verify database state** for integration tests
5. **Use appropriate timeouts** for async operations
6. **Don't hardcode sensitive data** - use environment variables if needed
7. **Run tests serially** (configured) to avoid race conditions
8. **Use descriptive test names** that explain what's being tested

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Start services
        run: docker compose up -d

      - name: Wait for services
        run: |
          timeout 60 bash -c 'until curl -k -s https://localhost:3001/health > /dev/null; do sleep 2; done'

      - name: Install dependencies
        working-directory: e2e-tests
        run: npm install

      - name: Install Playwright browsers
        working-directory: e2e-tests
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        working-directory: e2e-tests
        run: npm test

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: e2e-tests/test-results/
```

## Troubleshooting

### Services not starting

```bash
# Check service logs
docker compose logs

# Restart services
docker compose down
docker compose up -d
```

### Database connection errors

```bash
# Verify database is running
docker compose ps mariadb

# Check database logs
docker compose logs mariadb

# Test connection
docker compose exec mariadb mysql -u root -prootpassword -e "USE ordersdb; SELECT 1;"
```

### SSL/TLS certificate errors

The tests use `ignoreHTTPSErrors: true` in Playwright config to handle self-signed certificates.

### Tests timing out

- Increase timeouts in `playwright.config.js`
- Check if order processor is running: `docker compose logs order-processor`
- Verify SQS is healthy in Localstack

### Cleanup test data manually

```bash
./scripts/cleanup-tests.sh
```

### View browser during tests

```bash
npm run test:headed
```

### Debug specific test

```bash
npm run test:debug -- --grep "test name"
```

## Environment Variables

Create a `.env` file in the `e2e-tests` directory if you need custom configuration:

```env
# API Configuration
API_BASE_URL=https://localhost:3001
BASE_URL=https://localhost:3443

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=rootpassword
DB_NAME=ordersdb
```

## Contributing

When adding new tests:

1. Follow the existing file structure
2. Use the helper utilities
3. Add proper cleanup in `afterEach`
4. Update this README if adding new test categories
5. Ensure tests can run independently

## License

Same as the main Echobase project.
