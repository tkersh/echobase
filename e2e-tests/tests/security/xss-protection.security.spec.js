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

  test('should sanitize XSS in order product name', async ({ apiHelper, testUsers, page }) => {
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
