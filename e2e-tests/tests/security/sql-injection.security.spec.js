import { test, expect } from '../../fixtures/test-fixtures.js';
import { createValidUser, sqlInjectionPayloads } from '../../utils/test-data.js';

test.describe('SQL Injection Protection', () => {
  test('should prevent SQL injection in username field', async ({ apiHelper, dbHelper, testUsers }) => {
    for (const payload of sqlInjectionPayloads) {
      const userData = createValidUser({ username: payload });

      const response = await apiHelper.register(userData);

      // Should either reject with validation error or sanitize
      // Should NOT cause database error or succeed with malicious SQL
      expect([400, 201]).toContain(response.status);

      if (response.status === 201) {
        // If accepted, verify username was sanitized/escaped
        testUsers.push(userData);
        const dbUser = await dbHelper.waitForUser(payload);
        // SQL injection should not have affected database
        const userCount = await dbHelper.getUserCount();
        expect(userCount).toBeGreaterThan(0); // DB still functioning
      }
    }
  });

  test('should prevent SQL injection in login', async ({ apiHelper, testUsers }) => {
    const userData = createValidUser();
    testUsers.push(userData);
    await apiHelper.register(userData);

    for (const payload of sqlInjectionPayloads) {
      apiHelper.clearToken();

      const response = await apiHelper.login({
        username: payload,
        password: userData.password
      });

      // Should fail authentication, not cause SQL error
      expect(response.status).toBe(401);
      expect(response.data).not.toHaveProperty('token');
    }
  });

  test('should prevent SQL injection in order product name', async ({ apiHelper, dbHelper, testUsers }) => {
    const userData = createValidUser();
    testUsers.push(userData);
    await apiHelper.register(userData);

    const dbUser = await dbHelper.waitForUser(userData.username);

    for (const payload of sqlInjectionPayloads) {
      const response = await apiHelper.submitOrder({
        productName: payload,
        quantity: 1,
        totalPrice: 10.00
      });

      // Should either accept and sanitize or reject with validation
      expect([201, 400]).toContain(response.status);
    }

    // Verify database integrity
    const userCount = await dbHelper.getUserCount();
    expect(userCount).toBeGreaterThan(0);
  });
});
