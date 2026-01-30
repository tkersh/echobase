import request from 'supertest';
import express from 'express';
import helmet from 'helmet';
import { apiKeyAuth } from '../src/middleware/apiKeyAuth';

describe('MCP Server Security', () => {
  let app: express.Application;
  const TEST_API_KEY = 'test-api-key-12345';

  beforeEach(() => {
    process.env.MCP_API_KEY = TEST_API_KEY;
    app = express();
    app.use(helmet());
    app.use(apiKeyAuth);

    app.get('/health', (_req, res) => {
      res.json({ status: 'healthy' });
    });

    app.get('/sse', (_req, res) => {
      res.json({ status: 'ok' });
    });

    // Error handler - no stack traces
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: 'Internal server error' });
    });
  });

  afterEach(() => {
    delete process.env.MCP_API_KEY;
  });

  it('should reject requests without API key with 401', async () => {
    const response = await request(app).get('/sse');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('API key required');
  });

  it('should reject requests with invalid API key with 401', async () => {
    const response = await request(app)
      .get('/sse')
      .set('X-API-Key', 'wrong-key');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid API key');
  });

  it('should allow health check without API key', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
  });

  it('should include Helmet security headers', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('should not expose stack traces in errors', async () => {
    // Test that error responses don't contain stack traces
    const response = await request(app).get('/sse');
    expect(response.body).not.toHaveProperty('stack');
    expect(JSON.stringify(response.body)).not.toMatch(/at\s+\w+\s+\(/);
  });

  it('should return 500 when API key is not configured', async () => {
    delete process.env.MCP_API_KEY;
    const response = await request(app).get('/sse');
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Server configuration error');
  });
});
