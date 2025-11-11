import { test, expect } from '../../fixtures/test-fixtures.js';

test.describe('Rate Limiting', () => {
  test.skip('should rate limit excessive requests', async ({ apiHelper }) => {
    // This test is skipped by default as it may take time
    // and depends on your rate limiting configuration

    const requests = [];

    // Make 150 requests rapidly (assuming 100/15min limit)
    for (let i = 0; i < 150; i++) {
      requests.push(apiHelper.healthCheck());
    }

    const responses = await Promise.all(requests);

    // Some requests should be rate limited
    const rateLimitedCount = responses.filter(r => r.status === 429).length;

    // At least some should be rate limited
    // Exact number depends on your configuration
    expect(rateLimitedCount).toBeGreaterThan(0);
  });
});
