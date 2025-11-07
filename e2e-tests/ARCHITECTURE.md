# E2E Test Architecture

## Overview

The E2E test suite is designed to validate the Echobase application's functionality across all layers: frontend (React), API gateway (Express), message queue (SQS), background processor, and database (MariaDB).

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        E2E Test Suite                           │
│                       (Playwright Tests)                        │
└─────────────────┬──────────────┬────────────────┬──────────────┘
                  │              │                │
         ┌────────▼────┐  ┌─────▼──────┐  ┌─────▼─────────┐
         │ API Tests   │  │  Frontend  │  │  Integration  │
         │             │  │  Tests     │  │  Tests        │
         └────────┬────┘  └─────┬──────┘  └─────┬─────────┘
                  │              │                │
                  │              │                │
         ┌────────▼──────────────▼────────────────▼─────────┐
         │           Application Under Test                 │
         │                                                   │
         │  ┌─────────┐   ┌──────────┐   ┌──────────────┐ │
         │  │ React   │──▶│  Express │──▶│     SQS      │ │
         │  │ Frontend│   │  API     │   │    Queue     │ │
         │  └─────────┘   └──────────┘   └──────┬───────┘ │
         │                                        │         │
         │  ┌──────────────────────┐   ┌─────────▼──────┐ │
         │  │     MariaDB          │◀──│  Background    │ │
         │  │     Database         │   │  Processor     │ │
         │  └──────────────────────┘   └────────────────┘ │
         └───────────────────────────────────────────────┘
                              │
                      ┌───────▼────────┐
                      │  Database      │
                      │  Helper        │
                      │  (Verification)│
                      └────────────────┘
```

## Test Layers

### 1. API Tests

**Purpose**: Test backend API endpoints directly without browser overhead.

**Scope**:
- Authentication (register, login, JWT validation)
- Order submission
- Input validation
- Error handling

**Implementation**:
- Uses Playwright's `request` API
- `ApiHelper` utility for authenticated requests
- Direct HTTP calls to `https://localhost:3001`

**Advantages**:
- Fast execution
- No browser overhead
- Easy to test edge cases
- Direct response validation

### 2. Frontend Tests

**Purpose**: Test React UI components and user interactions.

**Scope**:
- Form rendering and validation
- User workflows (registration, login, order submission)
- Session management
- Client-side validation
- XSS protection

**Implementation**:
- Uses Playwright browser automation
- Navigates to `https://localhost:3443`
- Simulates user interactions
- Validates UI state and feedback

**Advantages**:
- Tests actual user experience
- Validates client-side behavior
- Catches UI bugs
- Tests JavaScript execution

### 3. Integration Tests

**Purpose**: Test complete end-to-end flows across all system components.

**Scope**:
- Full user journeys (register → login → order)
- Async processing verification (SQS → Processor → Database)
- Multi-user scenarios
- Data consistency
- System integration points

**Implementation**:
- Combines browser automation with database verification
- Uses `DatabaseHelper` to verify async processing
- Tests data flow through entire stack
- Validates SQS message processing

**Advantages**:
- Tests real-world scenarios
- Validates system integration
- Catches race conditions
- Verifies async processing

### 4. Security Tests

**Purpose**: Verify security controls and protections.

**Scope**:
- SQL injection prevention
- XSS protection
- Authentication enforcement
- Authorization checks
- Input validation
- HTTPS enforcement
- Security headers
- Error handling (no information leakage)

**Implementation**:
- Tests with malicious payloads
- Validates security headers
- Tests authentication bypass attempts
- Verifies error messages don't leak info

**Advantages**:
- Proactive security testing
- Validates defense mechanisms
- Catches security vulnerabilities
- Ensures compliance

## Test Utilities

### ApiHelper

**Purpose**: Simplify API testing with authentication management.

**Key Features**:
- Automatic token management
- Authenticated and unauthenticated requests
- Request/response helpers
- Reusable for all API tests

