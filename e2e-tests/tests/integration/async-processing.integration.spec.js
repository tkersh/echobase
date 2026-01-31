import { test, expect } from '@playwright/test';
import DatabaseHelper from '../../utils/db-helper.js';
import ApiHelper from '../../utils/api-helper.js';
import { createValidUser, createValidOrder } from '../../utils/test-data.js';
import { execSync } from 'child_process';

test.describe('Async Order Processing Integration Tests', () => {
  let dbHelper;
  let apiHelper;
  const testUsers = [];

  // Purge SQS queue once before all tests to clear any backlog from previous runs
  test.beforeAll(async () => {
    try {
      execSync(
        'docker exec echobase-localstack-1 awslocal sqs purge-queue --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/order-processing-queue',
        { stdio: 'ignore' }
      );
      // Wait a moment for queue to be fully purged
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.warn('Failed to purge SQS queue (this may be okay if queue is already empty):', error.message);
    }
  });

  test.beforeEach(async () => {
    dbHelper = new DatabaseHelper();
    apiHelper = new ApiHelper();
    await dbHelper.connect();
  });

  test.afterEach(async () => {
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

  test('should process order asynchronously via SQS', async () => {
    const userData = createValidUser();
    testUsers.push(userData);

    // Register user
    await apiHelper.register(userData);
    const dbUser = await dbHelper.waitForUser(userData.username);
    const userId = dbUser.id;

    // Get initial order count
    const initialCount = await dbHelper.getOrderCount();

    // Submit order
    const orderData = createValidOrder({ productId: 1 });
    const response = await apiHelper.submitOrder(orderData);
    expect(response.status).toBe(201);
    expect(response.data.messageId).toBeTruthy();

    // Wait for order to be processed
    const dbOrder = await dbHelper.waitForOrder(userId, 15000, 500);
    expect(dbOrder).toBeTruthy();

    // Verify order details
    expect(dbOrder.product_id).toBe(1);
    expect(dbOrder.product_name).toBeTruthy();
    expect(dbOrder.sku).toBeTruthy();
    expect(Number(dbOrder.quantity)).toBe(Number(orderData.quantity));
    expect(dbOrder.user_id).toBe(userId);
    expect(dbOrder.order_status).toBe('completed');

    // Verify server-calculated total price
    const product = await dbHelper.getProductById(1);
    const expectedTotal = parseFloat((product.cost * orderData.quantity).toFixed(2));
    expect(Number(dbOrder.total_price)).toBeCloseTo(expectedTotal, 2);

    // Verify total order count increased
    const finalCount = await dbHelper.getOrderCount();
    expect(finalCount).toBeGreaterThan(initialCount);
  });

  test('should process multiple orders in sequence', async () => {
    const userData = createValidUser();
    testUsers.push(userData);

    await apiHelper.register(userData);
    const dbUser = await dbHelper.waitForUser(userData.username);
    const userId = dbUser.id;

    // Submit 5 orders with different products
    const orders = [];
    for (let i = 0; i < 5; i++) {
      const orderData = createValidOrder({ productId: (i % 11) + 1 });
      orders.push(orderData);
      await apiHelper.submitOrder(orderData);
    }

    // Wait for all to be processed
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Verify all orders in database
    const dbOrders = await dbHelper.getOrdersByUserId(userId);
    expect(dbOrders.length).toBe(5);

    // Verify each order has a valid product_id
    for (const dbOrder of dbOrders) {
      expect(dbOrder.product_id).toBeTruthy();
      expect(dbOrder.product_name).toBeTruthy();
    }
  });

  test('should handle order processing with different quantities', async () => {
    const userData = createValidUser();
    testUsers.push(userData);

    await apiHelper.register(userData);
    const dbUser = await dbHelper.waitForUser(userData.username);
    const userId = dbUser.id;

    // Submit orders with various quantities using valid product IDs
    const testCases = [
      { productId: 10, quantity: 1 },   // Mouse ($29.99)
      { productId: 8, quantity: 100 }    // Laptop ($999.99)
    ];

    for (const order of testCases) {
      await apiHelper.submitOrder(order);
    }

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Verify all orders
    const dbOrders = await dbHelper.getOrdersByUserId(userId);
    expect(dbOrders.length).toBe(testCases.length);

    // Verify specific values
    for (const testCase of testCases) {
      const product = await dbHelper.getProductById(testCase.productId);
      const matchingOrder = dbOrders.find(o => o.product_id === testCase.productId);
      expect(matchingOrder).toBeTruthy();
      expect(Number(matchingOrder.quantity)).toBe(testCase.quantity);
      expect(matchingOrder.product_name).toBe(product.name);
      const expectedTotal = parseFloat((product.cost * testCase.quantity).toFixed(2));
      expect(Number(matchingOrder.total_price)).toBeCloseTo(expectedTotal, 2);
    }
  });

  test('should process orders from multiple users independently', async () => {
    const user1 = createValidUser();
    const user2 = createValidUser();
    const user3 = createValidUser();
    testUsers.push(user1, user2, user3);

    // Register users
    const api1 = new ApiHelper();
    const api2 = new ApiHelper();
    const api3 = new ApiHelper();

    await api1.register(user1);
    await api2.register(user2);
    await api3.register(user3);

    const dbUser1 = await dbHelper.waitForUser(user1.username);
    const dbUser2 = await dbHelper.waitForUser(user2.username);
    const dbUser3 = await dbHelper.waitForUser(user3.username);

    // Each user submits different number of orders with different products
    await api1.submitOrder(createValidOrder({ productId: 1 }));
    await api1.submitOrder(createValidOrder({ productId: 2 }));

    await api2.submitOrder(createValidOrder({ productId: 3 }));
    await api2.submitOrder(createValidOrder({ productId: 4 }));
    await api2.submitOrder(createValidOrder({ productId: 5 }));

    await api3.submitOrder(createValidOrder({ productId: 6 }));

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Verify orders per user
    const user1Orders = await dbHelper.getOrdersByUserId(dbUser1.id);
    const user2Orders = await dbHelper.getOrdersByUserId(dbUser2.id);
    const user3Orders = await dbHelper.getOrdersByUserId(dbUser3.id);

    expect(user1Orders.length).toBe(2);
    expect(user2Orders.length).toBe(3);
    expect(user3Orders.length).toBe(1);

    // Verify no cross-contamination
    expect(user1Orders.every(o => o.user_id === dbUser1.id)).toBe(true);
    expect(user2Orders.every(o => o.user_id === dbUser2.id)).toBe(true);
    expect(user3Orders.every(o => o.user_id === dbUser3.id)).toBe(true);
  });

  test('should set correct timestamps on orders', async () => {
    const userData = createValidUser();
    testUsers.push(userData);

    await apiHelper.register(userData);
    const dbUser = await dbHelper.waitForUser(userData.username);
    const userId = dbUser.id;

    // Submit order
    await apiHelper.submitOrder(createValidOrder());

    // Wait for processing
    const dbOrder = await dbHelper.waitForOrder(userId, 15000, 500);
    expect(dbOrder).toBeTruthy();

    // Verify created_at timestamp exists and is reasonable
    const createdAt = new Date(dbOrder.created_at);
    expect(createdAt.getTime()).toBeGreaterThan(0); // Valid timestamp

    // More lenient check - just verify it's within a reasonable timeframe (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(createdAt.getTime()).toBeGreaterThan(oneDayAgo.getTime());
  });

  test('should handle rapid consecutive order submissions', async () => {
    const userData = createValidUser();
    testUsers.push(userData);

    await apiHelper.register(userData);
    const dbUser = await dbHelper.waitForUser(userData.username);
    const userId = dbUser.id;

    // Submit 10 orders as fast as possible, each with a different product
    const submissions = [];
    for (let i = 0; i < 10; i++) {
      submissions.push(apiHelper.submitOrder(createValidOrder({ productId: (i % 11) + 1 })));
    }

    const responses = await Promise.all(submissions);

    // All submissions should succeed with 201 status
    responses.forEach(response => {
      expect(response.status).toBe(201);
      expect(response.data.messageId).toBeTruthy();
    });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 20000));

    // Verify all orders processed
    const dbOrders = await dbHelper.getOrdersByUserId(userId);
    expect(dbOrders.length).toBe(10);

    // Verify each order has valid product data
    for (const dbOrder of dbOrders) {
      expect(dbOrder.product_id).toBeTruthy();
      expect(dbOrder.product_name).toBeTruthy();
      expect(dbOrder.sku).toBeTruthy();
    }
  });
});
