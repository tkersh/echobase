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
      { quantity: 1, totalPrice: 10 }, // missing productName
      { productName: 'Test', totalPrice: 10 }, // missing quantity
      { productName: 'Test', quantity: 1 }, // missing totalPrice
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