**Usage Pattern**:
```javascript
const api = new ApiHelper();
await api.register(userData);  // Token auto-stored
await api.submitOrder(order);  // Token auto-sent
api.clearToken();              // For logout tests
```

### DatabaseHelper

**Purpose**: Verify application state in database.

**Key Features**:
- Direct database access
- User/order queries
- Async operation waiting (`waitForOrder`)
- Cleanup utilities
- Connection pooling

**Usage Pattern**:
```javascript
const db = new DatabaseHelper();
await db.connect();

// Verify async processing
const order = await db.waitForOrder(userId, 15000, 500);
expect(order.product_name).toBe('Test Product');

// Cleanup
await db.deleteOrdersByUserId(userId);
await db.deleteUserByUsername(username);
await db.disconnect();
```

### Test Data Generators

**Purpose**: Create unique, realistic test data.

**Key Features**:
- Unique usernames/emails (timestamp-based)
- Valid password generation
- Order data generation
- Invalid data for negative tests
- Security payloads (SQL injection, XSS)

**Usage Pattern**:
```javascript
const user = createValidUser();  // Guaranteed unique
const order = createValidOrder({ quantity: 100 });  // Custom fields
```

## Test Execution Flow

### 1. Setup Phase

```
setup-tests.sh
  ├─ Verify Docker running
  ├─ Start docker-compose services
  ├─ Wait for database health
  ├─ Wait for API health
  ├─ Wait for frontend health
  ├─ Install npm dependencies
  └─ Install Playwright browsers
```

### 2. Test Execution Phase

```
Playwright Test Runner
  ├─ Load configuration
  ├─ For each test file:
  │   ├─ beforeEach: Setup helpers, connect to DB
  │   ├─ Run test
  │   │   ├─ Create unique test data
  │   │   ├─ Execute test actions
  │   │   ├─ Validate results
  │   │   └─ Track created users for cleanup
  │   └─ afterEach: Cleanup test data, disconnect
  └─ Generate reports
```

### 3. Cleanup Phase

```
cleanup-tests.sh
  ├─ Connect to database
  ├─ Delete test users matching patterns
  ├─ Delete associated orders
  └─ Confirm cleanup
```

## Data Flow Examples

### Registration Flow

```
Frontend Test
  │
  ├─ Fill form → Click submit
  │
  ▼
React App
  │
  ├─ Validate input → POST /api/auth/register
  │
  ▼
Express API
  │
  ├─ Validate → Hash password → Insert user → Generate JWT
  │
  ▼
MariaDB
  │
  ├─ User record created
  │
  ▼
Test Verification
  │
  ├─ Check redirect to /orders
  ├─ Verify token in localStorage
  └─ Verify user in database (DatabaseHelper)
```

### Order Submission Flow (Async)

```
Frontend Test
  │
  ├─ Fill form → Click submit
  │
  ▼
React App
  │
  ├─ Add JWT header → POST /api/orders
  │
  ▼
Express API
  │
  ├─ Validate JWT → Validate input → Send to SQS → Return messageId
  │
  ▼
SQS Queue
  │
  ├─ Message queued
  │
  ▼
Background Processor (async)
  │
  ├─ Poll SQS → Receive message → Verify user exists → Insert order
  │
  ▼
MariaDB
  │
  ├─ Order record created
  │
  ▼
Test Verification
  │
  ├─ Wait for success message in UI
  └─ Wait for order in database (DatabaseHelper.waitForOrder)
      ├─ Poll database every 500ms
      └─ Timeout after 15 seconds
```

## Async Processing Handling

### Challenge

Orders are processed asynchronously through SQS, so they don't appear in the database immediately after API call returns.

### Solution

The `DatabaseHelper.waitForOrder()` method:

```javascript
async waitForOrder(userId, maxWaitMs = 10000, checkIntervalMs = 500) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const order = await this.getLatestOrderByUserId(userId);
    if (order) {
      return order;  // Found!
    }
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }

  return null;  // Timeout
}
```

