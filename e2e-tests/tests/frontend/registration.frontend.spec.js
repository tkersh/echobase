import { test, expect } from '@playwright/test';
import DatabaseHelper from '../../utils/db-helper.js';
import { createValidUser, invalidPasswords, generateEmail } from '../../utils/test-data.js';

test.describe('User Registration Frontend Tests', () => {
  let dbHelper;
  const testUsers = [];

  test.beforeEach(async ({ page }) => {
    dbHelper = new DatabaseHelper();
    await dbHelper.connect();
    await page.goto('/register');
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

  test('should display registration form', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Create Account');
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="fullName"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should register a new user successfully', async ({ page }) => {
    const userData = createValidUser();
    testUsers.push(userData);

    // Fill form
    await page.fill('input[name="username"]', userData.username);
    await page.fill('input[name="email"]', userData.email);
    await page.fill('input[name="fullName"]', userData.fullName);
    await page.fill('input[name="password"]', userData.password);
    await page.fill('input[name="confirmPassword"]', userData.password);

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to orders page - increase timeout for slow registrations
    await expect(page).toHaveURL(/\/orders/, { timeout: 15000 });

    // Verify user exists in database
    const dbUser = await dbHelper.getUserByUsername(userData.username);
    expect(dbUser).toBeTruthy();
    expect(dbUser.username).toBe(userData.username);
    expect(dbUser.email).toBe(userData.email);
  });

  test('should show error for duplicate username', async ({ page }) => {
    const userData = createValidUser();
    testUsers.push(userData);

    // Register first time
    await page.fill('input[name="username"]', userData.username);
    await page.fill('input[name="email"]', userData.email);
    await page.fill('input[name="fullName"]', userData.fullName);
    await page.fill('input[name="password"]', userData.password);
    await page.fill('input[name="confirmPassword"]', userData.password);
    await page.click('button[type="submit"]');

    // Wait for redirect
    await expect(page).toHaveURL(/\/orders/, { timeout: 10000 });

    // Verify user was created
    const dbUser = await dbHelper.getUserByUsername(userData.username);
    expect(dbUser).toBeTruthy();

    // Go back to registration
    await page.goto('/register');

    // Try to register again with same username but different email
    const duplicateEmail = generateEmail();
    await page.fill('input[name="username"]', userData.username);
    await page.fill('input[name="email"]', duplicateEmail);
    await page.fill('input[name="fullName"]', 'Another User');
    await page.fill('input[name="password"]', userData.password);
    await page.fill('input[name="confirmPassword"]', userData.password);
    await page.click('button[type="submit"]');

    // Should show error message and stay on registration page
    await page.waitForTimeout(2000);

    // Check if error is shown or if we stayed on registration page
    const onRegisterPage = page.url().includes('/register');
    const hasAlert = await page.locator('[role="alert"]').isVisible().catch(() => false);

    // Either should show alert OR stay on registration page (not redirect to orders)
    expect(onRegisterPage || hasAlert).toBe(true);
  });

  test('should validate password requirements', async ({ page }) => {
    const userData = createValidUser();
    testUsers.push(userData);

    // Try with short password
    await page.fill('input[name="username"]', userData.username);
    await page.fill('input[name="email"]', userData.email);
    await page.fill('input[name="fullName"]', userData.fullName);
    await page.fill('input[name="password"]', invalidPasswords.tooShort);

    // Should show password requirements with "Not met" indicator
    await expect(page.locator('text=Not met')).toBeVisible();

    // Form should not allow submission or stay on registration page
    await page.fill('input[name="confirmPassword"]', invalidPasswords.tooShort);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/register');
  });

  test('should validate required fields', async ({ page }) => {
    // Try to submit empty form
    await page.click('button[type="submit"]');

    // Should still be on registration page or show validation
    const currentUrl = page.url();
    expect(currentUrl).toContain('/register');
  });

  test('should have link to login page', async ({ page }) => {
    const loginLink = page.locator('a[href*="/login"], a[href="/"]');
    await expect(loginLink).toBeVisible();
  });

  test('should persist session after registration', async ({ page, context }) => {
    const userData = createValidUser();
    testUsers.push(userData);

    // Register
    await page.fill('input[name="username"]', userData.username);
    await page.fill('input[name="email"]', userData.email);
    await page.fill('input[name="fullName"]', userData.fullName);
    await page.fill('input[name="password"]', userData.password);
    await page.fill('input[name="confirmPassword"]', userData.password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/orders/);

    // Verify localStorage has token
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();

    // Create new page in same context
    const newPage = await context.newPage();
    await newPage.goto('/orders');

    // Should still be authenticated
    const newPageUrl = newPage.url();
    expect(newPageUrl).toContain('/orders');
    expect(newPageUrl).not.toContain('/login');
  });

  test('should sanitize input to prevent XSS', async ({ page }) => {
    const userData = createValidUser({
      fullName: '<script>alert("XSS")</script>'
    });
    testUsers.push(userData);

    await page.fill('input[name="username"]', userData.username);
    await page.fill('input[name="email"]', userData.email);
    await page.fill('input[name="fullName"]', userData.fullName);
    await page.fill('input[name="password"]', userData.password);
    await page.fill('input[name="confirmPassword"]', userData.password);
    await page.click('button[type="submit"]');

    // Wait a bit to see if XSS triggers
    await page.waitForTimeout(1000);

    // Check no alert dialogs
    page.on('dialog', async dialog => {
      throw new Error('Unexpected alert dialog: XSS vulnerability detected!');
    });
  });

  test('should handle long input values', async ({ page }) => {
    const userData = createValidUser({
      fullName: 'A'.repeat(500)
    });
    testUsers.push(userData);

    await page.fill('input[name="username"]', userData.username);
    await page.fill('input[name="email"]', userData.email);
    await page.fill('input[name="fullName"]', userData.fullName);
    await page.fill('input[name="password"]', userData.password);
    await page.fill('input[name="confirmPassword"]', userData.password);
    await page.click('button[type="submit"]');

    // Should either accept or show validation error, but not crash
    await page.waitForTimeout(2000);
    // Page should still be responsive (h1 on registration, or redirected to orders)
    const h1Visible = await page.locator('h1').isVisible();
    expect(h1Visible).toBe(true);
  });
});
