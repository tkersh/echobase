import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { apiKeyAuth } from './middleware/apiKeyAuth';
import { getRecommendedProducts } from './tools/getRecommendedProducts';

const app = express();
const PORT = parseInt(process.env.PORT || '3002', 10);

// Security headers
app.use(helmet());

// API key auth middleware
app.use(apiKeyAuth);

// Health endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Track active transports for SSE sessions
const transports: Record<string, SSEServerTransport> = {};

// SSE endpoint - establishes event stream
app.get('/sse', async (req, res) => {
  const server = new McpServer({
    name: 'echobase-recommendations',
    version: '1.0.0',
  });

  // Register the getRecommendedProducts tool
  server.tool(
    'getRecommendedProducts',
    'Get recommended products for the user',
    { userId: z.string().describe('The ID of the user to get recommendations for') },
    async ({ userId }) => {
      const products = getRecommendedProducts(userId);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(products),
          },
        ],
      };
    }
  );

  const transport = new SSEServerTransport('/messages', res);
  transports[transport.sessionId] = transport;

  res.on('close', () => {
    delete transports[transport.sessionId];
  });

  await server.connect(transport);
});

// Messages endpoint - receives client messages
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];

  if (!transport) {
    res.status(400).json({ error: 'Invalid session' });
    return;
  }

  await transport.handlePostMessage(req, res);
});

// Error handler - no stack traces
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
});

export { app };
