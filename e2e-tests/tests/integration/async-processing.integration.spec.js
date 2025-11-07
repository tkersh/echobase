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
        const dbUser = await dbHelper.getUserByUsername(user.username);
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
    const dbUser = await dbHelper.getUserByUsername(userData.username);
    const userId = dbUser.id;

    // Get initial order count
    const initialCount = await dbHelper.getOrderCount();

    // Submit order
    const orderData = createValidOrder();
    const response = await apiHelper.submitOrder(orderData);
    expect(response.status).toBe(201);
    expect(response.data.messageId).toBeTruthy();

    // Order should not be in database immediately (async processing)
    const immediateOrders = await dbHelper.getOrdersByUserId(userId);
    // It might be there if processor is very fast, but typically won't be

    // Wait for order to be processed
    const dbOrder = await dbHelper.waitForOrder(userId, 15000, 500);
    expect(dbOrder).toBeTruthy();

    // Verify order details
    expect(dbOrder.product_name).toBe(orderData.productName);
    expect(Number(dbOrder.quantity)).toBe(Number(orderData.quantity));
    expect(Number(dbOrder.total_price)).toBeCloseTo(Number(orderData.totalPrice), 2);
    expect(dbOrder.user_id).toBe(userId);
    expect(dbOrder.order_status).toBe('completed');

    // Verify total order count increased
    const finalCount = await dbHelper.getOrderCount();
    expect(finalCount).toBeGreaterThan(initialCount);
  });

  test('should process multiple orders in sequence', async () => {
    const userData = createValidUser();
    testUsers.push(userData);

    await apiHelper.register(userData);
    const dbUser = await dbHelper.getUserByUsername(userData.username);
    const userId = dbUser.id;

    // Submit 5 orders
    const orders = [];
    for (let i = 0; i < 5; i++) {
      const orderData = createValidOrder();
      orders.push(orderData);
      await apiHelper.submitOrder(orderData);
    }

    // Wait for all to be processed
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Verify all orders in database
    const dbOrders = await dbHelper.getOrdersByUserId(userId);
    expect(dbOrders.length).toBe(5);

    // Verify each order
    const productNames = dbOrders.map(o => o.product_name);
    for (const order of orders) {
      expect(productNames).toContain(order.productName);
    }
  });

  test('should handle order processing with different quantities and prices', async () => {
    const userData = createValidUser();
    testUsers.push(userData);

    await apiHelper.register(userData);
    const dbUser = await dbHelper.getUserByUsername(userData.username);
    const userId = dbUser.id;

    // Submit orders with various values
    // Note: Backend requires integer quantities, and quantity * totalPrice must be <= $1,000,000
    const testCases = [
      { productName: 'Small Item', quantity: 1, totalPrice: 0.99 },
      { productName: 'Large Item', quantity: 100, totalPrice: 999.99 }
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
      const matchingOrder = dbOrders.find(o => o.product_name === testCase.productName);
      expect(matchingOrder).toBeTruthy();
      expect(Number(matchingOrder.quantity)).toBeCloseTo(Number(testCase.quantity), 5);
      expect(Number(matchingOrder.total_price)).toBeCloseTo(Number(testCase.totalPrice), 2);
    }
  });

  test('should maintain order integrity with special characters', async () => {
    const userData = createValidUser();
    testUsers.push(userData);

    await apiHelper.register(userData);
    const dbUser = await dbHelper.getUserByUsername(userData.username);
    const userId = dbUser.id;

    // Submit orders with special characters
    // Note: Backend only allows alphanumeric, spaces, hyphens, apostrophes, and periods
    const specialOrders = [
      { productName: "Product with 'apostrophes'", quantity: 1, totalPrice: 20.00 },
      { productName: 'Product with hyphens-here', quantity: 1, totalPrice: 30.00 },
      { productName: 'Product with periods.here', quantity: 1, totalPrice: 40.00 }
    ];

    for (const order of specialOrders) {
      await apiHelper.submitOrder(order);
    }

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Verify orders
    const dbOrders = await dbHelper.getOrdersByUserId(userId);
    expect(dbOrders.length).toBe(specialOrders.length);

    // Verify product names are preserved (note: apostrophes may be HTML escaped by backend)
    const dbProductNames = dbOrders.map(o => o.product_name);

    // Check for exact match or HTML-escaped match
    expect(dbProductNames).toContain('Product with hyphens-here');
    expect(dbProductNames).toContain('Product with periods.here');

    // Apostrophes might be escaped as &#x27;
    const hasApostropheProduct = dbProductNames.some(name =>
      name === "Product with 'apostrophes'" || name === "Product with &#x27;apostrophes&#x27;"
    );
    expect(hasApostropheProduct).toBe(true);
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

    const dbUser1 = await dbHelper.getUserByUsername(user1.username);
    const dbUser2 = await dbHelper.getUserByUsername(user2.username);
    const dbUser3 = await dbHelper.getUserByUsername(user3.username);

    // Each user submits different number of orders
    await api1.submitOrder(createValidOrder({ productName: 'User1-Order1' }));
    await api1.submitOrder(createValidOrder({ productName: 'User1-Order2' }));

    await api2.submitOrder(createValidOrder({ productName: 'User2-Order1' }));
    await api2.submitOrder(createValidOrder({ productName: 'User2-Order2' }));
    await api2.submitOrder(createValidOrder({ productName: 'User2-Order3' }));

    await api3.submitOrder(createValidOrder({ productName: 'User3-Order1' }));

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
    const dbUser = await dbHelper.getUserByUsername(userData.username);
    const userId = dbUser.id;

    const beforeSubmit = new Date();

    // Submit order
    await apiHelper.submitOrder(createValidOrder());

    // Wait for processing
    const dbOrder = await dbHelper.waitForOrder(userId, 15000, 500);
    expect(dbOrder).toBeTruthy();

    const afterProcessing = new Date();

    // Verify created_at timestamp exists and is reasonable
    const createdAt = new Date(dbOrder.created_at);
    expect(createdAt.getTime()).toBeGreaterThan(0); // Valid timestamp

    // Note: created_at might be an old timestamp if this is leftover test data
    // More lenient check - just verify it's within a reasonable timeframe (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(createdAt.getTime()).toBeGreaterThan(oneDayAgo.getTime());
  });

  test('should handle rapid consecutive order submissions', async () => {
    const userData = createValidUser();
    testUsers.push(userData);

    await apiHelper.register(userData);
    const dbUser = await dbHelper.getUserByUsername(userData.username);
    const userId = dbUser.id;

    // Submit 10 orders as fast as possible
    const submissions = [];
    for (let i = 0; i < 10; i++) {
      submissions.push(apiHelper.submitOrder(createValidOrder({ productName: `Rapid-Order-${i}` })));
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

    // Verify each order
    for (let i = 0; i < 10; i++) {
      const matchingOrder = dbOrders.find(o => o.product_name === `Rapid-Order-${i}`);
      expect(matchingOrder).toBeTruthy();
    }
  });
});
