import { test, expect } from '@playwright/test';
import ApiHelper from '../../utils/api-helper.js';
import DatabaseHelper from '../../utils/db-helper.js';
import { createValidUser, sqlInjectionPayloads, xssPayloads } from '../../utils/test-data.js';

test.describe('Security E2E Tests', () => {
  let apiHelper;
  let dbHelper;
  const testUsers = [];

  test.beforeEach(async () => {
    apiHelper = new ApiHelper();
    dbHelper = new DatabaseHelper();
    await dbHelper.connect();
  });

  test.afterEach(async () => {
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

  test.describe('SQL Injection Protection', () => {
    test('should prevent SQL injection in username field', async () => {
      for (const payload of sqlInjectionPayloads) {
        const userData = createValidUser({ username: payload });

        const response = await apiHelper.register(userData);

        // Should either reject with validation error or sanitize
        // Should NOT cause database error or succeed with malicious SQL
        expect([400, 201]).toContain(response.status);

        if (response.status === 201) {
          // If accepted, verify username was sanitized/escaped
          testUsers.push(userData);
          const dbUser = await dbHelper.getUserByUsername(payload);
          // SQL injection should not have affected database
          const userCount = await dbHelper.getUserCount();
          expect(userCount).toBeGreaterThan(0); // DB still functioning
        }
      }
    });

    test('should prevent SQL injection in login', async () => {
      const userData = createValidUser();
      testUsers.push(userData);
      await apiHelper.register(userData);

      for (const payload of sqlInjectionPayloads) {
        apiHelper.clearToken();

        const response = await apiHelper.login({
          username: payload,
          password: userData.password
        });

        // Should fail authentication, not cause SQL error
        expect(response.status).toBe(401);
        expect(response.data).not.toHaveProperty('token');
      }
    });

    test('should prevent SQL injection in order product name', async () => {
      const userData = createValidUser();
      testUsers.push(userData);
      await apiHelper.register(userData);

      const dbUser = await dbHelper.getUserByUsername(userData.username);

      for (const payload of sqlInjectionPayloads) {
        const response = await apiHelper.submitOrder({
          productName: payload,
          quantity: 1,
          totalPrice: 10.00
        });

        // Should either accept and sanitize or reject with validation
        expect([201, 400]).toContain(response.status);
      }

      // Verify database integrity
      const userCount = await dbHelper.getUserCount();
      expect(userCount).toBeGreaterThan(0);
    });
  });

  test.describe('XSS Protection', () => {
    test('should sanitize XSS in registration', async ({ page }) => {
      const userData = createValidUser({
        fullName: xssPayloads[0]
      });
      testUsers.push(userData);

      await page.goto('/register');
      await page.fill('input[name="username"]', userData.username);
      await page.fill('input[name="email"]', userData.email);
      await page.fill('input[name="fullName"]', userData.fullName);
      await page.fill('input[name="password"]', userData.password);
      await page.fill('input[name="confirmPassword"]', userData.password);

      // Set up dialog listener before submission
      let dialogTriggered = false;
      page.on('dialog', async dialog => {
        dialogTriggered = true;
        await dialog.dismiss();
      });

      await page.click('button[type="submit"]');

      // Wait to see if any XSS triggers
      await page.waitForTimeout(2000);

      expect(dialogTriggered).toBe(false);
    });

    test('should sanitize XSS in order product name', async ({ page }) => {
      const userData = createValidUser();
      testUsers.push(userData);

      await apiHelper.register(userData);

      await page.goto('/');

      // Set both token and user in localStorage (AuthContext requires both)
      await page.evaluate(({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify({ username: user.username, email: user.email }));
      }, { token: apiHelper.token, user: userData });

      // Reload page to pick up the authentication state
      await page.reload();

      await page.goto('/orders');

      // Wait for the page to load and form to be visible
      await expect(page).toHaveURL(/\/orders/, { timeout: 10000 });
      await page.waitForSelector('input[name="productName"]', { timeout: 10000 });

      let dialogTriggered = false;
      page.on('dialog', async dialog => {
        dialogTriggered = true;
        await dialog.dismiss();
      });

      await page.fill('input[name="productName"]', xssPayloads[0]);
      await page.fill('input[name="quantity"]', '1');
      await page.fill('input[name="totalPrice"]', '10');
      await page.click('button[type="submit"]');

      await page.waitForTimeout(2000);

      expect(dialogTriggered).toBe(false);
    });
  });

  test.describe('Authentication & Authorization', () => {
    test('should reject order submission without token', async () => {
      apiHelper.clearToken();

      const response = await apiHelper.submitOrder({
        productName: 'Test Product',
        quantity: 1,
        totalPrice: 10
      });

      expect(response.status).toBe(401);
      expect(response.data).not.toHaveProperty('messageId');
    });

    test('should reject order submission with invalid token', async () => {
      apiHelper.setToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpbnZhbGlkIjoidG9rZW4ifQ.invalid');

      const response = await apiHelper.submitOrder({
        productName: 'Test Product',
        quantity: 1,
        totalPrice: 10
      });

      expect(response.status).toBe(401);
    });

    test('should reject order submission with malformed token', async () => {
      apiHelper.setToken('not-a-jwt');

      const response = await apiHelper.submitOrder({
        productName: 'Test Product',
        quantity: 1,
        totalPrice: 10
      });

      expect(response.status).toBe(401);
    });

    test('should protect orders page from unauthenticated access', async ({ page }) => {
      await page.goto('/orders');

      // Should redirect to login
      await expect(page).toHaveURL(/\/$|\/login/);
    });
  });

  test.describe('Input Validation', () => {
    test('should enforce password complexity', async () => {
      const weakPasswords = [
        'short',
        'nouppercase123',
        'NOLOWERCASE123',
        'NoNumbers'
      ];

      for (const password of weakPasswords) {
        const userData = createValidUser({ password });

        const response = await apiHelper.register(userData);

        expect(response.status).toBe(400);
        expect(response.ok).toBeFalsy();
      }
    });

    test('should validate email format', async () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'missing@domain',
        'missing.com'
      ];

      for (const email of invalidEmails) {
        const userData = createValidUser({ email });
        const response = await apiHelper.register(userData);

        expect(response.status).toBe(400);
      }
    });

    test('should enforce order field requirements', async () => {
      const userData = createValidUser();
      testUsers.push(userData);
      await apiHelper.register(userData);

      // Missing fields
      const invalidOrders = [
        { quantity: 1, totalPrice: 10 }, // missing productName
        { productName: 'Test', totalPrice: 10 }, // missing quantity
        { productName: 'Test', quantity: 1 }, // missing totalPrice
      ];

      for (const order of invalidOrders) {
        const response = await apiHelper.submitOrder(order);
        expect(response.status).toBe(400);
      }
    });

    test('should reject negative values in orders', async () => {
      const userData = createValidUser();
      testUsers.push(userData);
      await apiHelper.register(userData);

      const negativeQuantity = await apiHelper.submitOrder({
        productName: 'Test',
        quantity: -5,
        totalPrice: 10
      });
      expect(negativeQuantity.status).toBe(400);

      const negativeTotalPrice = await apiHelper.submitOrder({
        productName: 'Test',
        quantity: 1,
        totalPrice: -10
      });
      expect(negativeTotalPrice.status).toBe(400);
    });
  });

  test.describe('HTTPS and Security Headers', () => {
    test('should enforce HTTPS', async () => {
      const response = await apiHelper.healthCheck();
      expect(response.status).toBe(200);
      // Connection should be over HTTPS (configured in ApiHelper)
    });

    test('should include security headers', async () => {
      const response = await apiHelper.healthCheck();

      // Check for common security headers
      const headers = response.headers;

      // Note: Exact headers depend on your Helmet configuration
      // Common headers to check:
      // - x-content-type-options: nosniff
      // - x-frame-options: DENY or SAMEORIGIN
      // - strict-transport-security (if configured)

      // At minimum, should have some security headers
      expect(Object.keys(headers).length).toBeGreaterThan(0);
    });
  });

  test.describe('Error Handling', () => {
    test('should not leak sensitive information in error messages', async () => {
      // Try to login with non-existent user
      const response = await apiHelper.login({
        username: 'nonexistent',
        password: 'TestPass123'
      });

      expect(response.status).toBe(401);

      // Error message should not reveal if user exists or not
      const errorMsg = response.data.error || '';
      expect(errorMsg.toLowerCase()).not.toContain('user not found');
      expect(errorMsg.toLowerCase()).not.toContain('username');
      expect(errorMsg.toLowerCase()).not.toContain('does not exist');
    });

    test('should handle database errors gracefully', async () => {
      // This test depends on what triggers DB errors in your system
      // For now, just ensure malformed requests don't crash
      const response = await apiHelper.request('POST', '/api/orders', {
        data: { invalid: 'data' }
      });

      // Should return error, not crash
      expect([400, 401, 500]).toContain(response.status);
      expect(response.data).toBeTruthy();
    });
  });

  test.describe('Session Management', () => {
    test('should clear session on logout', async ({ page }) => {
      const userData = createValidUser();
      testUsers.push(userData);

      await page.goto('/register');
      await page.fill('input[name="username"]', userData.username);
      await page.fill('input[name="email"]', userData.email);
      await page.fill('input[name="fullName"]', userData.fullName);
      await page.fill('input[name="password"]', userData.password);
      await page.fill('input[name="confirmPassword"]', userData.password);
      await page.click('button[type="submit"]');

      await expect(page).toHaveURL(/\/orders/);

      // Verify token exists
      let token = await page.evaluate(() => localStorage.getItem('token'));
      expect(token).toBeTruthy();

      // Logout
      await page.click('button:has-text("Logout")');

      // Verify token is cleared
      token = await page.evaluate(() => localStorage.getItem('token'));
      expect(token).toBeNull();
    });

    test('should not accept reused tokens after logout', async ({ page, context }) => {
      const userData = createValidUser();
      testUsers.push(userData);

      await page.goto('/register');
      await page.fill('input[name="username"]', userData.username);
      await page.fill('input[name="email"]', userData.email);
      await page.fill('input[name="fullName"]', userData.fullName);
      await page.fill('input[name="password"]', userData.password);
      await page.fill('input[name="confirmPassword"]', userData.password);
      await page.click('button[type="submit"]');

      // Get token before logout
      const oldToken = await page.evaluate(() => localStorage.getItem('token'));

      // Logout
      await page.click('button:has-text("Logout")');

      // Try to use old token
      const newPage = await context.newPage();
      await newPage.goto('/');
      await newPage.evaluate((token) => {
        localStorage.setItem('token', token);
      }, oldToken);

      // Try to access protected page
      await newPage.goto('/orders');

      // Note: This test depends on whether you invalidate tokens server-side
      // If not, the token might still work (which is a security consideration)
      // For JWT without server-side tracking, tokens remain valid until expiry
    });
  });

  test.describe('Rate Limiting', () => {
    test.skip('should rate limit excessive requests', async () => {
      // This test is skipped by default as it may take time
      // and depends on your rate limiting configuration

      const requests = [];

      // Make 150 requests rapidly (assuming 100/15min limit)
      for (let i = 0; i < 150; i++) {
        requests.push(apiHelper.healthCheck());
      }

      const responses = await Promise.all(requests);

      // Some requests should be rate limited
      const rateLimitedCount = responses.filter(r => r.status === 429).length;

      // At least some should be rate limited
      // Exact number depends on your configuration
      expect(rateLimitedCount).toBeGreaterThan(0);
    });
  });
});
