import { test, expect } from '../../fixtures/test-fixtures.js';
import { createValidUser } from '../../utils/test-data.js';

test.describe('Input Validation', () => {
  test('should enforce password complexity', async ({ apiHelper }) => {
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

  test('should validate email format', async ({ apiHelper }) => {
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

  test('should enforce order field requirements', async ({ apiHelper, testUsers }) => {
    const userData = createValidUser();
    testUsers.push(userData);
    await apiHelper.register(userData);

    // Missing fields
    const invalidOrders = [
      { quantity: 1 }, // missing productId
      { productId: 1 }, // missing quantity
    ];

    for (const order of invalidOrders) {
      const response = await apiHelper.submitOrder(order);
      expect(response.status).toBe(400);
    }
  });

  test('should reject negative values in orders', async ({ apiHelper, testUsers }) => {
    const userData = createValidUser();
    testUsers.push(userData);
    await apiHelper.register(userData);

    const negativeQuantity = await apiHelper.submitOrder({
      productId: 1,
      quantity: -5
    });
    expect(negativeQuantity.status).toBe(400);

    const negativeProductId = await apiHelper.submitOrder({
      productId: -1,
      quantity: 1
    });
    expect(negativeProductId.status).toBe(400);
  });

  test('should reject invalid product IDs in orders', async ({ apiHelper, testUsers }) => {
    const userData = createValidUser();
    testUsers.push(userData);
    await apiHelper.register(userData);

    const nonexistentProduct = await apiHelper.submitOrder({
      productId: 99999,
      quantity: 1
    });
    expect(nonexistentProduct.status).toBe(400);

    const stringProductId = await apiHelper.submitOrder({
      productId: 'invalid',
      quantity: 1
    });
    expect(stringProductId.status).toBe(400);
  });
});
