import { test, expect } from '../../fixtures/test-fixtures.js';
import { createValidUser, sqlInjectionPayloads } from '../../utils/test-data.js';

test.describe('SQL Injection Protection', () => {
  test('should prevent SQL injection in username field', async ({ apiHelper, dbHelper, testUsers }) => {
    for (const payload of sqlInjectionPayloads) {
      const userData = createValidUser({ username: payload });

      const response = await apiHelper.register(userData);

      // Must reject with validation error — SQL injection payloads should
      // never pass input validation (username must match ^[a-zA-Z0-9_]+$)
      expect(response.status).toBe(400);
    }
  });

  test('should prevent SQL injection in login', async ({ apiHelper, testUsers }) => {
    const userData = createValidUser();
    testUsers.push(userData);
    await apiHelper.register(userData);

    for (const payload of sqlInjectionPayloads) {
      await apiHelper.clearToken();

      const response = await apiHelper.login({
        username: payload,
        password: userData.password
      });

      // Should fail authentication, not cause SQL error
      expect(response.status).toBe(401);
      expect(response.data).not.toHaveProperty('token');
    }
  });

  test('should prevent SQL injection in order productId field', async ({ apiHelper, dbHelper, testUsers }) => {
    const userData = createValidUser();
    testUsers.push(userData);
    await apiHelper.register(userData);

    const dbUser = await dbHelper.waitForUser(userData.username);

    for (const payload of sqlInjectionPayloads) {
      const response = await apiHelper.submitOrder({
        productId: payload,
        quantity: 1
      });

      // Should reject with validation error (productId must be an integer)
      expect(response.status).toBe(400);
    }

    // Verify database integrity
    const userCount = await dbHelper.getUserCount();
    expect(userCount).toBeGreaterThan(0);
  });
});
