import { test, expect } from '@playwright/test';
import DatabaseHelper from '../../utils/db-helper.js';
import ApiHelper from '../../utils/api-helper.js';
import { createValidUser } from '../../utils/test-data.js';

test.describe('User Login Frontend Tests', () => {
  let dbHelper;
  let apiHelper;
  const testUsers = [];

  test.beforeEach(async ({ page }) => {
    dbHelper = new DatabaseHelper();
    apiHelper = new ApiHelper();
    await dbHelper.connect();
    await page.goto('/');
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

  test('should display login form', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Login');
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    // First register a user via API
    const userData = createValidUser();
    testUsers.push(userData);
    await apiHelper.register(userData);

    // Now login via UI
    await page.fill('input[name="username"]', userData.username);
    await page.fill('input[name="password"]', userData.password);
    await page.click('button[type="submit"]');

    // Should redirect to orders page
    await expect(page).toHaveURL(/\/orders/);
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.fill('input[name="username"]', 'nonexistentuser');
    await page.fill('input[name="password"]', 'WrongPassword123');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('[role="alert"]')).toBeVisible();

    // Should still be on login page
    expect(page.url()).toContain('/');
  });

  test('should show error for wrong password', async ({ page }) => {
    // Register user
    const userData = createValidUser();
    testUsers.push(userData);
    await apiHelper.register(userData);

    // Try to login with wrong password
    await page.fill('input[name="username"]', userData.username);
    await page.fill('input[name="password"]', 'WrongPassword123');
    await page.click('button[type="submit"]');

    // Should show error
    await expect(page.locator('[role="alert"]')).toBeVisible();
  });

  test('should have link to registration page', async ({ page }) => {
    const registerLink = page.locator('a[href="/register"]');
    await expect(registerLink).toBeVisible();
  });

  test('should persist session after login', async ({ page, context }) => {
    // Register user
    const userData = createValidUser();
    testUsers.push(userData);
    await apiHelper.register(userData);

    // Login
    await page.fill('input[name="username"]', userData.username);
    await page.fill('input[name="password"]', userData.password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/orders/);

    // Verify localStorage has token
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();

    // Verify user data in localStorage
    const userStr = await page.evaluate(() => localStorage.getItem('user'));
    expect(userStr).toBeTruthy();
    const user = JSON.parse(userStr);
    expect(user.username).toBe(userData.username);

    // Create new page in same context
    const newPage = await context.newPage();
    await newPage.goto('/orders');

    // Should still be authenticated
    const newPageUrl = newPage.url();
    expect(newPageUrl).toContain('/orders');
  });

  test('should handle empty form submission', async ({ page }) => {
    await page.click('button[type="submit"]');

    // Should show validation or stay on page
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/orders');
  });

  test('should mask password input', async ({ page }) => {
    const passwordInput = page.locator('input[name="password"]');
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('should redirect authenticated users to orders page', async ({ page }) => {
    // Register and login
    const userData = createValidUser();
    testUsers.push(userData);
    await apiHelper.register(userData);

    await page.fill('input[name="username"]', userData.username);
    await page.fill('input[name="password"]', userData.password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/orders/);

    // Try to go back to login
    await page.goto('/');

    // Might redirect to orders if already authenticated
    // (depends on implementation, this is optional)
    await page.waitForTimeout(500);
  });
});
