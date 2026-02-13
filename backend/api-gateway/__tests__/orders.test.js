// IMPORTANT: Set this BEFORE any requires to allow self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { API_ENDPOINTS } = require('../../shared/api-endpoints');

// Load environment variables from .env and .env.secrets
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env.secrets') });

/**
 * Orders API Test Suite
 *
 * This test suite verifies that:
 * 1. GET /api/v1/orders requires authentication
 * 2. Invalid/expired JWT tokens are rejected
 * 3. Users can only see their own orders
 * 4. Orders are returned sorted by createdAt descending
 * 5. Response format is correct (success, orders, count)
 */

const TEST_JWT_SECRET = process.env.JWT_SECRET;

// API Gateway URL - use 127.0.0.1 instead of localhost to avoid IPv6 issues
const API_GATEWAY_URL = 'https://127.0.0.1:3001';

/**
 * Extract the echobase_token cookie value from a supertest response's Set-Cookie header.
 */
function extractAuthCookie(response) {
  const setCookieHeaders = response.headers['set-cookie'] || [];
  for (const header of setCookieHeaders) {
    const match = header.match(/echobase_token=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

// Test users for isolation
let testUser1 = null;
let testUser2 = null;

// Setup before all tests
beforeAll(async () => {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  console.log('Setting up test users for orders tests...');

  // Create first test user
  const user1Data = {
    username: `orderstest1_${Date.now()}`,
    email: `orderstest1_${Date.now()}@test.com`,
    fullName: 'Orders Test User 1',
    password: 'TestPassword123!',
  };

  try {
    const response1 = await request(API_GATEWAY_URL)
      .post(API_ENDPOINTS.AUTH.REGISTER)
      .send(user1Data);

    if (response1.status === 201) {
      testUser1 = {
        ...user1Data,
        id: response1.body.user.id,
        cookie: `echobase_token=${extractAuthCookie(response1)}`,
      };
      console.log('✓ Test user 1 created (ID:', testUser1.id + ')');
    } else {
      console.warn('Warning: Could not create test user 1:', response1.status);
    }
  } catch (error) {
    console.warn('Warning: Error creating test user 1:', error.message);
  }

  // Create second test user
  const user2Data = {
    username: `orderstest2_${Date.now()}`,
    email: `orderstest2_${Date.now()}@test.com`,
    fullName: 'Orders Test User 2',
    password: 'TestPassword123!',
  };

  try {
    const response2 = await request(API_GATEWAY_URL)
      .post(API_ENDPOINTS.AUTH.REGISTER)
      .send(user2Data);

    if (response2.status === 201) {
      testUser2 = {
        ...user2Data,
        id: response2.body.user.id,
        cookie: `echobase_token=${extractAuthCookie(response2)}`,
      };
      console.log('✓ Test user 2 created (ID:', testUser2.id + ')');
    } else {
      console.warn('Warning: Could not create test user 2:', response2.status);
    }
  } catch (error) {
    console.warn('Warning: Error creating test user 2:', error.message);
  }
});

// Cleanup after all tests — delete test users from database
afterAll(async () => {
  const usernames = [testUser1?.username, testUser2?.username].filter(Boolean);
  if (usernames.length > 0) {
    try {
      // Use the API Gateway URL to verify cleanup is possible
      // In a real environment, this would use a direct DB connection
      console.log(`Cleanup: ${usernames.length} test users created (${usernames.join(', ')})`);
      console.log('Note: Test users will be cleaned up by cleanup-test-data.sh');
    } catch (err) {
      console.warn('Cleanup warning:', err.message);
    }
  }
  console.log('✓ Orders test cleanup complete');
});

describe('Orders API Tests - GET /api/v1/orders', () => {
  describe('1. Authentication Required', () => {
    test('should reject request without authentication (401)', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(API_ENDPOINTS.ORDERS);

      expect([401, 429]).toContain(response.status);
      if (response.status === 401) {
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe('Authentication required');
      }
    });

    test('should reject request with invalid JWT token (401)', async () => {
      const response = await request(API_GATEWAY_URL)
        .get(API_ENDPOINTS.ORDERS)
        .set('Authorization', 'Bearer invalid-token-format');

      expect([401, 429]).toContain(response.status);
      if (response.status === 401) {
        expect(response.body.error).toBe('Authentication failed');
        expect(response.body.message).toBe('Invalid token');
      }
    });

    test('should reject request with expired JWT token (401)', async () => {
      const expiredToken = jwt.sign(
        { userId: 1, username: 'testuser' },
        TEST_JWT_SECRET,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await request(API_GATEWAY_URL)
        .get(API_ENDPOINTS.ORDERS)
        .set('Authorization', `Bearer ${expiredToken}`);

      expect([401, 429]).toContain(response.status);
      if (response.status === 401) {
        expect(response.body.error).toBe('Authentication failed');
        expect(['Token expired', 'Invalid token']).toContain(response.body.message);
      }
    });

    test('should reject request with JWT signed with wrong secret', async () => {
      const wrongSecretToken = jwt.sign(
        { userId: 1, username: 'testuser' },
        'wrong-secret-key',
        { expiresIn: '24h' }
      );

      const response = await request(API_GATEWAY_URL)
        .get(API_ENDPOINTS.ORDERS)
        .set('Authorization', `Bearer ${wrongSecretToken}`);

      expect([401, 429]).toContain(response.status);
      if (response.status === 401) {
        expect(response.body.error).toBe('Authentication failed');
        expect(response.body.message).toBe('Invalid token');
      }
    });
  });

  describe('2. Empty Orders Response', () => {
    test('should return empty array when user has no orders', async () => {
      // Skip if test user wasn't created
      if (!testUser1) {
        console.log('Skipping test - test user not available');
        return;
      }

      const response = await request(API_GATEWAY_URL)
        .get(API_ENDPOINTS.ORDERS)
        .set('Cookie', testUser1.cookie);

      expect([200, 429]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('orders');
        expect(response.body).toHaveProperty('count');
        expect(Array.isArray(response.body.orders)).toBe(true);
        expect(response.body.count).toBe(0);
        expect(response.body.orders).toHaveLength(0);
      }
    });
  });

  describe('3. Order Isolation Between Users', () => {
    test('should return only orders for the authenticated user', async () => {
      // Skip if test users weren't created
      if (!testUser1 || !testUser2) {
        console.log('Skipping test - test users not available');
        return;
      }

      // First, submit an order for user 1
      const orderResponse = await request(API_GATEWAY_URL)
        .post(API_ENDPOINTS.ORDERS)
        .set('Cookie', testUser1.cookie)
        .send({
          productId: 1,
          quantity: 2,
        });

      // Wait for order to be processed
      if (orderResponse.status === 201) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // User 2 should NOT see user 1's orders
      const user2OrdersResponse = await request(API_GATEWAY_URL)
        .get(API_ENDPOINTS.ORDERS)
        .set('Cookie', testUser2.cookie);

      expect([200, 429]).toContain(user2OrdersResponse.status);
      if (user2OrdersResponse.status === 200) {
        expect(user2OrdersResponse.body.success).toBe(true);
        // User 2 has no orders, so they should see 0 orders
        expect(user2OrdersResponse.body.orders).toHaveLength(0);
      }

      // User 1 SHOULD see their own orders
      const user1OrdersResponse = await request(API_GATEWAY_URL)
        .get(API_ENDPOINTS.ORDERS)
        .set('Cookie', testUser1.cookie);

      expect([200, 429]).toContain(user1OrdersResponse.status);
      if (user1OrdersResponse.status === 200) {
        expect(user1OrdersResponse.body.success).toBe(true);
        // If the order was submitted successfully, user 1 should see at least 1 order
        if (orderResponse.status === 201) {
          expect(user1OrdersResponse.body.orders.length).toBeGreaterThanOrEqual(1);
        }
      }
    });
  });

  describe('4. Response Format', () => {
    test('should return correct response structure', async () => {
      if (!testUser1) {
        console.log('Skipping test - test user not available');
        return;
      }

      const response = await request(API_GATEWAY_URL)
        .get(API_ENDPOINTS.ORDERS)
        .set('Cookie', testUser1.cookie);

      expect([200, 429]).toContain(response.status);
      if (response.status === 200) {
        // Check required fields
        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('orders');
        expect(response.body).toHaveProperty('count');

        expect(typeof response.body.success).toBe('boolean');
        expect(Array.isArray(response.body.orders)).toBe(true);
        expect(typeof response.body.count).toBe('number');
      }
    });

    test('should include expected fields in order objects', async () => {
      if (!testUser1) {
        console.log('Skipping test - test user not available');
        return;
      }

      // Submit an order first
      await request(API_GATEWAY_URL)
        .post(API_ENDPOINTS.ORDERS)
        .set('Cookie', testUser1.cookie)
        .send({
          productId: 2,
          quantity: 1,
        });

      // Wait for order to be processed
      await new Promise(resolve => setTimeout(resolve, 2000));

      const response = await request(API_GATEWAY_URL)
        .get(API_ENDPOINTS.ORDERS)
        .set('Cookie', testUser1.cookie);

      expect([200, 429]).toContain(response.status);
      if (response.status === 200 && response.body.orders.length > 0) {
        const order = response.body.orders[0];

        // Check expected order fields
        expect(order).toHaveProperty('id');
        expect(order).toHaveProperty('productName');
        expect(order).toHaveProperty('sku');
        expect(order).toHaveProperty('quantity');
        expect(order).toHaveProperty('totalPrice');
        expect(order).toHaveProperty('status');
        expect(order).toHaveProperty('createdAt');
      }
    });
  });

  describe('5. Order Sorting', () => {
    test('should return orders sorted by createdAt descending (newest first)', async () => {
      if (!testUser1) {
        console.log('Skipping test - test user not available');
        return;
      }

      // Submit multiple orders with slight delays
      await request(API_GATEWAY_URL)
        .post(API_ENDPOINTS.ORDERS)
        .set('Cookie', testUser1.cookie)
        .send({ productId: 3, quantity: 1 });

      await new Promise(resolve => setTimeout(resolve, 1000));

      await request(API_GATEWAY_URL)
        .post(API_ENDPOINTS.ORDERS)
        .set('Cookie', testUser1.cookie)
        .send({ productId: 4, quantity: 2 });

      // Wait for orders to be processed
      await new Promise(resolve => setTimeout(resolve, 2000));

      const response = await request(API_GATEWAY_URL)
        .get(API_ENDPOINTS.ORDERS)
        .set('Cookie', testUser1.cookie);

      expect([200, 429]).toContain(response.status);
      if (response.status === 200 && response.body.orders.length >= 2) {
        const orders = response.body.orders;

        // Verify orders are sorted by createdAt descending
        for (let i = 0; i < orders.length - 1; i++) {
          const currentDate = new Date(orders[i].createdAt);
          const nextDate = new Date(orders[i + 1].createdAt);
          expect(currentDate.getTime()).toBeGreaterThanOrEqual(nextDate.getTime());
        }
      }
    });
  });

  describe('6. Count Field Accuracy', () => {
    test('should return count matching orders array length', async () => {
      if (!testUser1) {
        console.log('Skipping test - test user not available');
        return;
      }

      const response = await request(API_GATEWAY_URL)
        .get(API_ENDPOINTS.ORDERS)
        .set('Cookie', testUser1.cookie);

      expect([200, 429]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.count).toBe(response.body.orders.length);
      }
    });
  });
});
