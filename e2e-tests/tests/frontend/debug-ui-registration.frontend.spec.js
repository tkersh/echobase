import { test, expect } from '@playwright/test';
import DatabaseHelper from '../../utils/db-helper.js';
import { createValidUser, createValidOrder } from '../../utils/test-data.js';

test.describe('Debug UI Registration Flow', () => {
  let dbHelper;
  let consoleMessages = [];
  let testUser;

  test.beforeEach(async ({ page }) => {
    dbHelper = new DatabaseHelper();
    await dbHelper.connect();
    consoleMessages = [];

    // Capture console messages
    page.on('console', msg => {
      const text = msg.text();
      consoleMessages.push(text);
      console.log('[BROWSER CONSOLE]', text);
    });

    testUser = createValidUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      try {
        const dbUser = await dbHelper.getUserByUsername(testUser.username);
        if (dbUser) {
          await dbHelper.deleteOrdersByUserId(dbUser.id);
          await dbHelper.deleteUserByUsername(testUser.username);
        }
      } catch (e) {
        console.error('Cleanup error:', e.message);
      }
    }
    await dbHelper.disconnect();
  });

  test('should debug UI registration and order submission', async ({ page }) => {
    // Step 1: Register via UI
    console.log('\n=== STEP 1: Register via UI ===');
    await page.goto('/register');
    await page.fill('input[name="username"]', testUser.username);
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="fullName"]', testUser.fullName);
    await page.fill('input[name="password"]', testUser.password);
    await page.fill('input[name="confirmPassword"]', testUser.password);
    await page.click('button[type="submit"]');

    // Wait for redirect
    await expect(page).toHaveURL(/\/orders/);

    // Step 2: Check localStorage
    console.log('\n=== STEP 2: Check localStorage ===');
    const localStorage = await page.evaluate(() => {
      return {
        token: window.localStorage.getItem('token'),
        user: window.localStorage.getItem('user')
      };
    });
    console.log('Token:', localStorage.token ? localStorage.token.substring(0, 30) + '...' : 'NO TOKEN');
    console.log('User in localStorage:', localStorage.user);

    // Parse and display user object
    if (localStorage.user) {
      const userObj = JSON.parse(localStorage.user);
      console.log('Parsed user object:', JSON.stringify(userObj, null, 2));
    }

    // Step 3: Check database
    console.log('\n=== STEP 3: Check database ===');
    const dbUser = await dbHelper.getUserByUsername(testUser.username);
    console.log('User in database:', JSON.stringify({
      id: dbUser?.id,
      username: dbUser?.username,
      email: dbUser?.email,
      full_name: dbUser?.full_name
    }, null, 2));

    // Step 4: Submit an order
    console.log('\n=== STEP 4: Submit order ===');
    const orderData = createValidOrder();
    await page.fill('input[name="productName"]', orderData.productName);
    await page.fill('input[name="quantity"]', orderData.quantity.toString());
    await page.fill('input[name="totalPrice"]', orderData.totalPrice.toString());

    console.log('Order data being submitted:', JSON.stringify(orderData, null, 2));

    await page.click('button[type="submit"]');

    // Wait a moment for the response
    await page.waitForTimeout(2000);

    // Step 5: Check what message appears
    console.log('\n=== STEP 5: Check result ===');
    const messages = await page.locator('.message').allTextContents();
    console.log('Messages on page:', messages);

    // Check if success or error
    const hasSuccess = await page.locator('.message.success').isVisible().catch(() => false);
    const hasError = await page.locator('.message.error').isVisible().catch(() => false);
    console.log('Has success message:', hasSuccess);
    console.log('Has error message:', hasError);

    // Step 6: Print all captured console messages
    console.log('\n=== CAPTURED BROWSER CONSOLE MESSAGES ===');
    consoleMessages.forEach((msg, idx) => {
      console.log(`[${idx}]`, msg);
    });

    // Take a screenshot for visual inspection
    await page.screenshot({ path: '/tmp/claude/debug-ui-registration.png' });
  });
});
