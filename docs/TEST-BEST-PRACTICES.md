# Test Best Practices

This document outlines the best practices for writing and maintaining E2E tests in the Echobase project.

## Database Interaction Patterns

### Use Async-Safe Helpers

**Always use `waitForUser()` instead of `getUserByUsername()`** when testing user registration flows:

```javascript
// ❌ BAD - Race condition prone
const dbUser = await dbHelper.getUserByUsername(userData.username);
if (dbUser) {  // May fail if DB hasn't committed yet
  const userId = dbUser.id;
}

// ✅ GOOD - Waits for user to appear
const dbUser = await dbHelper.waitForUser(userData.username);
expect(dbUser).toBeTruthy();  // Explicit assertion
const userId = dbUser.id;
```

**Always use `waitForOrder()` instead of `getLatestOrderByUserId()`** when testing order processing:

```javascript
// ❌ BAD - Race condition prone
const order = await dbHelper.getLatestOrderByUserId(userId);
if (order) {  // May fail if async processing hasn't completed
  expect(order.product_name).toBe(orderData.productName);
}

// ✅ GOOD - Waits for order to be processed
const dbOrder = await dbHelper.waitForOrder(userId, 15000, 500);
expect(dbOrder).toBeTruthy();  // Explicit assertion
expect(dbOrder.product_name).toBe(orderData.productName);
```

### Always Assert After Wait Operations

Never assume wait operations will succeed - always add explicit assertions:

```javascript
// ❌ BAD - Silent failure if user not found
const dbUser = await dbHelper.waitForUser(userData.username);
const userId = dbUser.id;  // Will throw if dbUser is null

// ✅ GOOD - Explicit failure with clear message
const dbUser = await dbHelper.waitForUser(userData.username);
expect(dbUser).toBeTruthy();  // Clear test failure
const userId = dbUser.id;
```

### Customize Timeouts for Different Operations

Use appropriate timeouts based on the operation:

```javascript
// User registration - usually fast (default 5s)
const dbUser = await dbHelper.waitForUser(userData.username);

// Order processing - slower due to SQS (15s recommended)
const dbOrder = await dbHelper.waitForOrder(userId, 15000, 500);

// Multiple concurrent operations - longer timeout
await new Promise(resolve => setTimeout(resolve, 10000));
const orders = await dbHelper.getOrdersByUserId(userId);
```

## Test Cleanup Patterns

### Track All Created Resources

Use arrays to track test resources for cleanup:

```javascript
test.describe('My Tests', () => {
  const testUsers = [];  // Track for cleanup

  test.afterEach(async () => {
    // Cleanup all created resources
    for (const user of testUsers) {
      try {
        const dbUser = await dbHelper.waitForUser(user.username);
        if (dbUser) {
          await dbHelper.deleteOrdersByUserId(dbUser.id);
          await dbHelper.deleteUserByUsername(user.username);
        }
      } catch (e) {
        console.error(`Cleanup error:`, e.message);
      }
    }
    testUsers.length = 0;  // Clear array
    await dbHelper.disconnect();
  });

  test('my test', async () => {
    const userData = createValidUser();
    testUsers.push(userData);  // Track immediately
    // ... rest of test
  });
});
```

### Clean Up in Correct Order

Always delete child records before parent records:

```javascript
// ✅ CORRECT ORDER
await dbHelper.deleteOrdersByUserId(dbUser.id);  // Delete orders first
await dbHelper.deleteUserByUsername(user.username);  // Then delete user

// ❌ WRONG ORDER - Will fail due to foreign key constraint
await dbHelper.deleteUserByUsername(user.username);
await dbHelper.deleteOrdersByUserId(dbUser.id);  // User already deleted!
```

## SQS Queue Management

### Purge Queue Before Tests

Clear the SQS queue before test suites to avoid backlog from previous runs:

```javascript
test.beforeAll(async () => {
  try {
    execSync(
      'docker exec echobase-devlocal-localstack awslocal sqs purge-queue --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/order-processing-queue',
      { stdio: 'ignore' }
    );
    // Wait for queue to be fully purged
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    console.warn('Failed to purge SQS queue (this may be okay if queue is already empty):', error.message);
  }
});
```

## Concurrent Testing Patterns

### Use Separate Helper Instances

When testing concurrent operations, create separate helper instances:

```javascript
test('should handle concurrent orders from different users', async () => {
  const user1 = createValidUser();
  const user2 = createValidUser();
  testUsers.push(user1, user2);

  // Create separate API helpers for each user
  const apiHelper1 = new ApiHelper();
  const apiHelper2 = new ApiHelper();

  await apiHelper1.register(user1);
  await apiHelper2.register(user2);

  // Submit orders concurrently
  await Promise.all([
    apiHelper1.submitOrder(order1),
    apiHelper2.submitOrder(order2)
  ]);
});
```

## Database Connection Management

### Connect/Disconnect Per Test

Always connect in `beforeEach` and disconnect in `afterEach`:

