import { test, expect } from '@playwright/test';
import DatabaseHelper from '../../utils/db-helper.js';
import ApiHelper from '../../utils/api-helper.js';
import { createValidUser, createValidOrder } from '../../utils/test-data.js';

test.describe('Orders Frontend Tests', () => {
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

    await page.goto('/orders');
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

  test('should display order form', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Echobase Order System');
    await expect(page.locator('input[name="productName"]')).toBeVisible();
    await expect(page.locator('input[name="quantity"]')).toBeVisible();
    await expect(page.locator('input[name="totalPrice"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should display logout button', async ({ page }) => {
    await expect(page.locator('button:has-text("Logout")')).toBeVisible();
  });

  test('should submit an order successfully', async ({ page }) => {
    const orderData = createValidOrder();

    await page.fill('input[name="productName"]', orderData.productName);
    await page.fill('input[name="quantity"]', orderData.quantity.toString());
    await page.fill('input[name="totalPrice"]', orderData.totalPrice.toString());

    await page.click('button[type="submit"]');

    // Should show success message
    await expect(page.locator('.message.success')).toBeVisible({ timeout: 5000 });
  });

  test('should clear form after successful submission', async ({ page }) => {
    const orderData = createValidOrder();

    await page.fill('input[name="productName"]', orderData.productName);
    await page.fill('input[name="quantity"]', orderData.quantity.toString());
    await page.fill('input[name="totalPrice"]', orderData.totalPrice.toString());

    await page.click('button[type="submit"]');

    // Wait for success message
    await expect(page.locator('.message.success')).toBeVisible({ timeout: 5000 });

    // Form should be cleared to default values
    await expect(page.locator('input[name="productName"]')).toHaveValue('');
    await expect(page.locator('input[name="quantity"]')).toHaveValue('1');
    await expect(page.locator('input[name="totalPrice"]')).toHaveValue('0');
  });

  test('should logout successfully', async ({ page }) => {
    await page.click('button:has-text("Logout")');

    // Should redirect to login page
    await expect(page).toHaveURL(/\/$|\/login/);

    // Token should be cleared from localStorage
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();
  });

  test('should redirect to login if not authenticated', async ({ page }) => {
    // Clear localStorage
    await page.evaluate(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    });

    // Try to access orders page
    await page.goto('/orders');

    // Should redirect to login
    await expect(page).toHaveURL(/\/$|\/login/);
  });

  test('should validate required fields', async ({ page }) => {
    // Try to submit empty form
    await page.click('button[type="submit"]');

    // Should show validation or stay on page
    await page.waitForTimeout(500);
    expect(page.url()).toContain('/orders');
  });

  test('should validate numeric fields', async ({ page }) => {
    await page.fill('input[name="productName"]', 'Test Product');

    // Set invalid values using evaluate to bypass browser validation
    await page.evaluate(() => {
      document.querySelector('input[name="quantity"]').value = 'invalid';
      document.querySelector('input[name="totalPrice"]').value = 'invalid';
    });

    await page.click('button[type="submit"]');

    // Browser should prevent submission or form should still be on orders page
    await page.waitForTimeout(500);
    expect(page.url()).toContain('/orders');
  });

  test('should handle multiple consecutive orders', async ({ page }) => {
    // Submit first order
    const order1 = createValidOrder();
    await page.fill('input[name="productName"]', order1.productName);
    await page.fill('input[name="quantity"]', order1.quantity.toString());
    await page.fill('input[name="totalPrice"]', order1.totalPrice.toString());
    await page.click('button[type="submit"]');
    await expect(page.locator('.message.success')).toBeVisible({ timeout: 5000 });

    // Submit second order
    const order2 = createValidOrder();
    await page.fill('input[name="productName"]', order2.productName);
    await page.fill('input[name="quantity"]', order2.quantity.toString());
    await page.fill('input[name="totalPrice"]', order2.totalPrice.toString());
    await page.click('button[type="submit"]');
    await expect(page.locator('.message.success')).toBeVisible({ timeout: 5000 });
  });

  test('should reject special characters in product name', async ({ page }) => {
    const orderData = createValidOrder({
      productName: 'Test Product!@#$%^&*()'
    });

    await page.fill('input[name="productName"]', orderData.productName);
    await page.fill('input[name="quantity"]', orderData.quantity.toString());
    await page.fill('input[name="totalPrice"]', orderData.totalPrice.toString());

    await page.click('button[type="submit"]');

    // Should show error message for invalid characters
    await expect(page.locator('.message.error')).toBeVisible({ timeout: 5000 });
  });

  test('should handle decimal values in quantity', async ({ page }) => {
    const orderData = createValidOrder({ quantity: 2.5 });

    await page.fill('input[name="productName"]', orderData.productName);
    await page.fill('input[name="quantity"]', orderData.quantity.toString());
    await page.fill('input[name="totalPrice"]', orderData.totalPrice.toString());

    await page.click('button[type="submit"]');

    // Wait for any message to appear (success or error)
    await page.waitForTimeout(1000);

    // Either should show error (backend rejects decimal) or no success (form validation prevents submission)
    const successMessage = page.locator('.message.success');
    const errorMessage = page.locator('.message.error');

    const hasSuccess = await successMessage.isVisible().catch(() => false);
    const hasError = await errorMessage.isVisible().catch(() => false);

    // Should NOT succeed with decimal quantity
    expect(hasSuccess).toBe(false);
  });

  test('should handle large numbers', async ({ page }) => {
    const orderData = createValidOrder({
      quantity: 9999,
      totalPrice: 100.00
    });

    await page.fill('input[name="productName"]', orderData.productName);
    await page.fill('input[name="quantity"]', orderData.quantity.toString());
    await page.fill('input[name="totalPrice"]', orderData.totalPrice.toString());

    await page.click('button[type="submit"]');

    await expect(page.locator('.message.success')).toBeVisible({ timeout: 5000 });
  });
});
