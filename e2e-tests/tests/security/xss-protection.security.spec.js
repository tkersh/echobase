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

    // Wait for page to finish processing the submission
    await page.waitForLoadState('networkidle');

    // Verify no dialog was triggered (DOM XSS check)
    expect(dialogTriggered).toBe(false);

    // Verify rendered HTML does not contain unescaped script tags (stored XSS check)
    const bodyHtml = await page.innerHTML('body');
    expect(bodyHtml).not.toContain('<script>');
    expect(bodyHtml).not.toContain('javascript:');
  });

  test('should not allow XSS via recommended products in localStorage', async ({ apiHelper, testUsers, page, context }) => {
    const userData = createValidUser();
    testUsers.push(userData);

    await apiHelper.register(userData);

    // Inject auth cookie into browser context
    await context.addCookies(apiHelper.getCookies());

    await page.goto('/');

    // Set user metadata in sessionStorage and inject XSS payload in recommended products
    await page.evaluate(({ user, xss }) => {
      sessionStorage.setItem('user', JSON.stringify({ username: user.username, email: user.email }));
      localStorage.setItem('recommendedProducts', JSON.stringify([
        { id: 1, name: xss, cost: 9.99, sku: 'XSS-001' },
      ]));
    }, { user: userData, xss: xssPayloads[0] });

    let dialogTriggered = false;
    page.on('dialog', async dialog => {
      dialogTriggered = true;
      await dialog.dismiss();
    });

    await page.goto('/orders');
    await expect(page).toHaveURL(/\/orders/, { timeout: 10000 });

    // Wait for recommended products section to render
    await page.waitForLoadState('networkidle');

    // Verify no dialog was triggered (DOM XSS check)
    expect(dialogTriggered).toBe(false);

    // Verify rendered HTML does not contain unescaped script tags (stored XSS check)
    const bodyHtml = await page.innerHTML('body');
    expect(bodyHtml).not.toContain('<script>');
    expect(bodyHtml).not.toContain('javascript:');
  });
});
