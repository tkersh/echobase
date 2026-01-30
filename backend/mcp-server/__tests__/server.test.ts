import request from 'supertest';
import express from 'express';
import helmet from 'helmet';
import { apiKeyAuth } from '../src/middleware/apiKeyAuth';

describe('MCP Server Endpoints', () => {
  let app: express.Application;
  const TEST_API_KEY = 'test-api-key-12345';

  beforeEach(() => {
    process.env.MCP_API_KEY = TEST_API_KEY;
    app = express();
    app.use(helmet());
    app.use(apiKeyAuth);

    app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      });
    });
  });

  afterEach(() => {
    delete process.env.MCP_API_KEY;
  });

  it('should return healthy status with timestamp and version', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body.version).toBe('1.0.0');

    // Verify timestamp is valid ISO string
    const timestamp = new Date(response.body.timestamp);
    expect(timestamp.toISOString()).toBe(response.body.timestamp);
  });

  it('should accept valid API key on protected endpoints', async () => {
    // Add a test protected endpoint
    app.get('/test-protected', (_req, res) => {
      res.json({ status: 'ok' });
    });

    const response = await request(app)
      .get('/test-protected')
      .set('X-API-Key', TEST_API_KEY);
    expect(response.status).toBe(200);
  });
});
