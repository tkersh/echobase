import { test, expect } from '../../fixtures/test-fixtures.js';
import { createValidUser, xssPayloads } from '../../utils/test-data.js';

test.describe('XSS Protection', () => {
  test('should sanitize XSS in registration', async ({ apiHelper, testUsers, page }) => {
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

  test('should not allow XSS via recommended products in localStorage', async ({ apiHelper, testUsers, page }) => {
    const userData = createValidUser();
    testUsers.push(userData);

    await apiHelper.register(userData);

    await page.goto('/');

    // Set auth and inject XSS payloads as recommended product names in localStorage
    await page.evaluate(({ token, user, xss }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify({ username: user.username, email: user.email }));
      localStorage.setItem('recommendedProducts', JSON.stringify([
        { id: 1, name: xss, cost: 9.99, sku: 'XSS-001' },
      ]));
    }, { token: apiHelper.token, user: userData, xss: xssPayloads[0] });

    let dialogTriggered = false;
    page.on('dialog', async dialog => {
      dialogTriggered = true;
      await dialog.dismiss();
    });

    await page.goto('/orders');
    await expect(page).toHaveURL(/\/orders/, { timeout: 10000 });

    // Wait for recommended products to render
    await page.waitForTimeout(2000);

    expect(dialogTriggered).toBe(false);
  });
});
