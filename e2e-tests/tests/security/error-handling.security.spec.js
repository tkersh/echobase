import { test, expect } from '../../fixtures/test-fixtures.js';

test.describe('Error Handling', () => {
  test('should not leak sensitive information in error messages', async ({ apiHelper }) => {
    // Try to login with non-existent user
    const response = await apiHelper.login({
      username: 'nonexistent',
      password: 'TestPass123'
    });

    expect(response.status).toBe(401);

    // Error message should not reveal if user exists or not
    const errorMsg = response.data.error || '';
    expect(errorMsg.toLowerCase()).not.toContain('user not found');
    expect(errorMsg.toLowerCase()).not.toContain('username');
    expect(errorMsg.toLowerCase()).not.toContain('does not exist');
  });

  test('should handle database errors gracefully', async ({ apiHelper }) => {
    // This test depends on what triggers DB errors in your system
    // For now, just ensure malformed requests don't crash
    const response = await apiHelper.request('POST', '/api/orders', {
      data: { invalid: 'data' }
    });

    // Should return error, not crash
    expect([400, 401, 500]).toContain(response.status);
    expect(response.data).toBeTruthy();
  });
});
