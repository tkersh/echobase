const jwt = require('jsonwebtoken');
const { logError } = require('../../shared/logger');

/**
 * JWT Authentication Middleware
 * Verifies JWT token from Authorization header (Bearer token)
 */
const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Missing or invalid Authorization header',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid token',
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Token expired',
      });
    }

    logError('JWT authentication error:', error);
    return res.status(500).json({
      error: 'Authentication error',
      message: 'An error occurred during authentication',
    });
  }
};

/**
 * API Key Authentication Middleware
 * Verifies API key from X-API-Key header
 */
const authenticateAPIKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Missing X-API-Key header',
      });
    }

    // Look up API key in database
    const [keys] = await req.db.execute(
      'SELECT id, key_name, is_active, expires_at FROM api_keys WHERE api_key = ?',
      [apiKey]
    );

    if (keys.length === 0) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid API key',
      });
    }

    const keyRecord = keys[0];

    // Check if key is active
    if (!keyRecord.is_active) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'API key is inactive',
      });
    }

    // Check if key is expired
    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'API key has expired',
      });
    }

    // Update last_used_at timestamp (fire and forget)
    req.db.execute(
      'UPDATE api_keys SET last_used_at = NOW() WHERE id = ?',
      [keyRecord.id]
    ).catch(err => logError('Error updating API key last_used_at:', err));

    // Attach API key info to request
    req.apiKey = {
      id: keyRecord.id,
      keyName: keyRecord.key_name,
    };

    next();
  } catch (error) {
    logError('API key authentication error:', error);
    return res.status(500).json({
      error: 'Authentication error',
      message: 'An error occurred during authentication',
    });
  }
};

/**
 * Combined Authentication Middleware
 * Accepts either JWT or API key authentication
 * Tries JWT first, then falls back to API key
 */
const authenticateEither = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];

  // If both are provided, prefer JWT
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next);
  }

  if (apiKey) {
    return authenticateAPIKey(req, res, next);
  }

  // No authentication provided
  return res.status(401).json({
    error: 'Authentication required',
    message: 'Provide either Authorization header (Bearer token) or X-API-Key header',
  });
};

module.exports = {
  authenticateJWT,
  authenticateAPIKey,
  authenticateEither,
};