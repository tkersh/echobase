import { test, expect } from '@playwright/test';
import DatabaseHelper from '../../utils/db-helper.js';
import ApiHelper from '../../utils/api-helper.js';
import { createValidUser } from '../../utils/test-data.js';

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

    if (!registrationResponse.ok) {
      throw new Error(`Registration failed: ${JSON.stringify(registrationResponse)}`);
    }

    if (!registrationResponse.data.user) {
      throw new Error(`Registration response missing user object: ${JSON.stringify(registrationResponse.data)}`);
    }

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

  test('should display order form with product dropdown', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Echobase Order System');
    await expect(page.locator('select[name="productName"]')).toBeVisible();
    await expect(page.locator('input[name="quantity"]')).toBeVisible();
    await expect(page.locator('input[name="totalPrice"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should display logout button', async ({ page }) => {
    await expect(page.locator('button:has-text("Logout")')).toBeVisible();
  });

  test('should load products alphabetically in dropdown', async ({ page }) => {
    // Wait for products to load
    await expect(page.locator('select[name="productName"] option')).not.toHaveCount(1, { timeout: 5000 });

    const options = await page.locator('select[name="productName"] option').allTextContents();
    // First option is the placeholder
    const productOptions = options.slice(1);
    const names = productOptions.map(opt => opt.split(' — ')[0]);
    const sortedNames = [...names].sort();
    expect(names).toEqual(sortedNames);
  });

  test('should submit an order successfully', async ({ page }) => {
    // Wait for products to load
    await expect(page.locator('select[name="productName"] option')).not.toHaveCount(1, { timeout: 5000 });

    // Select a product from dropdown
    await page.selectOption('select[name="productName"]', { index: 1 });
    await page.fill('input[name="quantity"]', '2');

    await page.click('button[type="submit"]');

    // Should show success message
    await expect(page.locator('.message.success')).toBeVisible({ timeout: 5000 });
  });

  test('should auto-calculate total price', async ({ page }) => {
    // Wait for products to load
    await expect(page.locator('select[name="productName"] option')).not.toHaveCount(1, { timeout: 5000 });

    // Select a product
    await page.selectOption('select[name="productName"]', { index: 1 });
    await page.fill('input[name="quantity"]', '3');

    // Total price should be non-zero and read-only
    const totalPriceInput = page.locator('input[name="totalPrice"]');
    await expect(totalPriceInput).toHaveAttribute('readonly', '');
    const totalValue = await totalPriceInput.inputValue();
    expect(parseFloat(totalValue)).toBeGreaterThan(0);
  });

  test('should clear form after successful submission', async ({ page }) => {
    // Wait for products to load
    await expect(page.locator('select[name="productName"] option')).not.toHaveCount(1, { timeout: 5000 });

    await page.selectOption('select[name="productName"]', { index: 1 });
    await page.fill('input[name="quantity"]', '2');

    await page.click('button[type="submit"]');

    // Wait for success message
    await expect(page.locator('.message.success')).toBeVisible({ timeout: 5000 });

    // Form should be cleared to default values
    await expect(page.locator('select[name="productName"]')).toHaveValue('');
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
    // Submit button should be disabled when no product is selected
    await expect(page.locator('button[type="submit"]')).toBeDisabled();

    // Should stay on page
    expect(page.url()).toContain('/orders');
  });

  test('should handle multiple consecutive orders', async ({ page }) => {
    // Wait for products to load
    await expect(page.locator('select[name="productName"] option')).not.toHaveCount(1, { timeout: 5000 });

    // Submit first order
    await page.selectOption('select[name="productName"]', { index: 1 });
    await page.fill('input[name="quantity"]', '1');
    await page.click('button[type="submit"]');
    await expect(page.locator('.message.success')).toBeVisible({ timeout: 5000 });

    // Submit second order
    await page.selectOption('select[name="productName"]', { index: 2 });
    await page.fill('input[name="quantity"]', '3');
    await page.click('button[type="submit"]');
    await expect(page.locator('.message.success')).toBeVisible({ timeout: 5000 });
  });

  test('should truncate decimal values in quantity to integer', async ({ page }) => {
    // Wait for products to load
    await expect(page.locator('select[name="productName"] option')).not.toHaveCount(1, { timeout: 5000 });

    await page.selectOption('select[name="productName"]', { index: 1 });
    await page.fill('input[name="quantity"]', '2.5');

    // The frontend parseInt truncates 2.5 to 2, so submission succeeds
    await page.click('button[type="submit"]');

    await expect(page.locator('.message.success')).toBeVisible({ timeout: 5000 });
  });

  test('should handle large numbers', async ({ page }) => {
    // Wait for products to load
    await expect(page.locator('select[name="productName"] option')).not.toHaveCount(1, { timeout: 5000 });

    // Select Mouse (id=10, $29.99) so total stays under ORDER_MAX_VALUE ($1M)
    await page.selectOption('select[name="productName"]', '10');
    await page.fill('input[name="quantity"]', '9999');

    await page.click('button[type="submit"]');

    await expect(page.locator('.message.success')).toBeVisible({ timeout: 5000 });
  });

  test('should select product in dropdown when clicking recommended product', async ({ page }) => {
    // Set recommended products in localStorage (matching MCP server data with IDs)
    await page.evaluate(() => {
      localStorage.setItem('recommendedProducts', JSON.stringify([
        { id: 1, name: 'Quantum Stabilizer', cost: 249.99, sku: 'QS-001' },
        { id: 2, name: 'Plasma Conduit', cost: 89.50, sku: 'PC-042' },
      ]));
    });
    await page.reload();

    // Wait for products dropdown to load
    await expect(page.locator('select[name="productName"] option')).not.toHaveCount(1, { timeout: 5000 });

    // Click on the recommended product div (use role=button to avoid matching dropdown option)
    await page.click('[role="button"]:has-text("Quantum Stabilizer")');

    // Dropdown should have the corresponding product selected
    const selectedValue = await page.locator('select[name="productName"]').inputValue();
    expect(selectedValue).toBe('1');
  });
});
