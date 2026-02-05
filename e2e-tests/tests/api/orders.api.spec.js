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

  test.describe('Get Orders Endpoint', () => {
    test('should reject get orders without authentication', async () => {
      apiHelper.clearToken();

      const response = await apiHelper.getOrders();

      expect(response.status).toBe(401);
      expect(response.ok).toBeFalsy();
    });

    test('should return empty array for new user with no orders', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      await apiHelper.register(userData);

      const response = await apiHelper.getOrders();

      expect(response.status).toBe(200);
      expect(response.ok).toBeTruthy();
      expect(response.data.success).toBe(true);
      expect(response.data.orders).toEqual([]);
      expect(response.data.count).toBe(0);
    });

    test('should return orders for authenticated user', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      await apiHelper.register(userData);

      // Submit an order first
      const orderData = createValidOrder();
      const submitResponse = await apiHelper.submitOrder(orderData);
      expect(submitResponse.status).toBe(201);

      // Wait for order to be processed by polling the database
      const dbUser = await dbHelper.waitForUser(userData.username);
      await dbHelper.waitForOrder(dbUser.id);

      // Get orders
      const response = await apiHelper.getOrders();

      expect(response.status).toBe(200);
      expect(response.ok).toBeTruthy();
      expect(response.data.success).toBe(true);
      expect(response.data.orders.length).toBeGreaterThanOrEqual(1);
      expect(response.data.count).toBe(response.data.orders.length);

      // Check order structure
      const order = response.data.orders[0];
      expect(order).toHaveProperty('id');
      expect(order).toHaveProperty('productName');
      expect(order).toHaveProperty('sku');
      expect(order).toHaveProperty('quantity');
      expect(order).toHaveProperty('totalPrice');
      expect(order).toHaveProperty('status');
      expect(order).toHaveProperty('createdAt');
    });

    test('should not return other users orders', async () => {
      // Create first user and submit an order
      const user1Data = createValidUser();
      testUsers.push(user1Data);
      await apiHelper.register(user1Data);
      await apiHelper.submitOrder(createValidOrder());

      // Wait for order to be processed by polling the database
      const dbUser1 = await dbHelper.waitForUser(user1Data.username);
      await dbHelper.waitForOrder(dbUser1.id);

      // Create second user
      const user2Data = createValidUser();
      testUsers.push(user2Data);
      await apiHelper.register(user2Data);

      // Second user should not see first user's orders
      const response = await apiHelper.getOrders();

      expect(response.status).toBe(200);
      expect(response.data.orders).toEqual([]);
      expect(response.data.count).toBe(0);
    });

    test('should return orders sorted by date descending', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      await apiHelper.register(userData);

      // Submit multiple orders
      await apiHelper.submitOrder(createValidOrder({ productId: 1 }));
      await apiHelper.submitOrder(createValidOrder({ productId: 2 }));

      // Wait for both orders to be processed by polling the database
      const dbUser = await dbHelper.waitForUser(userData.username);
      await dbHelper.waitForOrders(dbUser.id, 2);

      const response = await apiHelper.getOrders();

      expect(response.status).toBe(200);

      if (response.data.orders.length >= 2) {
        const orders = response.data.orders;
        for (let i = 0; i < orders.length - 1; i++) {
          const currentDate = new Date(orders[i].createdAt);
          const nextDate = new Date(orders[i + 1].createdAt);
          expect(currentDate.getTime()).toBeGreaterThanOrEqual(nextDate.getTime());
        }
      }
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
