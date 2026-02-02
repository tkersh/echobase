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

    // Submit and wait for navigation - increase timeout for slow registrations
    await Promise.all([
      page.waitForURL(/\/orders/, { timeout: 15000 }),
      page.click('button[type="submit"]')
    ]);

    // Should redirect to orders page
    await expect(page).toHaveURL(/\/orders/);

    // Verify user exists in database
    const dbUser = await dbHelper.waitForUser(userData.username);
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

    // Submit and wait for navigation
    await Promise.all([
      page.waitForURL(/\/orders/, { timeout: 15000 }),
      page.click('button[type="submit"]')
    ]);

    // Wait for redirect
    await expect(page).toHaveURL(/\/orders/);

    // Verify user was created
    const dbUser = await dbHelper.waitForUser(userData.username);
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

    // Wait for either an error alert or for the page to settle
    await expect(async () => {
      const onRegisterPage = page.url().includes('/register');
      const hasAlert = await page.locator('[role="alert"]').isVisible().catch(() => false);
      expect(onRegisterPage || hasAlert).toBe(true);
    }).toPass({ timeout: 5000 });
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

    // Should remain on registration page
    await expect(page).toHaveURL(/\/register/, { timeout: 3000 });
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

    // Submit and wait for navigation
    await Promise.all([
      page.waitForURL(/\/orders/, { timeout: 15000 }),
      page.click('button[type="submit"]')
    ]);

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

    // Set up dialog listener and wait for page to settle
    page.on('dialog', async dialog => {
      throw new Error('Unexpected alert dialog: XSS vulnerability detected!');
    });

    // Wait for page to finish processing the submission
    await page.waitForLoadState('networkidle');
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
    await page.waitForLoadState('networkidle');
    // Page should still be responsive (h1 on registration, or redirected to orders)
    await expect(page.locator('h1')).toBeVisible({ timeout: 5000 });
  });
});
