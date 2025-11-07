import { test, expect } from '@playwright/test';
import ApiHelper from '../../utils/api-helper.js';
import DatabaseHelper from '../../utils/db-helper.js';
import {
  createValidUser,
  generateUsername,
  generateEmail,
  invalidPasswords
} from '../../utils/test-data.js';

test.describe('Authentication API Tests', () => {
  let apiHelper;
  let dbHelper;
  const testUsers = [];

  test.beforeEach(async () => {
    apiHelper = new ApiHelper();
    dbHelper = new DatabaseHelper();
    await dbHelper.connect();
  });

  test.afterEach(async ({ }, testInfo) => {
    // Cleanup: Delete test users created during this test
    for (const user of testUsers) {
      try {
        const dbUser = await dbHelper.getUserByUsername(user.username);
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

  test.describe('User Registration', () => {
    test('should register a new user with valid data', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      const response = await apiHelper.register(userData);

      expect(response.status).toBe(201);
      expect(response.ok).toBeTruthy();
      expect(response.data).toHaveProperty('token');
      expect(response.data).toHaveProperty('user');
      expect(response.data.user.username).toBe(userData.username);
      expect(response.data.user.email).toBe(userData.email);
      expect(response.data.user.fullName).toBe(userData.fullName);
      expect(response.data.user).not.toHaveProperty('password');
      expect(response.data.user).not.toHaveProperty('password_hash');

      // Verify user exists in database
      const dbUser = await dbHelper.getUserByUsername(userData.username);
      expect(dbUser).toBeTruthy();
      expect(dbUser.username).toBe(userData.username);
      expect(dbUser.email).toBe(userData.email);
      expect(dbUser.full_name).toBe(userData.fullName);
      expect(dbUser.password_hash).toBeTruthy();
      expect(dbUser.password_hash).not.toBe(userData.password); // Password should be hashed
    });

    test('should reject registration with duplicate username', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      // First registration
      const response1 = await apiHelper.register(userData);
      expect(response1.status).toBe(201);

      // Second registration with same username
      const duplicateUser = createValidUser({
        username: userData.username,
        email: generateEmail() // Different email
      });

      const response2 = await apiHelper.register(duplicateUser);
      expect(response2.status).toBe(409);
      expect(response2.ok).toBeFalsy();
      expect(response2.data.error).toBeTruthy();
    });

    test('should reject registration with duplicate email', async () => {
      const userData = createValidUser();
      testUsers.push(userData);

      // First registration
      const response1 = await apiHelper.register(userData);
      expect(response1.status).toBe(201);

      // Second registration with same email
      const duplicateUser = createValidUser({
        username: generateUsername(), // Different username
        email: userData.email
      });
      testUsers.push(duplicateUser);

      const response2 = await apiHelper.register(duplicateUser);
      expect(response2.status).toBe(409);
      expect(response2.ok).toBeFalsy();
      expect(response2.data.error).toBeTruthy();
    });

    test('should reject registration with missing username', async () => {
      const userData = createValidUser();
      delete userData.username;

      const response = await apiHelper.register(userData);
      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });

    test('should reject registration with missing email', async () => {
      const userData = createValidUser();
      delete userData.email;
      testUsers.push(userData);

      const response = await apiHelper.register(userData);
      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });

    test('should reject registration with invalid email format', async () => {
      const userData = createValidUser({ email: 'invalid-email' });
      testUsers.push(userData);

      const response = await apiHelper.register(userData);
      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });

    test('should reject registration with short password', async () => {
      const userData = createValidUser({ password: invalidPasswords.tooShort });
      testUsers.push(userData);

      const response = await apiHelper.register(userData);
      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });

    test('should reject registration with password missing uppercase', async () => {
      const userData = createValidUser({ password: invalidPasswords.noUppercase });
      testUsers.push(userData);

      const response = await apiHelper.register(userData);
      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });

    test('should reject registration with password missing lowercase', async () => {
      const userData = createValidUser({ password: invalidPasswords.noLowercase });
      testUsers.push(userData);

      const response = await apiHelper.register(userData);
      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });

    test('should reject registration with password missing number', async () => {
      const userData = createValidUser({ password: invalidPasswords.noNumber });
      testUsers.push(userData);

      const response = await apiHelper.register(userData);
      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });

    test('should reject registration with empty password', async () => {
      const userData = createValidUser({ password: invalidPasswords.empty });
      testUsers.push(userData);

      const response = await apiHelper.register(userData);
      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });
  });

  test.describe('User Login', () => {
    test('should login with valid credentials', async () => {
      // First register a user
      const userData = createValidUser();
      testUsers.push(userData);

      const regResponse = await apiHelper.register(userData);
      expect(regResponse.status).toBe(201);

      // Clear token to test login
      apiHelper.clearToken();

      // Now login
      const loginResponse = await apiHelper.login({
        username: userData.username,
        password: userData.password
      });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.ok).toBeTruthy();
      expect(loginResponse.data).toHaveProperty('token');
      expect(loginResponse.data).toHaveProperty('user');
      expect(loginResponse.data.user.username).toBe(userData.username);
      expect(loginResponse.data.user).not.toHaveProperty('password');
      expect(loginResponse.data.user).not.toHaveProperty('password_hash');
    });

    test('should reject login with invalid username', async () => {
      const response = await apiHelper.login({
        username: 'nonexistentuser',
        password: 'TestPass123'
      });

      expect(response.status).toBe(401);
      expect(response.ok).toBeFalsy();
      expect(response.data.error).toBeTruthy();
      expect(response.data).not.toHaveProperty('token');
    });

    test('should reject login with invalid password', async () => {
      // First register a user
      const userData = createValidUser();
      testUsers.push(userData);

      const regResponse = await apiHelper.register(userData);
      expect(regResponse.status).toBe(201);

      apiHelper.clearToken();

      // Try to login with wrong password
      const loginResponse = await apiHelper.login({
        username: userData.username,
        password: 'WrongPassword123'
      });

      expect(loginResponse.status).toBe(401);
      expect(loginResponse.ok).toBeFalsy();
      expect(loginResponse.data.error).toBeTruthy();
      expect(loginResponse.data).not.toHaveProperty('token');
    });

    test('should reject login with missing username', async () => {
      const response = await apiHelper.login({
        password: 'TestPass123'
      });

      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });

    test('should reject login with missing password', async () => {
      const response = await apiHelper.login({
        username: 'testuser'
      });

      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });

    test('should reject login with empty credentials', async () => {
      const response = await apiHelper.login({});

      expect(response.status).toBe(400);
      expect(response.ok).toBeFalsy();
    });
  });

  test.describe('JWT Token Validation', () => {
    test('should accept valid JWT token for protected endpoints', async () => {
      // Register and get token
      const userData = createValidUser();
      testUsers.push(userData);

      const regResponse = await apiHelper.register(userData);
      expect(regResponse.status).toBe(201);

      // Token is automatically set in apiHelper
      expect(apiHelper.token).toBeTruthy();

      // Try to access protected endpoint
      const orderResponse = await apiHelper.submitOrder({
        productName: 'Test Product',
        quantity: 1,
        totalPrice: 100
      });

      // Should succeed (or fail with validation error, but not auth error)
      expect([200, 201, 400]).toContain(orderResponse.status);
      expect(orderResponse.status).not.toBe(401);
    });

    test('should reject requests without JWT token', async () => {
      apiHelper.clearToken();

      const response = await apiHelper.submitOrder({
        productName: 'Test Product',
        quantity: 1,
        totalPrice: 100
      });

      expect(response.status).toBe(401);
      expect(response.ok).toBeFalsy();
    });

    test('should reject requests with invalid JWT token', async () => {
      apiHelper.setToken('invalid.jwt.token');

      const response = await apiHelper.submitOrder({
        productName: 'Test Product',
        quantity: 1,
        totalPrice: 100
      });

      expect(response.status).toBe(401);
      expect(response.ok).toBeFalsy();
    });

    test('should reject requests with malformed JWT token', async () => {
      apiHelper.setToken('not-a-valid-jwt-format');

      const response = await apiHelper.submitOrder({
        productName: 'Test Product',
        quantity: 1,
        totalPrice: 100
      });

      expect(response.status).toBe(401);
      expect(response.ok).toBeFalsy();
    });
  });
});
