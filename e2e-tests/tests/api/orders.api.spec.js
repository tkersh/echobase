import { test, expect } from '@playwright/test';
import ApiHelper from '../../utils/api-helper.js';
import DatabaseHelper from '../../utils/db-helper.js';
import { createValidUser, createValidOrder, invalidOrders } from '../../utils/test-data.js';

test.describe('Orders API Tests', () => {
  let apiHelper;
  let dbHelper;
  const testUsers = [];

  test.beforeEach(async () => {
    apiHelper = new ApiHelper();
    dbHelper = new DatabaseHelper();
    await dbHelper.connect();
  });

  test.afterEach(async () => {
    // Cleanup: Delete test users and their orders
    for (const user of testUsers) {
      try {
        const dbUser = await dbHelper.waitForUser(user.username);
        if (dbUser) {
          await dbHelper.deleteOrdersByUserId(dbUser.id);
          await dbHelper.deleteUserByUsername(user.username);
        }
      } catch (e) {
        console.error(`Cleanup error for user ${user.username}:`, e.message);
      }
    }
    testUsers.length = 0;

    await dbHelper.disconnect();
  });

  test.describe('Order Submission', () => {
    test('should submit a valid order', async () => {
      // Register and login
      const userData = createValidUser();
      testUsers.push(userData);

      const regResponse = await apiHelper.register(userData);
      expect(regResponse.status).toBe(201);

      // Submit order
      const orderData = createValidOrder();
      const response = await apiHelper.submitOrder(orderData);

      expect(response.status).toBe(201);
      expect(response.ok).toBeTruthy();
      expect(response.data).toHaveProperty('messageId');
      expect(response.data.message).toContain('Order submitted successfully');
    });

    test('should reject order with decimal quantity', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      const regResponse = await apiHelper.register(userData);
      expect(regResponse.status).toBe(201);

      const orderData = createValidOrder({ quantity: 2.5 });
      const response = await apiHelper.submitOrder(orderData);

      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });

    test('should submit order with large quantity', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      const regResponse = await apiHelper.register(userData);
      expect(regResponse.status).toBe(201);

      // Use Mouse (id=10, $29.99) so total stays under ORDER_MAX_VALUE ($1M)
      const orderData = createValidOrder({ productId: 10, quantity: 9999 });
      const response = await apiHelper.submitOrder(orderData);

      expect(response.status).toBe(201);
      expect(response.ok).toBeTruthy();
    });

    test('should reject order without authentication', async () => {
      apiHelper.clearToken();

      const orderData = createValidOrder();
      const response = await apiHelper.submitOrder(orderData);

      expect(response.status).toBe(401);
      expect(response.ok).toBeFalsy();
    });

    test('should reject order with missing product ID', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      await apiHelper.register(userData);

      const response = await apiHelper.submitOrder(invalidOrders.missingProductId);

      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });

    test('should reject order with invalid (nonexistent) product ID', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      await apiHelper.register(userData);

      const response = await apiHelper.submitOrder(invalidOrders.invalidProductId);

      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });

    test('should reject order with negative product ID', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      await apiHelper.register(userData);

      const response = await apiHelper.submitOrder(invalidOrders.negativeProductId);

      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });

    test('should reject order with missing quantity', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      await apiHelper.register(userData);

      const response = await apiHelper.submitOrder(invalidOrders.missingQuantity);

      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });

    test('should reject order with negative quantity', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      await apiHelper.register(userData);

      const response = await apiHelper.submitOrder(invalidOrders.negativeQuantity);

      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });

    test('should reject order with zero quantity', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      await apiHelper.register(userData);

      const response = await apiHelper.submitOrder(invalidOrders.zeroQuantity);

      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });

    test('should reject order with invalid quantity type', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      await apiHelper.register(userData);

      const response = await apiHelper.submitOrder(invalidOrders.invalidQuantityType);

      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });
  });

  test.describe('Products API', () => {
    test('should return products when authenticated', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      await apiHelper.register(userData);

      const response = await apiHelper.getProducts();

      expect(response.status).toBe(200);
      expect(response.ok).toBeTruthy();
      expect(response.data.success).toBe(true);
      expect(response.data.products).toBeDefined();
      expect(response.data.products.length).toBe(11);
    });

    test('should reject products request without authentication', async () => {
      apiHelper.clearToken();

      const response = await apiHelper.getProducts();

      expect(response.status).toBe(401);
      expect(response.ok).toBeFalsy();
    });

    test('should return products sorted alphabetically', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      await apiHelper.register(userData);

      const response = await apiHelper.getProducts();

      expect(response.status).toBe(200);
      const names = response.data.products.map(p => p.name);
      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });

    test('should return all 11 seeded products', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      await apiHelper.register(userData);

      const response = await apiHelper.getProducts();

      expect(response.status).toBe(200);
      const names = response.data.products.map(p => p.name);
      expect(names).toContain('Quantum Stabilizer');
      expect(names).toContain('Plasma Conduit');
      expect(names).toContain('Neural Interface Module');
      expect(names).toContain('Gravity Dampener');
      expect(names).toContain('Chrono Sync Unit');
      expect(names).toContain('Headphones');
      expect(names).toContain('Keyboard');
      expect(names).toContain('Laptop');
      expect(names).toContain('Monitor');
      expect(names).toContain('Mouse');
      expect(names).toContain('Webcam');
    });
  });

  test.describe('Orders Info Endpoint', () => {
    test('should get orders info without authentication', async () => {
      apiHelper.clearToken();

      const response = await apiHelper.getOrdersInfo();

      expect(response.status).toBe(200);
      expect(response.ok).toBeTruthy();
      expect(response.data).toHaveProperty('message');
    });
  });

  test.describe('Multiple Orders', () => {
    test('should allow user to submit multiple orders', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      await apiHelper.register(userData);

      // Submit 3 orders
      const order1 = await apiHelper.submitOrder(createValidOrder());
      const order2 = await apiHelper.submitOrder(createValidOrder());
      const order3 = await apiHelper.submitOrder(createValidOrder());

      expect(order1.status).toBe(201);
      expect(order2.status).toBe(201);
      expect(order3.status).toBe(201);

      // All should have different messageIds
      expect(order1.data.messageId).not.toBe(order2.data.messageId);
      expect(order2.data.messageId).not.toBe(order3.data.messageId);
      expect(order1.data.messageId).not.toBe(order3.data.messageId);
    });
  });
});