**Usage**:
```javascript
await apiHelper.submitOrder(orderData);

// Wait up to 15 seconds, checking every 500ms
const dbOrder = await dbHelper.waitForOrder(userId, 15000, 500);
expect(dbOrder).toBeTruthy();
```

## Test Isolation

### Strategy

Each test is isolated to prevent interference:

1. **Unique Test Data**: Timestamp-based usernames/emails
2. **Cleanup Tracking**: `testUsers` array tracks created users
3. **afterEach Cleanup**: Delete all test data after each test
4. **Serial Execution**: Single worker prevents race conditions
5. **Database Transactions**: Each test is independent

### Cleanup Pattern

```javascript
const testUsers = [];

test('my test', async () => {
  const user = createValidUser();
  testUsers.push(user);  // Track for cleanup

  // Test code...
});

test.afterEach(async () => {
  for (const user of testUsers) {
    const dbUser = await dbHelper.getUserByUsername(user.username);
    if (dbUser) {
      await dbHelper.deleteOrdersByUserId(dbUser.id);  // Foreign key constraint
      await dbHelper.deleteUserByUsername(user.username);
    }
  }
  testUsers.length = 0;  // Clear array
});
```

## Performance Considerations

### Test Speed

- **API Tests**: ~50-200ms each (fast)
- **Frontend Tests**: ~1-3s each (browser overhead)
- **Integration Tests**: ~5-20s each (async processing wait)
- **Security Tests**: ~100-500ms each (varies)

### Optimization Strategies

1. **Use API tests** for logic validation
2. **Use frontend tests** for UI-critical paths
3. **Use integration tests** for critical flows
4. **Parallel execution** disabled to prevent race conditions
5. **Single browser instance** reused across tests
6. **Database connection pooling** in helpers

## Error Handling

### Test Failures

Tests fail gracefully with meaningful errors:

```javascript
try {
  const order = await dbHelper.waitForOrder(userId, 15000, 500);
  expect(order).toBeTruthy();
} catch (e) {
  console.error('Order not found in database after 15s');
  throw e;
}
```

### Cleanup Failures

Cleanup errors are logged but don't fail tests:

```javascript
try {
  await dbHelper.deleteUserByUsername(user.username);
} catch (e) {
  console.error(`Cleanup error for user ${user.username}:`, e.message);
  // Continue with next cleanup
}
```

## Extensibility

### Adding New Tests

1. Choose appropriate category (api/frontend/integration/security)
2. Follow naming convention: `*.{category}.spec.js`
3. Use existing utilities (ApiHelper, DatabaseHelper)
4. Implement proper cleanup
5. Update README with test count

### Adding New Utilities

1. Create in `utils/` directory
2. Export as default or named exports
3. Document usage in README
4. Use in multiple test files

### Adding New Test Data

1. Add to `utils/test-data.js`
2. Export for reuse
3. Ensure uniqueness for concurrent tests

## Monitoring and Reporting

### Test Reports

- **HTML Report**: `playwright-report/index.html`
- **JSON Report**: `test-results/results.json`
- **Console Output**: Real-time progress

### Artifacts

- Screenshots on failure
- Video on failure (retained)
- Trace on retry
- Error logs

### Metrics

Track in reports:
- Total tests
- Pass/fail count
- Duration
- Flakiness
- Coverage by category

## Deployment Checklist

- [ ] All services running (`docker-compose ps`)
- [ ] Database initialized (`init-db.sql`)
- [ ] Environment variables set
- [ ] Dependencies installed (`npm install`)
- [ ] Playwright browsers installed
- [ ] Scripts executable (`chmod +x scripts/*.sh`)
- [ ] Test data cleanup configured
- [ ] CI/CD pipeline configured (if applicable)

## Future Enhancements

1. **Visual regression testing** (Playwright screenshots)
2. **Performance testing** (response time assertions)
3. **Accessibility testing** (WCAG compliance)
4. **Mobile testing** (responsive design)
5. **Load testing** (concurrent user simulation)
6. **API contract testing** (OpenAPI validation)
7. **Network error simulation** (offline scenarios)
8. **Database migration testing**
