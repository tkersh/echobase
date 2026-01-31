const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { log, logError, warn } = require('../../shared/logger');

let mcpClient = null;

/**
 * Initialize MCP client connection to the durable MCP server.
 * Non-blocking: logs warning on failure, API gateway starts normally.
 */
async function initMcpClient() {
  const endpoint = process.env.MCP_SERVER_ENDPOINT;
  const apiKey = process.env.MCP_API_KEY;

  if (!endpoint) {
    warn('MCP_SERVER_ENDPOINT not configured - product recommendations unavailable');
    return;
  }

  if (!apiKey) {
    warn('MCP_API_KEY not configured - product recommendations unavailable');
    return;
  }

  try {
    log(`Connecting to MCP server at ${endpoint}...`);
    log(`MCP API key configured: ${apiKey ? 'yes (' + apiKey.substring(0, 8) + '...)' : 'NO'}`);

    const transport = new SSEClientTransport(
      new URL(`${endpoint}/sse`),
      {
        requestInit: {
          headers: {
            'X-API-Key': apiKey,
          },
        },
      }
    );

    mcpClient = new Client({
      name: 'echobase-api-gateway',
      version: '1.0.0',
    });

    await mcpClient.connect(transport);
    log('MCP client connected successfully - product recommendations enabled');
  } catch (err) {
    warn(`Failed to connect to MCP server: ${err.message}`);
    warn('Product recommendations will be unavailable. If this is an auth error, the MCP server and API gateway may have different MCP_API_KEY values (see docs/Troubleshooting.md)');
    mcpClient = null;
  }
}

/**
 * Get recommended products from the MCP server.
 * Returns empty array on any error (graceful degradation).
 */
async function getRecommendedProducts(userId) {
  if (!mcpClient) {
    return [];
  }

  try {
    const result = await mcpClient.callTool({
      name: 'getRecommendedProducts',
      arguments: { userId: String(userId) },
    });

    if (result && result.content && result.content.length > 0) {
      const textContent = result.content.find(c => c.type === 'text');
      if (textContent) {
        return JSON.parse(textContent.text);
      }
    }

    return [];
  } catch (err) {
    warn(`Failed to get recommended products: ${err.message}`);
    return [];
  }
}

module.exports = { initMcpClient, getRecommendedProducts };
