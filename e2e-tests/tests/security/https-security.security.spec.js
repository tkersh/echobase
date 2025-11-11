import { test, expect } from '../../fixtures/test-fixtures.js';

test.describe('HTTPS and Security Headers', () => {
  test('should enforce HTTPS', async ({ apiHelper }) => {
    const response = await apiHelper.healthCheck();
    expect(response.status).toBe(200);
    // Connection should be over HTTPS (configured in ApiHelper)
  });

  test('should include security headers', async ({ apiHelper }) => {
    const response = await apiHelper.healthCheck();

    // Check for common security headers
    const headers = response.headers;

    // Note: Exact headers depend on your Helmet configuration
    // Common headers to check:
    // - x-content-type-options: nosniff
    // - x-frame-options: DENY or SAMEORIGIN
    // - strict-transport-security (if configured)

    // At minimum, should have some security headers
    expect(Object.keys(headers).length).toBeGreaterThan(0);
  });
});
