import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
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

  const providedBuf = Buffer.from(String(providedKey));
  const expectedBuf = Buffer.from(apiKey);
  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  next();
}
