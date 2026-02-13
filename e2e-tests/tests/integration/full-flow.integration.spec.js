import { test, expect } from '@playwright/test';
import DatabaseHelper from '../../utils/db-helper.js';
import ApiHelper from '../../utils/api-helper.js';
import { createValidUser, createValidOrder } from '../../utils/test-data.js';
import { execSync } from 'child_process';

test.describe('Full End-to-End Integration Tests', () => {
  let dbHelper;
  let apiHelper;
  const testUsers = [];

  // Purge SQS queue once before all tests to clear any backlog from previous runs
  test.beforeAll(async () => {
    try {
      execSync(
        'docker exec echobase-localstack-1 awslocal sqs purge-queue --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/order-processing-queue',
        { stdio: 'ignore' }
      );
      // Brief pause for purge propagation
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.warn('Failed to purge SQS queue (this may be okay if queue is already empty):', error.message);
    }
  });

  test.beforeEach(async () => {
    dbHelper = new DatabaseHelper();
    apiHelper = new ApiHelper();
    await dbHelper.connect();
  });

  test.afterEach(async () => {
    // Cleanup
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
    testUsers.length = 0;
    await dbHelper.disconnect();
  });

  test('should complete full registration, login, and order flow via API', async () => {
    const userData = createValidUser();
    testUsers.push(userData);

    // Step 1: Register user
    const regResponse = await apiHelper.register(userData);
    expect(regResponse.status).toBe(201);
    expect(apiHelper.getCookies().length).toBeGreaterThan(0);

    // Step 2: Verify user in database
    const dbUser = await dbHelper.waitForUser(userData.username);
    expect(dbUser).toBeTruthy();
    expect(dbUser.username).toBe(userData.username);
    expect(dbUser.email).toBe(userData.email);
    const userId = dbUser.id;

    // Step 3: Clear token and login
    await apiHelper.clearToken();
    const loginResponse = await apiHelper.login({
      username: userData.username,
      password: userData.password
    });
    expect(loginResponse.status).toBe(200);
    expect(apiHelper.getCookies().length).toBeGreaterThan(0);

    // Step 4: Submit order
    const orderData = createValidOrder();
    const orderResponse = await apiHelper.submitOrder(orderData);
    expect(orderResponse.status).toBe(201);
    expect(orderResponse.data.messageId).toBeTruthy();

    // Step 5: Wait for order to be processed and appear in database
    const dbOrder = await dbHelper.waitForOrder(userId, 15000, 500);
    expect(dbOrder).toBeTruthy();
    expect(dbOrder.product_id).toBe(orderData.productId);
    expect(dbOrder.product_name).toBeTruthy();
    expect(Number(dbOrder.quantity)).toBe(Number(orderData.quantity));
    expect(dbOrder.user_id).toBe(userId);
    expect(dbOrder.sku).toBeTruthy();

    // Verify server-calculated total price = product cost * quantity
    const product = await dbHelper.getProductById(orderData.productId);
    const expectedTotal = parseFloat((product.cost * orderData.quantity).toFixed(2));
    expect(Number(dbOrder.total_price)).toBeCloseTo(expectedTotal, 2);
  });

  test('should complete full flow via UI', async ({ page }) => {
    const userData = createValidUser();
    testUsers.push(userData);

    // Step 1: Register via UI
    await page.goto('/register');
    await page.fill('input[name="username"]', userData.username);
    await page.fill('input[name="email"]', userData.email);
    await page.fill('input[name="fullName"]', userData.fullName);
    await page.fill('input[name="password"]', userData.password);
    await page.fill('input[name="confirmPassword"]', userData.password);
    await page.click('button[type="submit"]');

    // Should redirect to orders
    await expect(page).toHaveURL(/\/orders/);

    // Step 2: Verify user in database
    const dbUser = await dbHelper.waitForUser(userData.username);
    expect(dbUser).toBeTruthy();
    const userId = dbUser.id;

    // Step 3: Submit order via UI - select from dropdown
    // Wait for products to load
    await expect(page.locator('select[name="productName"] option')).not.toHaveCount(1, { timeout: 5000 });

    await page.selectOption('select[name="productName"]', { index: 1 });
    await page.fill('input[name="quantity"]', '2');
    await page.click('button[type="submit"]');

    // Should show success message
    await expect(page.locator('.message.success')).toBeVisible({ timeout: 5000 });

    // Step 4: Wait for order to appear in database
    const dbOrder = await dbHelper.waitForOrder(userId, 15000, 500);
    expect(dbOrder).toBeTruthy();
    expect(dbOrder.product_id).toBeTruthy();
    expect(dbOrder.sku).toBeTruthy();
    expect(Number(dbOrder.quantity)).toBe(2);
  });

  test('should handle register, logout, login, and order flow', async ({ page }) => {
    const userData = createValidUser();
    testUsers.push(userData);

    // Step 1: Register
    await page.goto('/register');
    await page.fill('input[name="username"]', userData.username);
    await page.fill('input[name="email"]', userData.email);
    await page.fill('input[name="fullName"]', userData.fullName);
    await page.fill('input[name="password"]', userData.password);
    await page.fill('input[name="confirmPassword"]', userData.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/orders/);

    // Step 2: Logout
    await page.click('button:has-text("Logout")');
    await expect(page).toHaveURL(/\/$|\/login/);

    // Step 3: Login again
    await page.fill('input[name="username"]', userData.username);
    await page.fill('input[name="password"]', userData.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/orders/);

    // Step 4: Get user from DB
    const dbUser = await dbHelper.waitForUser(userData.username);
    expect(dbUser).toBeTruthy();
    const userId = dbUser.id;

    // Step 5: Submit order via dropdown
    await expect(page.locator('select[name="productName"] option')).not.toHaveCount(1, { timeout: 5000 });
    await page.selectOption('select[name="productName"]', { index: 1 });
    await page.fill('input[name="quantity"]', '1');
    await page.click('button[type="submit"]');

    await expect(page.locator('.message.success')).toBeVisible({ timeout: 5000 });

    // Step 6: Verify order in database
    const dbOrder = await dbHelper.waitForOrder(userId, 15000, 500);
    expect(dbOrder).toBeTruthy();
  });

  test('should process multiple orders from the same user', async () => {
    const userData = createValidUser();
    testUsers.push(userData);

    // Register
    await apiHelper.register(userData);
    const dbUser = await dbHelper.waitForUser(userData.username);
    expect(dbUser).toBeTruthy();
    const userId = dbUser.id;

    // Submit 3 orders with different products
    const order1 = createValidOrder({ productId: 1 });
    const order2 = createValidOrder({ productId: 2 });
    const order3 = createValidOrder({ productId: 3 });

    await apiHelper.submitOrder(order1);
    await apiHelper.submitOrder(order2);
    await apiHelper.submitOrder(order3);

    // Wait for all orders to be processed
    const orders = await dbHelper.waitForOrders(userId, 3, 30000);
    expect(orders).toBeTruthy();
    expect(orders.length).toBeGreaterThanOrEqual(3);

    // Verify order data - check product IDs
    const orderProductIds = orders.map(o => o.product_id);
    expect(orderProductIds).toContain(1);
    expect(orderProductIds).toContain(2);
    expect(orderProductIds).toContain(3);
  });

  test('should handle concurrent orders from different users', async () => {
    const user1 = createValidUser();
    const user2 = createValidUser();
    testUsers.push(user1, user2);

    // Register both users
    const apiHelper1 = new ApiHelper();
    const apiHelper2 = new ApiHelper();

    await apiHelper1.register(user1);
    await apiHelper2.register(user2);

    const dbUser1 = await dbHelper.waitForUser(user1.username);
    const dbUser2 = await dbHelper.waitForUser(user2.username);

    expect(dbUser1).toBeTruthy();
    expect(dbUser2).toBeTruthy();

    // Submit orders concurrently with different products
    const order1 = createValidOrder({ productId: 1 });
    const order2 = createValidOrder({ productId: 2 });

    await Promise.all([
      apiHelper1.submitOrder(order1),
      apiHelper2.submitOrder(order2)
    ]);

    // Wait for processing
    await dbHelper.waitForOrders(dbUser1.id, 1, 30000);
    await dbHelper.waitForOrders(dbUser2.id, 1, 30000);

    // Verify orders are associated with correct users
    const user1Orders = await dbHelper.getOrdersByUserId(dbUser1.id);
    const user2Orders = await dbHelper.getOrdersByUserId(dbUser2.id);

    expect(user1Orders.length).toBeGreaterThanOrEqual(1);
    expect(user2Orders.length).toBeGreaterThanOrEqual(1);

    expect(user1Orders[0].product_id).toBe(1);
    expect(user2Orders[0].product_id).toBe(2);
  });

  test('should preserve session across page refreshes', async ({ page }) => {
    const userData = createValidUser();
    testUsers.push(userData);

    // Register
    await page.goto('/register');
    await page.fill('input[name="username"]', userData.username);
    await page.fill('input[name="email"]', userData.email);
    await page.fill('input[name="fullName"]', userData.fullName);
    await page.fill('input[name="password"]', userData.password);
    await page.fill('input[name="confirmPassword"]', userData.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/orders/);

    // Refresh page
    await page.reload();

    // Should still be on orders page
    await expect(page).toHaveURL(/\/orders/);
    await expect(page.locator('h1')).toContainText('Echobase Order System');
  });

  test('should reject order submission from unauthenticated user after logout', async ({ page }) => {
    const userData = createValidUser();
    testUsers.push(userData);

    // Register and login
    await page.goto('/register');
    await page.fill('input[name="username"]', userData.username);
    await page.fill('input[name="email"]', userData.email);
    await page.fill('input[name="fullName"]', userData.fullName);
    await page.fill('input[name="password"]', userData.password);
    await page.fill('input[name="confirmPassword"]', userData.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/orders/);

    // Logout
    await page.click('button:has-text("Logout")');
    await expect(page).toHaveURL(/\/$|\/login/);

    // Try to access orders page directly
    await page.goto('/orders');

    // Should redirect to login
    await expect(page).toHaveURL(/\/$|\/login/);
  });
});
