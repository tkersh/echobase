import { test, expect } from '../../fixtures/test-fixtures.js';

test.describe('Rate Limiting', () => {
  test('should rate limit excessive requests', async ({ apiHelper }) => {
    // Hit a rate-limited endpoint (rate limiter applies to /api/v1/ routes only)
    // Default config: RATE_LIMIT_MAX_REQUESTS=100 per RATE_LIMIT_WINDOW_MS=900000
    const requests = [];

    // Make 150 requests rapidly (exceeds 100/15min default limit)
    for (let i = 0; i < 150; i++) {
      const context = await apiHelper.createContext();
      requests.push(
        context.get('/api/v1/orders').then(r => ({ status: r.status }))
      );
    }

    const responses = await Promise.all(requests);

    // Some requests should be rate limited (HTTP 429)
    const rateLimitedCount = responses.filter(r => r.status === 429).length;

    expect(rateLimitedCount).toBeGreaterThan(0);
  });
});
