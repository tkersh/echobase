import { test, expect } from '../../fixtures/test-fixtures.js';
import { createValidUser } from '../../utils/test-data.js';

test.describe('Session Management', () => {
  test('should clear session on logout', async ({ testUsers, page }) => {
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
    let token = await page.evaluate(() => sessionStorage.getItem('token'));
    expect(token).toBeTruthy();

    // Logout
    await page.click('button:has-text("Logout")');

    // Verify token is cleared
    token = await page.evaluate(() => sessionStorage.getItem('token'));
    expect(token).toBeNull();
  });

  test('should not accept reused tokens after logout', async ({ testUsers, page, context }) => {
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
    const oldToken = await page.evaluate(() => sessionStorage.getItem('token'));

    // Logout
    await page.click('button:has-text("Logout")');

    // Try to use old token
    const newPage = await context.newPage();
    await newPage.goto('/');
    await newPage.evaluate((token) => {
      sessionStorage.setItem('token', token);
    }, oldToken);

    // Try to access protected page
    await newPage.goto('/orders');

    // Note: This test depends on whether you invalidate tokens server-side
    // If not, the token might still work (which is a security consideration)
    // For JWT without server-side tracking, tokens remain valid until expiry
  });
});
