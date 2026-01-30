"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const sse_js_1 = require("@modelcontextprotocol/sdk/server/sse.js");
const apiKeyAuth_1 = require("./middleware/apiKeyAuth");
const getRecommendedProducts_1 = require("./tools/getRecommendedProducts");
const app = (0, express_1.default)();
exports.app = app;
const PORT = parseInt(process.env.PORT || '3002', 10);
// Security headers
app.use((0, helmet_1.default)());
// API key auth middleware
app.use(apiKeyAuth_1.apiKeyAuth);
// Health endpoint
app.get('/health', (_req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
});
// Track active transports for SSE sessions
const transports = {};
// SSE endpoint - establishes event stream
app.get('/sse', async (req, res) => {
    const server = new mcp_js_1.McpServer({
        name: 'echobase-recommendations',
        version: '1.0.0',
    });
    // Register the getRecommendedProducts tool
    server.tool('getRecommendedProducts', 'Get recommended products for the user', {}, async () => {
        const products = (0, getRecommendedProducts_1.getRecommendedProducts)();
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(products),
                },
            ],
        };
    });
    const transport = new sse_js_1.SSEServerTransport('/messages', res);
    transports[transport.sessionId] = transport;
    res.on('close', () => {
        delete transports[transport.sessionId];
    });
    await server.connect(transport);
});
// Messages endpoint - receives client messages
app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = transports[sessionId];
    if (!transport) {
        res.status(400).json({ error: 'Invalid session' });
        return;
    }
    await transport.handlePostMessage(req, res);
});
// Error handler - no stack traces
app.use((err, _req, res, _next) => {
    console.error('Server error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});
app.listen(PORT, () => {
    console.log(`MCP Server running on port ${PORT}`);
});
//# sourceMappingURL=index.js.map