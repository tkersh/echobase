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
      // Wait a moment for queue to be fully purged
      await new Promise(resolve => setTimeout(resolve, 1000));
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
        const dbUser = await dbHelper.getUserByUsername(user.username);
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
    expect(regResponse.data.token).toBeTruthy();

    // Step 2: Verify user in database
    const dbUser = await dbHelper.getUserByUsername(userData.username);
    expect(dbUser).toBeTruthy();
    expect(dbUser.username).toBe(userData.username);
    expect(dbUser.email).toBe(userData.email);
    const userId = dbUser.id;

    // Step 3: Clear token and login
    apiHelper.clearToken();
    const loginResponse = await apiHelper.login({
      username: userData.username,
      password: userData.password
    });
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.data.token).toBeTruthy();

    // Step 4: Submit order
    const orderData = createValidOrder();
    const orderResponse = await apiHelper.submitOrder(orderData);
    expect(orderResponse.status).toBe(201);
    expect(orderResponse.data.messageId).toBeTruthy();

    // Step 5: Wait for order to be processed and appear in database
    const dbOrder = await dbHelper.waitForOrder(userId, 15000, 500);
    expect(dbOrder).toBeTruthy();
    expect(dbOrder.product_name).toBe(orderData.productName);
    expect(Number(dbOrder.quantity)).toBe(Number(orderData.quantity));
    expect(Number(dbOrder.total_price)).toBeCloseTo(Number(orderData.totalPrice), 2);
    expect(dbOrder.user_id).toBe(userId);
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
    const dbUser = await dbHelper.getUserByUsername(userData.username);
    expect(dbUser).toBeTruthy();
    const userId = dbUser.id;

    // Step 3: Submit order via UI
    const orderData = createValidOrder();
    await page.fill('input[name="productName"]', orderData.productName);
    await page.fill('input[name="quantity"]', orderData.quantity.toString());
    await page.fill('input[name="totalPrice"]', orderData.totalPrice.toString());
    await page.click('button[type="submit"]');

    // Should show success message
    await expect(page.locator('.message.success')).toBeVisible({ timeout: 5000 });

    // Step 4: Wait for order to appear in database
    const dbOrder = await dbHelper.waitForOrder(userId, 15000, 500);
    expect(dbOrder).toBeTruthy();
    expect(dbOrder.product_name).toBe(orderData.productName);
    expect(Number(dbOrder.quantity)).toBe(Number(orderData.quantity));
    expect(Number(dbOrder.total_price)).toBeCloseTo(Number(orderData.totalPrice), 2);
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
    const dbUser = await dbHelper.getUserByUsername(userData.username);
    const userId = dbUser.id;

    // Step 5: Submit order
    const orderData = createValidOrder();
    await page.fill('input[name="productName"]', orderData.productName);
    await page.fill('input[name="quantity"]', orderData.quantity.toString());
    await page.fill('input[name="totalPrice"]', orderData.totalPrice.toString());
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
    const dbUser = await dbHelper.getUserByUsername(userData.username);
    const userId = dbUser.id;

    // Submit 3 orders
    const order1 = createValidOrder();
    const order2 = createValidOrder();
    const order3 = createValidOrder();

    await apiHelper.submitOrder(order1);
    await apiHelper.submitOrder(order2);
    await apiHelper.submitOrder(order3);

    // Wait for all orders to be processed
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Verify all orders in database
    const orders = await dbHelper.getOrdersByUserId(userId);
    expect(orders.length).toBeGreaterThanOrEqual(3);

    // Verify order data
    const orderProducts = orders.map(o => o.product_name);
    expect(orderProducts).toContain(order1.productName);
    expect(orderProducts).toContain(order2.productName);
    expect(orderProducts).toContain(order3.productName);
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

    const dbUser1 = await dbHelper.getUserByUsername(user1.username);
    const dbUser2 = await dbHelper.getUserByUsername(user2.username);

    // Submit orders concurrently
    const order1 = createValidOrder();
    const order2 = createValidOrder();

    await Promise.all([
      apiHelper1.submitOrder(order1),
      apiHelper2.submitOrder(order2)
    ]);

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Verify orders are associated with correct users
    const user1Orders = await dbHelper.getOrdersByUserId(dbUser1.id);
    const user2Orders = await dbHelper.getOrdersByUserId(dbUser2.id);

    expect(user1Orders.length).toBeGreaterThanOrEqual(1);
    expect(user2Orders.length).toBeGreaterThanOrEqual(1);

    expect(user1Orders[0].product_name).toBe(order1.productName);
    expect(user2Orders[0].product_name).toBe(order2.productName);
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
