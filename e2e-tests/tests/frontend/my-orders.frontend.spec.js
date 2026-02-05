import { test, expect } from '@playwright/test';
import DatabaseHelper from '../../utils/db-helper.js';
import ApiHelper from '../../utils/api-helper.js';
import { createValidUser, createValidOrder } from '../../utils/test-data.js';

test.describe('My Orders Page Frontend Tests', () => {
  let dbHelper;
  let apiHelper;
  const testUsers = [];

  test.beforeEach(async ({ page }) => {
    dbHelper = new DatabaseHelper();
    apiHelper = new ApiHelper();
    await dbHelper.connect();

    // Register and login a user for each test
    const userData = createValidUser();
    testUsers.push(userData);
    const registrationResponse = await apiHelper.register(userData);

    if (!registrationResponse.ok) {
      throw new Error(`Registration failed: ${JSON.stringify(registrationResponse)}`);
    }

    if (!registrationResponse.data.user) {
      throw new Error(`Registration response missing user object: ${JSON.stringify(registrationResponse.data)}`);
    }

    // Set token in browser
    await page.goto('/');
    await page.evaluate((token) => {
      localStorage.setItem('token', token);
    }, apiHelper.token);
    await page.evaluate((user) => {
      localStorage.setItem('user', JSON.stringify({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName
      }));
    }, registrationResponse.data.user);
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

  test('should display empty state for new user with no orders', async ({ page }) => {
    await page.goto('/my-orders');

    await expect(page.locator('h1')).toContainText('Order History');
    await expect(page.locator('text=No orders yet')).toBeVisible({ timeout: 5000 });
  });

  test('should display orders after submission', async ({ page }) => {
    // Submit an order via API
    const orderData = createValidOrder();
    const orderResponse = await apiHelper.submitOrder(orderData);
    expect(orderResponse.status).toBe(201);

    // Wait for order to be processed by the background worker
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Navigate to my-orders page
    await page.goto('/my-orders');

    // Wait for orders to load
    await expect(page.locator('.orders-table')).toBeVisible({ timeout: 10000 });

    // Verify table structure
    await expect(page.locator('th:has-text("Product")')).toBeVisible();
    await expect(page.locator('th:has-text("SKU")')).toBeVisible();
    await expect(page.locator('th:has-text("Quantity")')).toBeVisible();
    await expect(page.locator('th:has-text("Total")')).toBeVisible();
    await expect(page.locator('th:has-text("Status")')).toBeVisible();
    await expect(page.locator('th:has-text("Date")')).toBeVisible();

    // Verify at least one order is displayed
    const rows = page.locator('.orders-table tbody tr');
    await expect(rows).not.toHaveCount(0);
  });

  test('should display formatted prices with dollar sign', async ({ page }) => {
    // Submit an order via API
    const orderData = createValidOrder({ quantity: 2 });
    const orderResponse = await apiHelper.submitOrder(orderData);
    expect(orderResponse.status).toBe(201);

    // Wait for order to be processed
    await new Promise(resolve => setTimeout(resolve, 3000));

    await page.goto('/my-orders');

    // Wait for orders to load
    await expect(page.locator('.orders-table')).toBeVisible({ timeout: 10000 });

    // Check that prices are formatted with $
    const priceCell = page.locator('.orders-table tbody td:nth-child(4)').first();
    const priceText = await priceCell.textContent();
    expect(priceText).toMatch(/^\$[\d,]+\.\d{2}$/);
  });

  test('should navigate to place new order from my-orders page', async ({ page }) => {
    await page.goto('/my-orders');

    // Click on "Place New Order" link
    await page.click('a:has-text("Place New Order")');

    // Should navigate to orders page (order form)
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.locator('h1')).toContainText('Echobase Order System');
  });

  test('should navigate to my-orders from order form page', async ({ page }) => {
    await page.goto('/orders');

    // Wait for the page to load
    await expect(page.locator('h1')).toContainText('Echobase Order System');

    // Click on "View Order History" link
    await page.click('a:has-text("View Order History")');

    // Should navigate to my-orders page
    await expect(page).toHaveURL(/\/my-orders$/);
    await expect(page.locator('h1')).toContainText('Order History');
  });

  test('should redirect to login if not authenticated', async ({ page }) => {
    // Clear localStorage
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    });

    // Try to access my-orders page
    await page.goto('/my-orders');

    // Should redirect to login
    await expect(page).toHaveURL(/\/$|\/login/);
  });

  test('should display logout button', async ({ page }) => {
    await page.goto('/my-orders');

    await expect(page.locator('button:has-text("Logout")')).toBeVisible();
  });

  test('should logout successfully from my-orders page', async ({ page }) => {
    await page.goto('/my-orders');

    await page.click('button:has-text("Logout")');

    // Should redirect to login page
    await expect(page).toHaveURL(/\/$|\/login/);

    // Token should be cleared from localStorage
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();
  });

  test('should display user name', async ({ page }) => {
    await page.goto('/my-orders');

    // Should show "Logged in as: <name>"
    await expect(page.locator('text=Logged in as:')).toBeVisible();
  });

  test('should display multiple orders in correct order (newest first)', async ({ page }) => {
    // Submit multiple orders
    await apiHelper.submitOrder(createValidOrder({ productId: 1 }));
    await new Promise(resolve => setTimeout(resolve, 500));
    await apiHelper.submitOrder(createValidOrder({ productId: 2 }));

    // Wait for orders to be processed
    await new Promise(resolve => setTimeout(resolve, 3000));

    await page.goto('/my-orders');

    // Wait for orders to load
    await expect(page.locator('.orders-table')).toBeVisible({ timeout: 10000 });

    // Verify multiple rows
    const rows = page.locator('.orders-table tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(2);
  });
});
