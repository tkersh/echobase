"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyAuth = apiKeyAuth;
function apiKeyAuth(req, res, next) {
    // Health endpoint is exempt from API key auth
    if (req.path === '/health') {
        next();
        return;
    }
    const apiKey = process.env.MCP_API_KEY;
    if (!apiKey) {
        res.status(500).json({ error: 'Server configuration error' });
        return;
    }
    const providedKey = req.headers['x-api-key'];
    if (!providedKey) {
        res.status(401).json({ error: 'API key required' });
        return;
    }
    if (providedKey !== apiKey) {
        res.status(401).json({ error: 'Invalid API key' });
        return;
    }
    next();
}
//# sourceMappingURL=apiKeyAuth.js.map