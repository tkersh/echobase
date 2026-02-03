import { test, expect } from '../../fixtures/test-fixtures.js';

// Skipped in E2E: CI sets RATE_LIMIT_MAX_REQUESTS=100000 to avoid interfering with
// other test suites. This test can't send enough requests to hit that limit, and the
// rate limit is a process-level config on the running API gateway — can't be changed
// per-test. Rate limiting is covered at the unit level in:
//   backend/api-gateway/__tests__/security.test.js
test.describe.skip('Rate Limiting', () => {
  test('should rate limit excessive requests', async ({ apiHelper }) => {
    const requests = [];

    for (let i = 0; i < 150; i++) {
      const context = await apiHelper.createContext();
      requests.push(
        context.get('/api/v1/orders').then(r => ({ status: r.status }))
      );
    }

    const responses = await Promise.all(requests);
    const rateLimitedCount = responses.filter(r => r.status === 429).length;

    expect(rateLimitedCount).toBeGreaterThan(0);
  });
});
