import { test, expect } from '../../fixtures/test-fixtures.js';

test.describe('Authentication & Authorization', () => {
  test('should reject order submission without token', async ({ apiHelper }) => {
    // Fresh apiHelper has no auth cookie
    const response = await apiHelper.submitOrder({
      productId: 1,
      quantity: 1
    });

    expect(response.status).toBe(401);
    expect(response.data).not.toHaveProperty('messageId');
  });

  test('should reject order submission with invalid token', async ({ apiHelper }) => {
    await apiHelper.setToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpbnZhbGlkIjoidG9rZW4ifQ.invalid');

    const response = await apiHelper.submitOrder({
      productId: 1,
      quantity: 1
    });

    expect(response.status).toBe(401);
  });

  test('should reject order submission with malformed token', async ({ apiHelper }) => {
    await apiHelper.setToken('not-a-jwt');

    const response = await apiHelper.submitOrder({
      productId: 1,
      quantity: 1
    });

    expect(response.status).toBe(401);
  });

  test('should protect orders page from unauthenticated access', async ({ page }) => {
    await page.goto('/orders');

    // Should redirect to login
    await expect(page).toHaveURL(/\/$|\/login/);
  });
});