```javascript
test.beforeEach(async () => {
  dbHelper = new DatabaseHelper();
  apiHelper = new ApiHelper();
  await dbHelper.connect();  // Connect before each test
});

test.afterEach(async () => {
  // ... cleanup ...
  await dbHelper.disconnect();  // Always disconnect
});
```

### Never Reuse Connections Across Tests

Each test should have a fresh database connection to avoid state leakage.

## Test Data Generation

### Use Factory Functions

Always use factory functions for consistent test data:

```javascript
import { createValidUser, createValidOrder } from '../../utils/test-data.js';

test('my test', async () => {
  const userData = createValidUser();  // Generates unique data
  const orderData = createValidOrder();  // Generates unique data
});
```

### Generate Unique Data Per Test

Never hardcode usernames, emails, or other unique fields:

```javascript
// ❌ BAD - Will fail if run multiple times
const userData = {
  username: 'testuser',
  email: 'test@example.com'
};

// ✅ GOOD - Unique every time
const userData = createValidUser();  // Uses timestamps and random data
```

## API vs UI Testing

### API Tests for Data Flow

Use API tests when verifying data flow and business logic:

```javascript
test('should complete full registration, login, and order flow via API', async () => {
  // Direct API calls - fast and reliable
  const regResponse = await apiHelper.register(userData);
  expect(regResponse.status).toBe(201);

  const loginResponse = await apiHelper.login({
    username: userData.username,
    password: userData.password
  });
  expect(loginResponse.status).toBe(200);
});
```

### UI Tests for User Workflows

Use UI tests when verifying end-user workflows:

```javascript
test('should complete full flow via UI', async ({ page }) => {
  // Simulate actual user interactions
  await page.goto('/register');
  await page.fill('input[name="username"]', userData.username);
  await page.click('button[type="submit"]');

  // Verify UI state
  await expect(page).toHaveURL(/\/orders/);
});
```

## Common Pitfalls to Avoid

### 1. Forgetting to Wait for Async Operations

```javascript
// ❌ BAD
await apiHelper.submitOrder(orderData);
const orders = await dbHelper.getOrdersByUserId(userId);  // May be empty!

// ✅ GOOD
await apiHelper.submitOrder(orderData);
const dbOrder = await dbHelper.waitForOrder(userId, 15000, 500);
```

### 2. Not Handling Cleanup Errors

```javascript
// ❌ BAD - One cleanup error breaks all others
test.afterEach(async () => {
  for (const user of testUsers) {
    const dbUser = await dbHelper.waitForUser(user.username);
    await dbHelper.deleteOrdersByUserId(dbUser.id);  // Throws if null!
  }
});

// ✅ GOOD - Continue cleanup even if one fails
test.afterEach(async () => {
  for (const user of testUsers) {
    try {
      const dbUser = await dbHelper.waitForUser(user.username);
      if (dbUser) {
        await dbHelper.deleteOrdersByUserId(dbUser.id);
        await dbHelper.deleteUserByUsername(user.username);
      }
    } catch (e) {
      console.error(`Cleanup error:`, e.message);
    }
  }
});
```

### 3. Using Wrong Database Reference

```javascript
// ❌ BAD - Old container name
execSync('docker exec mariadb ...');

// ✅ GOOD - Durable container name
execSync('docker exec echobase-devlocal-durable-mariadb ...');
```

### 4. Hardcoding Environment Values

```javascript
// ❌ BAD - Only works in one environment
const config = {
  host: 'localhost',
  user: 'app_user',
  password: 'hardcoded123'
};

// ✅ GOOD - Uses environment variables
const config = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'app_user',
  password: process.env.DB_PASSWORD || ''  // No default - must be provided
};
```

## DatabaseHelper Methods Reference

### Query Methods (Direct)
- `getUserByUsername(username)` - Single query, no retry
- `getUserByEmail(email)` - Single query, no retry
- `getUserById(userId)` - Single query, no retry
- `getOrdersByUserId(userId)` - Single query, no retry
- `getLatestOrderByUserId(userId)` - Single query, no retry
- `getOrderById(orderId)` - Single query, no retry

### Wait Methods (With Retry)
- `waitForUser(username, maxWaitMs = 5000, checkIntervalMs = 500)` - Polls until found or timeout
- `waitForOrder(userId, maxWaitMs = 10000, checkIntervalMs = 500)` - Polls until found or timeout

### When to Use Each

**Use Direct Methods When:**
- Querying data you know already exists
- In cleanup operations (afterEach)
- Verifying data integrity after async operations complete

**Use Wait Methods When:**
- After triggering async operations (register, order submission)
- Testing race conditions
- Verifying eventual consistency
- Following Playwright best practices

## Summary

1. **Always use `waitForUser()` and `waitForOrder()`** when testing async operations
2. **Always assert after wait operations** - never assume success
3. **Track all created resources** for cleanup
4. **Clean up in correct order** - children before parents
5. **Use separate helper instances** for concurrent tests
6. **Connect/disconnect per test** - no connection reuse
7. **Use factory functions** - never hardcode test data
8. **Handle cleanup errors gracefully** - wrap in try/catch
9. **Use correct container names** - echobase-devlocal-durable-mariadb
10. **Use environment variables** - never hardcode credentials
